import { UnprocessableEntityException } from '@nestjs/common';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { InventoryMovementReason } from './enums/inventory-movement-reason.enum';
import { InventoryService } from './inventory.service';
import { InventoryPolicy } from './policies/inventory.policy';

describe('InventoryService', () => {
  const ref = { refType: 'order', refId: 'order-1', actorId: 'user-1' };

  const buildService = () => {
    // Variants by id, mutated by the fake manager's updates.
    const variants = new Map<string, Record<string, unknown>>();
    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };
    const manager = {
      createQueryBuilder: jest.fn(() => qb),
      findOne: jest.fn((_e: unknown, { where }: { where: { id: string } }) =>
        Promise.resolve(variants.get(where.id) ?? null),
      ),
      findOneOrFail: jest.fn(
        (_e: unknown, { where }: { where: { id: string } }) =>
          Promise.resolve(variants.get(where.id)),
      ),
      update: jest.fn((_e: unknown, id: string, changes: object) => {
        Object.assign(variants.get(id) ?? {}, changes);
        return Promise.resolve({ affected: 1 });
      }),
      insert: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      transaction: jest.fn((cb: (m: typeof manager) => Promise<unknown>) =>
        cb(manager),
      ),
    };
    const service = new InventoryService(
      {} as never,
      {} as never,
      dataSource as never,
      new InventoryPolicy(),
    );
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    const addVariant = (v: Record<string, unknown>) =>
      variants.set(v.id as string, { ...v });
    type Row = {
      variant_id: string;
      reason: InventoryMovementReason;
      onHandDelta: number;
      reservedDelta: number;
    };
    const movements = (): Row[] =>
      (manager.insert.mock.calls as [unknown, Row | Row[]][])
        .filter(([e]) => e === InventoryMovement)
        .flatMap(([, rows]) => (Array.isArray(rows) ? rows : [rows]));
    return { service, manager, qb, variants, addVariant, movements };
  };

  describe('reserve', () => {
    it('moves stock to reserved with a guarded update and logs it', async () => {
      const ctx = buildService();
      ctx.qb.execute.mockResolvedValue({ affected: 1, raw: [{ sku: 'A' }] });

      await ctx.service.reserve(
        ctx.manager as never,
        [{ variantId: 'v-a', quantity: 3 }],
        ref,
      );

      expect(ctx.qb.where).toHaveBeenCalledWith(
        'id = :id AND stock >= :qty AND "isActive" = true',
        { id: 'v-a', qty: 3 },
      );
      const set = (ctx.qb.set.mock.calls as unknown[][])[0][0] as Record<
        string,
        () => string
      >;
      expect(set.stock()).toBe('stock - :qty');
      expect(set.reserved()).toBe('reserved + :qty');
      expect(ctx.movements()).toEqual([
        expect.objectContaining({
          variant_id: 'v-a',
          sku: 'A',
          reason: InventoryMovementReason.ORDER_RESERVE,
          onHandDelta: 0,
          reservedDelta: 3,
          refType: 'order',
          refId: 'order-1',
          actorId: 'user-1',
        }),
      ]);
    });

    it('merges repeated variants and locks in id order', async () => {
      const ctx = buildService();
      ctx.qb.execute.mockResolvedValue({ affected: 1, raw: [{ sku: 'X' }] });

      await ctx.service.reserve(
        ctx.manager as never,
        [
          { variantId: 'v-z', quantity: 1 },
          { variantId: 'v-a', quantity: 1 },
          { variantId: 'v-z', quantity: 2 },
        ],
        ref,
      );

      expect(
        (ctx.qb.where.mock.calls as [string, unknown][]).map(([, p]) => p),
      ).toEqual([
        { id: 'v-a', qty: 1 },
        { id: 'v-z', qty: 3 },
      ]);
    });

    it('reports insufficient stock', async () => {
      const ctx = buildService();
      ctx.qb.execute.mockResolvedValue({ affected: 0, raw: [] });
      ctx.addVariant({ id: 'v-a', sku: 'SKU-A', isActive: true });

      await expect(
        ctx.service.reserve(
          ctx.manager as never,
          [{ variantId: 'v-a', quantity: 3 }],
          ref,
        ),
      ).rejects.toThrow(
        new UnprocessableEntityException(
          'Insufficient stock for variant SKU-A',
        ),
      );
      expect(ctx.manager.insert).not.toHaveBeenCalled();
    });

    it('reports a variant deactivated mid-checkout', async () => {
      const ctx = buildService();
      ctx.qb.execute.mockResolvedValue({ affected: 0, raw: [] });
      ctx.addVariant({ id: 'v-a', sku: 'SKU-A', isActive: false });

      await expect(
        ctx.service.reserve(
          ctx.manager as never,
          [{ variantId: 'v-a', quantity: 1 }],
          ref,
        ),
      ).rejects.toThrow('Variant SKU-A is no longer available');
    });
  });

  describe('release', () => {
    it('moves reserved back to available under a row lock', async () => {
      const ctx = buildService();
      ctx.addVariant({ id: 'v-a', sku: 'A', stock: 5, reserved: 3 });

      await ctx.service.release(
        ctx.manager as never,
        [{ variantId: 'v-a', quantity: 3 }],
        ref,
      );

      expect(ctx.manager.findOne).toHaveBeenCalledWith(ProductVariant, {
        where: { id: 'v-a' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(ctx.variants.get('v-a')).toEqual(
        expect.objectContaining({ stock: 8, reserved: 0 }),
      );
      expect(ctx.movements()).toEqual([
        expect.objectContaining({
          reason: InventoryMovementReason.ORDER_RELEASE,
          onHandDelta: 0,
          reservedDelta: -3,
        }),
      ]);
    });

    it('records a reservation shortfall as found stock instead of failing', async () => {
      const ctx = buildService();
      ctx.addVariant({ id: 'v-a', sku: 'A', stock: 5, reserved: 1 });

      await ctx.service.release(
        ctx.manager as never,
        [{ variantId: 'v-a', quantity: 3 }],
        ref,
      );

      expect(ctx.variants.get('v-a')).toEqual(
        expect.objectContaining({ stock: 8, reserved: 0 }),
      );
      // available +3 = on hand +2 and reserved -1, so the ledger still balances.
      expect(ctx.movements()).toEqual([
        expect.objectContaining({ onHandDelta: 2, reservedDelta: -1 }),
      ]);
    });

    it('skips variants that no longer exist', async () => {
      const ctx = buildService();

      await ctx.service.release(
        ctx.manager as never,
        [{ variantId: 'gone', quantity: 1 }],
        ref,
      );

      expect(ctx.manager.update).not.toHaveBeenCalled();
      expect(ctx.manager.insert).not.toHaveBeenCalled();
    });
  });

  describe('ship', () => {
    it('consumes the reservation and returns the average cost', async () => {
      const ctx = buildService();
      ctx.addVariant({
        id: 'v-a',
        sku: 'A',
        stock: 5,
        reserved: 2,
        avgCost: 85,
      });

      const costs = await ctx.service.ship(
        ctx.manager as never,
        [{ variantId: 'v-a', quantity: 2 }],
        ref,
      );

      expect(costs.get('v-a')).toBe(85);
      expect(ctx.variants.get('v-a')).toEqual(
        expect.objectContaining({ stock: 5, reserved: 0 }),
      );
      expect(ctx.movements()).toEqual([
        expect.objectContaining({
          reason: InventoryMovementReason.ORDER_SHIP,
          onHandDelta: -2,
          reservedDelta: -2,
        }),
      ]);
    });

    it('takes unreserved units from available stock', async () => {
      const ctx = buildService();
      ctx.addVariant({ id: 'v-a', sku: 'A', stock: 5, reserved: 1 });

      await ctx.service.ship(
        ctx.manager as never,
        [{ variantId: 'v-a', quantity: 3 }],
        ref,
      );

      expect(ctx.variants.get('v-a')).toEqual(
        expect.objectContaining({ stock: 3, reserved: 0 }),
      );
      expect(ctx.movements()).toEqual([
        expect.objectContaining({ onHandDelta: -3, reservedDelta: -1 }),
      ]);
    });

    it('refuses to ship more than is in the warehouse', async () => {
      const ctx = buildService();
      ctx.addVariant({ id: 'v-a', sku: 'A', stock: 0, reserved: 1 });

      await expect(
        ctx.service.ship(
          ctx.manager as never,
          [{ variantId: 'v-a', quantity: 2 }],
          ref,
        ),
      ).rejects.toThrow('Not enough stock to ship variant A');
    });
  });

  it('receive adds stock and updates the average cost', async () => {
    const ctx = buildService();
    ctx.addVariant({
      id: 'v-a',
      sku: 'A',
      stock: 6,
      reserved: 4,
      avgCost: 100,
    });

    await ctx.service.receive(
      ctx.manager as never,
      { variantId: 'v-a', quantity: 30, unitCost: 120 },
      { refType: 'stock_receipt', refId: 'rcv-1' },
    );

    // On hand 10 @ 100 + 30 @ 120 → 115
    expect(ctx.variants.get('v-a')).toEqual(
      expect.objectContaining({ stock: 36, reserved: 4, avgCost: 115 }),
    );
    expect(ctx.movements()).toEqual([
      expect.objectContaining({
        reason: InventoryMovementReason.PURCHASE_IN,
        onHandDelta: 30,
        reservedDelta: 0,
        refType: 'stock_receipt',
        refId: 'rcv-1',
      }),
    ]);
  });

  describe('adjust', () => {
    it('applies a stocktake count as an on-hand delta', async () => {
      const ctx = buildService();
      ctx.addVariant({ id: 'v-a', sku: 'A', stock: 8, reserved: 2 });

      await ctx.service.adjust({
        variantId: 'v-a',
        onHand: 7,
        note: 'count',
        actorId: 'admin-1',
      });

      expect(ctx.variants.get('v-a')).toEqual(
        expect.objectContaining({ stock: 5, reserved: 2 }),
      );
      expect(ctx.movements()).toEqual([
        expect.objectContaining({
          reason: InventoryMovementReason.ADJUSTMENT,
          onHandDelta: -3,
          reservedDelta: 0,
          actorId: 'admin-1',
          note: 'count',
        }),
      ]);
    });

    it('throws for an unknown variant', async () => {
      const ctx = buildService();
      await expect(
        ctx.service.adjust({
          variantId: 'x',
          delta: 1,
          note: 'n',
          actorId: 'a',
        }),
      ).rejects.toThrow('Variant not found');
    });
  });

  it('setAvailable records the difference and skips no-ops', async () => {
    const ctx = buildService();
    const variant = { id: 'v-a', sku: 'A', stock: 3, reserved: 1 };
    ctx.addVariant(variant);

    await ctx.service.setAvailable(
      ctx.manager as never,
      variant as never,
      3,
      null,
    );
    expect(ctx.manager.insert).not.toHaveBeenCalled();

    await ctx.service.setAvailable(
      ctx.manager as never,
      variant as never,
      10,
      null,
    );
    expect(ctx.variants.get('v-a')).toEqual(
      expect.objectContaining({ stock: 10 }),
    );
    expect(ctx.movements()).toEqual([
      expect.objectContaining({ onHandDelta: 7, reservedDelta: 0 }),
    ]);
  });

  it('recordInitialStock writes one row per variant that has stock', async () => {
    const ctx = buildService();

    await ctx.service.recordInitialStock(ctx.manager as never, [
      { id: 'v-a', sku: 'A', stock: 5 },
      { id: 'v-b', sku: 'B', stock: 0 },
    ]);

    expect(ctx.movements()).toEqual([
      expect.objectContaining({
        variant_id: 'v-a',
        reason: InventoryMovementReason.INITIAL_STOCK,
        onHandDelta: 5,
      }),
    ]);
  });

  it('restock puts returned goods back on hand and on sale', async () => {
    const ctx = buildService();
    ctx.addVariant({ id: 'v-a', sku: 'A', stock: 3, reserved: 1 });

    await ctx.service.restock(
      ctx.manager as never,
      [
        { variantId: 'v-a', quantity: 2 },
        { variantId: 'gone', quantity: 1 },
      ],
      ref,
    );

    expect(ctx.variants.get('v-a')).toEqual(
      expect.objectContaining({ stock: 5, reserved: 1 }),
    );
    expect(ctx.movements()).toEqual([
      expect.objectContaining({
        variant_id: 'v-a',
        reason: InventoryMovementReason.RETURN_RESTOCK,
        onHandDelta: 2,
        reservedDelta: 0,
      }),
    ]);
  });
});
