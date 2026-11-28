import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StockReceiptItem } from './entities/stock-receipt-item.entity';
import { StockReceipt } from './entities/stock-receipt.entity';
import { StockReceiptStatus } from './enums/stock-receipt-status.enum';
import { StockReceiptPolicy } from './policies/stock-receipt.policy';
import { StockReceiptsService } from './stock-receipts.service';

describe('StockReceiptsService', () => {
  const buildService = () => {
    const state: {
      receipt: Record<string, unknown> | null;
      items: Record<string, unknown>[];
    } = { receipt: null, items: [] };
    const receiptRepo = {
      create: jest.fn((d: object) => ({ ...d })),
      save: jest.fn((d: object) => Promise.resolve({ id: 'rcv-1', ...d })),
      findOne: jest.fn(() => Promise.resolve(state.receipt)),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const variantRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 'v-a', sku: 'A' },
        { id: 'v-b', sku: 'B' },
      ]),
    };
    const manager = {
      findOne: jest.fn((entity: unknown) =>
        Promise.resolve(entity === StockReceipt ? state.receipt : null),
      ),
      find: jest.fn((entity: unknown) =>
        Promise.resolve(entity === StockReceiptItem ? state.items : []),
      ),
      update: jest.fn((_e: unknown, _id: string, changes: object) => {
        Object.assign(state.receipt ?? {}, changes);
        return Promise.resolve({ affected: 1 });
      }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn((_e: unknown, d: unknown) => Promise.resolve(d)),
    };
    const dataSource = {
      transaction: jest.fn((cb: (m: typeof manager) => Promise<unknown>) =>
        cb(manager),
      ),
    };
    const inventoryService = {
      receive: jest.fn().mockResolvedValue(undefined),
    };
    const service = new StockReceiptsService(
      receiptRepo as never,
      variantRepo as never,
      dataSource as never,
      inventoryService as never,
      new StockReceiptPolicy(),
    );
    return { service, state, receiptRepo, manager, inventoryService };
  };

  const draft = () => ({
    id: 'rcv-1',
    code: 'RCV-1',
    status: StockReceiptStatus.DRAFT,
  });

  it('creates a draft with SKU snapshots and the total cost', async () => {
    const ctx = buildService();
    ctx.state.receipt = draft();

    await ctx.service.create(
      {
        supplier: 'NCC',
        items: [
          { variant_id: 'v-a', quantity: 10, unitCost: 19.99 },
          { variant_id: 'v-b', quantity: 3, unitCost: 5 },
        ],
      },
      'admin-1',
    );

    expect(ctx.receiptRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: expect.stringMatching(/^RCV-\d{8}-[A-Z0-9]+$/) as unknown,
        status: StockReceiptStatus.DRAFT,
        totalCost: 214.9,
        createdBy: 'admin-1',
        items: [
          { variant_id: 'v-a', sku: 'A', quantity: 10, unitCost: 19.99 },
          { variant_id: 'v-b', sku: 'B', quantity: 3, unitCost: 5 },
        ],
      }),
    );
  });

  it('rejects a variant listed twice', async () => {
    const ctx = buildService();
    await expect(
      ctx.service.create(
        {
          items: [
            { variant_id: 'v-a', quantity: 1, unitCost: 1 },
            { variant_id: 'v-a', quantity: 2, unitCost: 1 },
          ],
        },
        'admin-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an unknown variant', async () => {
    const ctx = buildService();
    await expect(
      ctx.service.create(
        { items: [{ variant_id: 'v-x', quantity: 1, unitCost: 1 }] },
        'admin-1',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('confirm books each item into stock in variant order, then marks it confirmed', async () => {
    const ctx = buildService();
    ctx.state.receipt = draft();
    ctx.state.items = [
      { variant_id: 'v-b', sku: 'B', quantity: 3, unitCost: '5.00' },
      { variant_id: 'v-a', sku: 'A', quantity: 10, unitCost: '19.99' },
    ];

    await ctx.service.confirm('rcv-1', 'admin-2');

    expect(ctx.manager.findOne).toHaveBeenCalledWith(StockReceipt, {
      where: { id: 'rcv-1' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(
      (ctx.inventoryService.receive.mock.calls as [unknown, unknown][]).map(
        ([, line]) => line,
      ),
    ).toEqual([
      { variantId: 'v-a', quantity: 10, unitCost: 19.99 },
      { variantId: 'v-b', quantity: 3, unitCost: 5 },
    ]);
    expect(ctx.inventoryService.receive).toHaveBeenCalledWith(
      ctx.manager,
      expect.anything(),
      {
        refType: 'stock_receipt',
        refId: 'rcv-1',
        actorId: 'admin-2',
        note: 'RCV-1',
      },
    );
    expect(ctx.state.receipt).toEqual(
      expect.objectContaining({
        status: StockReceiptStatus.CONFIRMED,
        confirmedBy: 'admin-2',
      }),
    );
  });

  it.each(['confirm', 'cancel'] as const)(
    '%s only works on drafts',
    async (method) => {
      const ctx = buildService();
      ctx.state.receipt = { ...draft(), status: StockReceiptStatus.CONFIRMED };

      await expect(
        (ctx.service[method] as (id: string, a?: string) => Promise<unknown>)(
          'rcv-1',
          'admin-1',
        ),
      ).rejects.toThrow(
        'Stock receipt RCV-1 is confirmed; only drafts can be changed',
      );
      expect(ctx.inventoryService.receive).not.toHaveBeenCalled();
    },
  );

  it('update replaces the items and the total of a draft', async () => {
    const ctx = buildService();
    ctx.state.receipt = draft();

    await ctx.service.update('rcv-1', {
      items: [{ variant_id: 'v-a', quantity: 2, unitCost: 7.5 }],
    });

    expect(ctx.manager.delete).toHaveBeenCalledWith(StockReceiptItem, {
      receipt_id: 'rcv-1',
    });
    expect(ctx.manager.save).toHaveBeenCalledWith(StockReceiptItem, [
      {
        variant_id: 'v-a',
        sku: 'A',
        quantity: 2,
        unitCost: 7.5,
        receipt_id: 'rcv-1',
      },
    ]);
    expect(ctx.manager.update).toHaveBeenCalledWith(StockReceipt, 'rcv-1', {
      totalCost: 15,
    });
  });

  it('refuses to confirm an item whose variant was deleted', async () => {
    const ctx = buildService();
    ctx.state.receipt = draft();
    ctx.state.items = [
      { variant_id: null, sku: 'GONE', quantity: 1, unitCost: '1' },
    ];

    await expect(ctx.service.confirm('rcv-1', 'admin-1')).rejects.toThrow(
      'Variant GONE was deleted; remove it from the receipt first',
    );
  });
});
