import { OrderPolicy } from './policies/order.policy';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { CartItem } from '@/carts/entities/cart-item.entity';
import { Payment } from '@/payments/entities/payment.entity';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { OrderSortField, SortOrder } from './dto/order-list-query.dto';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { OrderStatus } from './enums/order-status.enum';
import { OrderStatusChangeActor } from './enums/order-status-change-actor.enum';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const SHIPPING = 5;

  const variant = (overrides: object = {}) => ({
    id: 'variant-a',
    sku: 'SKU-A',
    name: 'M',
    price: '19.99',
    isActive: true,
    product: { id: 'product-1', name: 'Áo thun', category_id: 'cat-1' },
    ...overrides,
  });

  const buildService = () => {
    // Mutable "DB" state the fake EntityManager reads from.
    const state: {
      order: Record<string, unknown> | null;
      payment: object | null;
      variant: object | null;
    } = {
      order: null,
      payment: null,
      variant: null,
    };

    // Payment voiding on cancel/expiry/edit.
    const paymentQb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
    };

    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue(paymentQb),
      findOne: jest.fn((entity: unknown) => {
        if (entity === Order) return Promise.resolve(state.order);
        if (entity === Payment) return Promise.resolve(state.payment);
        if (entity === ProductVariant) return Promise.resolve(state.variant);
        return Promise.resolve(null);
      }),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((_entity: unknown, data: object) => ({ ...data })),
      save: jest.fn((entity: unknown, data: object) => {
        if (entity === Order && !Array.isArray(data)) {
          const saved = { id: 'order-1', ...data };
          state.order = { items: [], discounts: [], ...saved };
          return Promise.resolve(saved);
        }
        return Promise.resolve(data);
      }),
      query: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      increment: jest.fn().mockResolvedValue(undefined),
      transaction: jest.fn(),
    };
    manager.transaction.mockImplementation(
      (cb: (m: typeof manager) => Promise<unknown>) => cb(manager),
    );

    const listQb = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const orderRepo = {
      manager,
      createQueryBuilder: jest.fn().mockReturnValue(listQb),
    };
    const addressRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'address-1' }),
    };
    const variantRepo = {
      find: jest.fn().mockResolvedValue([variant()]),
    };
    const statusHistoryRepo = { find: jest.fn().mockResolvedValue([]) };
    const paymentRepo = {};
    const dataSource = {
      transaction: jest.fn((cb: (m: typeof manager) => Promise<unknown>) =>
        cb(manager),
      ),
    };
    const discountsService = {
      resolveCode: jest.fn(),
      quote: jest.fn(),
      redeem: jest.fn().mockResolvedValue(undefined),
      releaseForOrder: jest.fn().mockResolvedValue(undefined),
      reinstateForOrder: jest.fn().mockResolvedValue(undefined),
      updateRedemptionAmount: jest.fn().mockResolvedValue(undefined),
    };
    const configService = {
      getAppConfig: () => ({ shippingFlatFee: SHIPPING }),
      getShippingConfig: () => ({ freeShippingThreshold: 0 }),
    };
    const cartsService = { getCart: jest.fn() };
    const outboxService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const shippingRates = {
      quote: jest.fn(
        (p: { weightGrams: number }): Promise<object> =>
          Promise.resolve({
            fee: SHIPPING,
            standardFee: SHIPPING,
            zone: 'inter_province',
            weightGrams: p.weightGrams,
            freeShipping: null,
          }),
      ),
      weightOf: jest.fn(
        (lines: { weightGrams: number | null; quantity: number }[]) =>
          lines.reduce((s, l) => s + (l.weightGrams ?? 500) * l.quantity, 0),
      ),
    };
    const inventoryService = {
      reserve: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      ship: jest.fn().mockResolvedValue(new Map()),
    };

    const service = new OrdersService(
      orderRepo as never,
      addressRepo as never,
      variantRepo as never,
      statusHistoryRepo as never,
      paymentRepo as never,
      dataSource as never,
      discountsService as never,
      configService as never,
      cartsService as never,
      new OrderPolicy(),
      inventoryService as never,
      outboxService as never,
      shippingRates as never,
    );
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

    return {
      service,
      state,
      manager,
      paymentQb,
      inventoryService,
      orderRepo,
      listQb,
      addressRepo,
      variantRepo,
      statusHistoryRepo,
      dataSource,
      discountsService,
      cartsService,
      outboxService,
      shippingRates,
    };
  };

  const flush = () => new Promise((r) => setImmediate(r));

  // Outbox events published in the operation's transaction, by type.
  const published = (
    ctx: { outboxService: { enqueue: jest.Mock } },
    type: string,
  ) =>
    (ctx.outboxService.enqueue.mock.calls as [unknown, { type: string }][])
      .filter(([, e]) => e.type === type)
      .map(([manager, e]) => ({ manager, ...e }));

  const savedCalls = (manager: { save: jest.Mock }, entity: unknown) =>
    manager.save.mock.calls
      .filter(([e]) => e === entity)
      .map(([, data]) => data as Record<string, unknown>);

  describe('create', () => {
    const dto = {
      address_id: 'address-1',
      items: [{ variant_id: 'variant-a', quantity: 3 }],
    };

    it('persists the order with exact money math, items and history', async () => {
      const ctx = buildService();

      const order = await ctx.service.create('user-1', dto);

      // 19.99 * 3 = 59.97 (not 59.96999…), + 5 shipping
      const [saved] = savedCalls(ctx.manager, Order);
      expect(saved).toEqual(
        expect.objectContaining({
          user_id: 'user-1',
          address_id: 'address-1',
          status: OrderStatus.PENDING,
          subtotal: 59.97,
          shippingFee: SHIPPING,
          discount: 0,
          total: 64.97,
          notes: null,
          orderNumber: expect.stringMatching(
            /^ORD-\d{8}-[A-Z0-9]{1,6}$/,
          ) as unknown,
        }),
      );
      expect(savedCalls(ctx.manager, OrderItem)[0]).toEqual([
        {
          variant_id: 'variant-a',
          productName: 'Áo thun',
          variantName: 'M',
          unitPrice: 19.99,
          quantity: 3,
          total: 59.97,
          discountAmount: 0,
          shippingAmount: SHIPPING,
          paidAmount: 64.97,
          order_id: 'order-1',
        },
      ]);
      expect(savedCalls(ctx.manager, OrderStatusHistory)[0]).toEqual({
        order_id: 'order-1',
        fromStatus: null,
        toStatus: OrderStatus.PENDING,
        changedByType: OrderStatusChangeActor.CUSTOMER,
        changedById: 'user-1',
        note: null,
      });
      expect(order).toEqual(expect.objectContaining({ id: 'order-1' }));
      expect(ctx.manager.delete).not.toHaveBeenCalledWith(
        CartItem,
        expect.anything(),
      );
    });

    it('reserves stock for the order lines in the same transaction', async () => {
      const ctx = buildService();

      await ctx.service.create('user-1', dto);

      expect(ctx.inventoryService.reserve).toHaveBeenCalledWith(
        ctx.manager,
        [{ variantId: 'variant-a', quantity: 3 }],
        { refType: 'order', refId: 'order-1', actorId: 'user-1' },
      );
    });

    it('reserves every line of a multi-line order', async () => {
      const ctx = buildService();
      ctx.variantRepo.find.mockResolvedValue([
        variant({ id: 'variant-z', sku: 'Z' }),
        variant({ id: 'variant-a', sku: 'A' }),
      ]);

      await ctx.service.create('user-1', {
        address_id: 'address-1',
        items: [
          { variant_id: 'variant-z', quantity: 1 },
          { variant_id: 'variant-a', quantity: 2 },
        ],
      });

      // Lock ordering is InventoryService's job; the order passes all lines.
      expect(ctx.inventoryService.reserve).toHaveBeenCalledWith(
        ctx.manager,
        [
          { variantId: 'variant-z', quantity: 1 },
          { variantId: 'variant-a', quantity: 2 },
        ],
        expect.anything(),
      );
    });

    it('applies a discount code and records its usage', async () => {
      const ctx = buildService();
      const code = { id: 'd-1' };
      ctx.discountsService.resolveCode.mockResolvedValue(code);
      ctx.discountsService.quote.mockResolvedValue({
        amount: 10,
        lineAmounts: [10],
      });

      await ctx.service.create('user-1', { ...dto, discountCode: 'SALE10' });

      expect(ctx.discountsService.resolveCode).toHaveBeenCalledWith(
        'SALE10',
        59.97,
        'user-1',
      );
      expect(ctx.discountsService.quote).toHaveBeenCalledWith(
        code,
        [{ productId: 'product-1', categoryId: 'cat-1', amount: 59.97 }],
        undefined,
      );
      expect(savedCalls(ctx.manager, Order)[0]).toEqual(
        expect.objectContaining({ discount: 10, total: 54.97 }),
      );
      expect(savedCalls(ctx.manager, OrderItem)[0]).toEqual([
        expect.objectContaining({
          discountAmount: 10,
          shippingAmount: SHIPPING,
          paidAmount: 54.97,
        }),
      ]);
      expect(ctx.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO "order_discount"'),
        ['order-1', 'd-1'],
      );
      expect(ctx.discountsService.redeem).toHaveBeenCalledWith(ctx.manager, {
        discount: code,
        orderId: 'order-1',
        userId: 'user-1',
        amount: 10,
      });
    });

    it('allocates a scoped discount and shipping per line so lines sum to the total', async () => {
      const ctx = buildService();
      ctx.variantRepo.find.mockResolvedValue([
        variant({ id: 'variant-a', price: '100.00' }),
        variant({ id: 'variant-b', price: '300.00' }),
      ]);
      ctx.discountsService.resolveCode.mockResolvedValue({ id: 'd-1' });
      // The code only covers the second line.
      ctx.discountsService.quote.mockResolvedValue({
        amount: 30,
        lineAmounts: [0, 30],
      });

      await ctx.service.create('user-1', {
        address_id: 'address-1',
        discountCode: 'SCOPED',
        items: [
          { variant_id: 'variant-a', quantity: 1 },
          { variant_id: 'variant-b', quantity: 1 },
        ],
      });

      const items = savedCalls(ctx.manager, OrderItem)[0] as unknown as {
        discountAmount: number;
        shippingAmount: number;
        paidAmount: number;
      }[];
      expect(items).toEqual([
        expect.objectContaining({
          discountAmount: 0,
          shippingAmount: 1.25,
          paidAmount: 101.25,
        }),
        expect.objectContaining({
          discountAmount: 30,
          shippingAmount: 3.75,
          paidAmount: 273.75,
        }),
      ]);
      const [order] = savedCalls(ctx.manager, Order);
      expect(order.total).toBe(375);
      expect(items[0].paidAmount + items[1].paidAmount).toBe(order.total);
    });

    it('publishes order.placed in the same transaction (no status-changed event)', async () => {
      const ctx = buildService();

      await ctx.service.create('user-1', dto);

      expect(published(ctx, 'order.placed')).toEqual([
        {
          manager: ctx.manager,
          type: 'order.placed',
          aggregateType: 'order',
          aggregateId: 'order-1',
          payload: { orderId: 'order-1' },
        },
      ]);
      expect(published(ctx, 'order.status_changed')).toEqual([]);
    });

    it('snapshots the delivery address onto the order', async () => {
      const ctx = buildService();
      ctx.addressRepo.findOne.mockResolvedValue({
        id: 'address-1',
        fullName: 'An',
        phone: '0900',
        addressLine1: '1 Lê Lợi',
        addressLine2: null,
        city: 'Q1',
        province: 'HCM',
        country: 'VN',
        postalCode: null,
        districtCode: '1442',
        wardCode: '20109',
        isDefault: true,
      });

      await ctx.service.create('user-1', dto);

      expect(savedCalls(ctx.manager, Order)[0].shippingAddress).toEqual({
        fullName: 'An',
        phone: '0900',
        addressLine1: '1 Lê Lợi',
        addressLine2: null,
        city: 'Q1',
        province: 'HCM',
        country: 'VN',
        postalCode: null,
        districtCode: '1442',
        wardCode: '20109',
      });
    });

    it('charges shipping from the rate table for the order weight', async () => {
      const ctx = buildService();
      ctx.variantRepo.find.mockResolvedValue([variant({ weightGrams: 300 })]);
      ctx.shippingRates.quote.mockResolvedValueOnce({
        fee: 27000,
        standardFee: 27000,
        zone: 'inter_province',
        weightGrams: 900,
        freeShipping: null,
      });

      await ctx.service.create('user-1', dto);

      expect(ctx.shippingRates.quote).toHaveBeenCalledWith({
        province: undefined,
        weightGrams: 900,
        subtotal: 59.97,
      });
      expect(savedCalls(ctx.manager, Order)[0]).toEqual(
        expect.objectContaining({ shippingFee: 27000, weightGrams: 900 }),
      );
    });

    it('waives shipping for a free-shipping code and records the waived fee', async () => {
      const ctx = buildService();
      const code = { id: 'd-ship', type: 'free_shipping' };
      ctx.discountsService.resolveCode.mockResolvedValue(code);

      await ctx.service.create('user-1', { ...dto, discountCode: 'FREESHIP' });

      expect(ctx.discountsService.quote).not.toHaveBeenCalled();
      expect(savedCalls(ctx.manager, Order)[0]).toEqual(
        expect.objectContaining({ shippingFee: 0, discount: 0, total: 59.97 }),
      );
      expect(savedCalls(ctx.manager, OrderItem)[0]).toEqual([
        expect.objectContaining({ shippingAmount: 0, paidAmount: 59.97 }),
      ]);
      expect(ctx.discountsService.redeem).toHaveBeenCalledWith(
        ctx.manager,
        expect.objectContaining({ discount: code, amount: SHIPPING }),
      );
    });

    describe('idempotency key', () => {
      it('returns the order an earlier request with the same key placed', async () => {
        const ctx = buildService();
        ctx.state.order = { id: 'order-9', items: [] };
        const findOne = jest.fn().mockResolvedValue({ id: 'order-9' });
        Object.assign(ctx.orderRepo, { findOne });

        const order = await ctx.service.create('user-1', dto, 'key-1');

        expect(findOne).toHaveBeenCalledWith({
          where: { user_id: 'user-1', idempotencyKey: 'key-1' },
        });
        expect(order).toEqual(expect.objectContaining({ id: 'order-9' }));
        expect(ctx.dataSource.transaction).not.toHaveBeenCalled();
      });

      it('stores the key on a new order', async () => {
        const ctx = buildService();
        Object.assign(ctx.orderRepo, {
          findOne: jest.fn().mockResolvedValue(null),
        });

        await ctx.service.create('user-1', dto, 'key-1');

        expect(savedCalls(ctx.manager, Order)[0].idempotencyKey).toBe('key-1');
      });

      it('returns the winner when a concurrent request with the key commits first', async () => {
        const ctx = buildService();
        const findOne = jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'order-7' });
        Object.assign(ctx.orderRepo, { findOne });
        ctx.dataSource.transaction.mockRejectedValueOnce(
          Object.assign(new QueryFailedError('INSERT', [], new Error('dup')), {
            code: '23505',
            constraint: 'UQ_orders_user_idempotency_key',
          }),
        );
        ctx.state.order = { id: 'order-7', items: [] };

        await expect(
          ctx.service.create('user-1', dto, 'key-1'),
        ).resolves.toEqual(expect.objectContaining({ id: 'order-7' }));
      });
    });

    it("rejects an address that isn't the user's before reading items", async () => {
      const ctx = buildService();
      ctx.addressRepo.findOne.mockResolvedValue(null);

      await expect(ctx.service.create('user-1', dto)).rejects.toThrow(
        'Address not found',
      );
      expect(ctx.addressRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'address-1', user_id: 'user-1' },
      });
      expect(ctx.variantRepo.find).not.toHaveBeenCalled();
    });

    it('rejects unknown and inactive variants', async () => {
      const ctx = buildService();
      ctx.variantRepo.find.mockResolvedValue([]);

      await expect(ctx.service.create('user-1', dto)).rejects.toThrow(
        'Variant variant-a not found',
      );

      ctx.variantRepo.find.mockResolvedValue([variant({ isActive: false })]);
      await expect(ctx.service.create('user-1', dto)).rejects.toThrow(
        'Variant SKU-A is inactive',
      );
      expect(ctx.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('fails the order when stock cannot be reserved and sends no email', async () => {
      const ctx = buildService();
      ctx.inventoryService.reserve.mockRejectedValue(
        new UnprocessableEntityException(
          'Insufficient stock for variant SKU-A',
        ),
      );

      await expect(ctx.service.create('user-1', dto)).rejects.toThrow(
        'Insufficient stock for variant SKU-A',
      );
      expect(ctx.outboxService.enqueue).not.toHaveBeenCalled();
    });

    describe('order number collisions', () => {
      const collision = () =>
        Object.assign(new QueryFailedError('INSERT', [], new Error('dup')), {
          code: '23505',
          detail: 'Key ("orderNumber")=(ORD-1) already exists.',
        });

      it('retries with a new order number', async () => {
        const ctx = buildService();
        const realSave = ctx.manager.save.getMockImplementation()!;
        ctx.manager.save.mockImplementationOnce((entity: unknown) => {
          if (entity === Order) return Promise.reject(collision());
          throw new Error('unexpected first save');
        });
        ctx.manager.save.mockImplementation(realSave);

        await expect(ctx.service.create('user-1', dto)).resolves.toBeDefined();
        expect(savedCalls(ctx.manager, Order)).toHaveLength(2);
        expect(jest.spyOn(ctx.service['logger'], 'warn')).toHaveBeenCalled();
      });

      it('gives up after 5 attempts', async () => {
        const ctx = buildService();
        const realSave = ctx.manager.save.getMockImplementation()!;
        ctx.manager.save.mockImplementation((entity: unknown, data: object) =>
          entity === Order
            ? Promise.reject(collision())
            : realSave(entity, data),
        );

        await expect(ctx.service.create('user-1', dto)).rejects.toBeInstanceOf(
          QueryFailedError,
        );
        expect(savedCalls(ctx.manager, Order)).toHaveLength(5);
      });

      it('does not retry other database errors', async () => {
        const ctx = buildService();
        const other = Object.assign(
          new QueryFailedError('INSERT', [], new Error('fk')),
          { code: '23503' },
        );
        ctx.manager.save.mockImplementationOnce(() => Promise.reject(other));

        await expect(ctx.service.create('user-1', dto)).rejects.toBe(other);
        expect(savedCalls(ctx.manager, Order)).toHaveLength(1);
      });
    });
  });

  describe('checkout', () => {
    const dto = { address_id: 'address-1' };

    it('creates the order from the cart and clears it', async () => {
      const ctx = buildService();
      ctx.cartsService.getCart.mockResolvedValue({
        id: 'cart-1',
        items: [{ variant_id: 'variant-a', quantity: 2 }],
      });

      await ctx.service.checkout('user-1', dto);

      expect(savedCalls(ctx.manager, Order)[0]).toEqual(
        expect.objectContaining({ subtotal: 39.98, total: 44.98 }),
      );
      expect(ctx.manager.delete).toHaveBeenCalledWith(CartItem, {
        cart_id: 'cart-1',
      });
    });

    it('rejects an empty cart', async () => {
      const ctx = buildService();
      ctx.cartsService.getCart.mockResolvedValue({ id: 'cart-1', items: [] });

      await expect(ctx.service.checkout('user-1', dto)).rejects.toThrow(
        'Cart is empty',
      );
    });

    it('validates the address before touching the cart', async () => {
      const ctx = buildService();
      ctx.addressRepo.findOne.mockResolvedValue(null);

      await expect(ctx.service.checkout('user-1', dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(ctx.cartsService.getCart).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('scopes non-admin queries to the requester, ignoring user_id', async () => {
      const ctx = buildService();

      await ctx.service.findAll({ user_id: 'other' }, 'user-1', false);

      expect(ctx.listQb.andWhere).toHaveBeenCalledWith('o.user_id = :userId', {
        userId: 'user-1',
      });
      expect(ctx.listQb.andWhere).toHaveBeenCalledTimes(1);
    });

    it('lets admins filter by any user', async () => {
      const ctx = buildService();

      await ctx.service.findAll({ user_id: 'other' }, undefined, true);

      expect(ctx.listQb.andWhere).toHaveBeenCalledWith('o.user_id = :userId', {
        userId: 'other',
      });
    });

    it('lets admins list all orders without a user filter', async () => {
      const ctx = buildService();

      await ctx.service.findAll({}, undefined, true);

      expect(ctx.listQb.andWhere).not.toHaveBeenCalled();
      expect(ctx.listQb.orderBy).toHaveBeenCalledWith('o.createdAt', 'DESC');
      expect(ctx.listQb.skip).toHaveBeenCalledWith(0);
      expect(ctx.listQb.take).toHaveBeenCalledWith(20);
    });

    it('applies status, order number, dates and sorting', async () => {
      const ctx = buildService();

      await ctx.service.findAll(
        {
          page: 2,
          limit: 10,
          status: OrderStatus.SHIPPED,
          order_number: 'ORD-2026',
          from_date: '2026-01-01',
          to_date: '2026-01-31',
          sort_by: OrderSortField.TOTAL,
          sort_order: SortOrder.ASC,
        },
        undefined,
        true,
      );

      expect(ctx.listQb.andWhere).toHaveBeenCalledWith('o.status = :status', {
        status: OrderStatus.SHIPPED,
      });
      expect(ctx.listQb.andWhere).toHaveBeenCalledWith(
        'o.orderNumber ILIKE :orderNumber',
        { orderNumber: '%ORD-2026%' },
      );
      expect(ctx.listQb.andWhere).toHaveBeenCalledWith(
        'o.createdAt >= :fromDate',
        { fromDate: '2026-01-01' },
      );
      // date-only upper bound includes the whole day
      expect(ctx.listQb.andWhere).toHaveBeenCalledWith(
        'o.createdAt <= :toDate',
        { toDate: '2026-01-31T23:59:59.999Z' },
      );
      expect(ctx.listQb.orderBy).toHaveBeenCalledWith('o.total', 'ASC');
      expect(ctx.listQb.skip).toHaveBeenCalledWith(10);
    });

    it('keeps a full timestamp upper bound as-is', async () => {
      const ctx = buildService();

      await ctx.service.findAll(
        { to_date: '2026-01-31T12:00:00Z' },
        undefined,
        true,
      );

      expect(ctx.listQb.andWhere).toHaveBeenCalledWith(
        'o.createdAt <= :toDate',
        { toDate: '2026-01-31T12:00:00Z' },
      );
    });
  });

  describe('findOne', () => {
    it('loads items, address and discounts', async () => {
      const ctx = buildService();
      ctx.state.order = { id: 'order-1', user_id: 'user-1' };

      await expect(ctx.service.findOne('order-1', 'user-1')).resolves.toBe(
        ctx.state.order,
      );
      expect(ctx.manager.findOne).toHaveBeenCalledWith(Order, {
        where: { id: 'order-1' },
        relations: ['items', 'address', 'discounts'],
      });
    });

    it("forbids reading another user's order", async () => {
      const ctx = buildService();
      ctx.state.order = { id: 'order-1', user_id: 'user-2' };

      await expect(ctx.service.findOne('order-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows admin reads without a user id', async () => {
      const ctx = buildService();
      ctx.state.order = { id: 'order-1', user_id: 'user-2' };

      await expect(ctx.service.findOne('order-1')).resolves.toBeDefined();
    });

    it('throws NotFoundException when missing', async () => {
      const ctx = buildService();

      await expect(ctx.service.findOne('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const pendingOrder = () => ({
      id: 'order-1',
      user_id: 'user-1',
      status: OrderStatus.PENDING,
      address_id: 'address-1',
      shippingFee: '5.00',
      subtotal: 19.99,
      discount: 0,
      total: 24.99,
      notes: null,
      items: [{ variant_id: 'variant-a', quantity: 1 }],
      discounts: [] as object[],
    });

    it('only allows editing pending orders', async () => {
      const ctx = buildService();
      ctx.state.order = { ...pendingOrder(), status: OrderStatus.CONFIRMED };

      await expect(
        ctx.service.update('order-1', 'user-1', { notes: 'x' }),
      ).rejects.toThrow('Cannot edit an order with status "confirmed"');
    });

    it('re-checks the status under the row lock before touching stock', async () => {
      const ctx = buildService();
      // Pending when first read, confirmed by the time the lock is taken.
      ctx.manager.findOne
        .mockResolvedValueOnce(pendingOrder())
        .mockResolvedValueOnce({
          ...pendingOrder(),
          status: OrderStatus.CONFIRMED,
        });

      await expect(
        ctx.service.update('order-1', 'user-1', {
          items: [{ variant_id: 'variant-a', quantity: 2 }],
        }),
      ).rejects.toThrow('Cannot edit an order with status "confirmed"');
      expect(ctx.inventoryService.release).not.toHaveBeenCalled();
    });

    it('updates notes and address without touching items or stock', async () => {
      const ctx = buildService();
      ctx.state.order = pendingOrder();

      await ctx.service.update('order-1', 'user-1', {
        address_id: 'address-2',
        notes: 'leave at door',
      });

      expect(ctx.addressRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'address-2', user_id: 'user-1' },
      });
      expect(ctx.inventoryService.release).not.toHaveBeenCalled();
      expect(ctx.inventoryService.reserve).not.toHaveBeenCalled();
      expect(ctx.manager.update).toHaveBeenCalledWith(
        Order,
        'order-1',
        expect.objectContaining({
          address_id: 'address-2',
          notes: 'leave at door',
          subtotal: 19.99,
          discount: 0,
          total: 24.99,
        }),
      );
    });

    it('re-prices shipping when the new address is in another zone', async () => {
      const ctx = buildService();
      ctx.state.order = { ...pendingOrder(), weightGrams: 500 };
      ctx.addressRepo.findOne.mockResolvedValue({
        id: 'address-2',
        province: 'Hà Nội',
      });
      ctx.shippingRates.quote.mockResolvedValueOnce({
        fee: 30,
        standardFee: 30,
        zone: 'inter_province',
        weightGrams: 500,
        freeShipping: null,
      });
      ctx.manager.find.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === OrderItem
            ? [{ id: 'item-1', total: '19.99', discountAmount: '0' }]
            : [],
        ),
      );

      await ctx.service.update('order-1', 'user-1', {
        address_id: 'address-2',
      });

      expect(ctx.shippingRates.quote).toHaveBeenCalledWith({
        province: 'Hà Nội',
        weightGrams: 500,
        subtotal: 19.99,
      });
      expect(ctx.manager.update).toHaveBeenCalledWith(OrderItem, 'item-1', {
        shippingAmount: 30,
        paidAmount: 49.99,
      });
      expect(ctx.manager.update).toHaveBeenCalledWith(
        Order,
        'order-1',
        expect.objectContaining({ shippingFee: 30, total: 49.99 }),
      );
      // Payments started for the old total no longer fit.
      expect(ctx.paymentQb.where).toHaveBeenCalledWith(expect.any(String), {
        orderId: 'order-1',
        pending: 'pending',
        reason: 'order_edited',
      });
    });

    it("rejects switching to an address that isn't the user's", async () => {
      const ctx = buildService();
      ctx.state.order = pendingOrder();
      ctx.addressRepo.findOne.mockResolvedValue(null);

      await expect(
        ctx.service.update('order-1', 'user-1', { address_id: 'address-2' }),
      ).rejects.toThrow('Address not found');
    });

    it('restores old stock, re-decrements, and recomputes totals for new items', async () => {
      const ctx = buildService();
      ctx.state.order = pendingOrder();

      await ctx.service.update('order-1', 'user-1', {
        items: [{ variant_id: 'variant-a', quantity: 2 }],
      });

      expect(ctx.inventoryService.release).toHaveBeenCalledWith(
        ctx.manager,
        [{ variantId: 'variant-a', quantity: 1 }],
        expect.objectContaining({ refType: 'order', refId: 'order-1' }),
      );
      expect(ctx.inventoryService.reserve).toHaveBeenCalledWith(
        ctx.manager,
        [{ variantId: 'variant-a', quantity: 2 }],
        { refType: 'order', refId: 'order-1', actorId: 'user-1' },
      );
      expect(ctx.paymentQb.where).toHaveBeenCalledWith(expect.any(String), {
        orderId: 'order-1',
        pending: 'pending',
        reason: 'order_edited',
      });
      // The old hold is given back before the new one is taken.
      expect(
        ctx.inventoryService.release.mock.invocationCallOrder[0],
      ).toBeLessThan(ctx.inventoryService.reserve.mock.invocationCallOrder[0]);
      expect(ctx.manager.delete).toHaveBeenCalledWith(OrderItem, {
        order_id: 'order-1',
      });
      expect(ctx.manager.update).toHaveBeenCalledWith(
        Order,
        'order-1',
        expect.objectContaining({ subtotal: 39.98, discount: 0, total: 44.98 }),
      );
    });

    it('recomputes attached discounts against the new subtotal', async () => {
      const ctx = buildService();
      ctx.state.order = {
        ...pendingOrder(),
        discounts: [{ id: 'd-1', code: 'SALE', minOrderValue: null }],
      };
      ctx.discountsService.quote.mockResolvedValue({
        amount: 4,
        lineAmounts: [4],
      });

      await ctx.service.update('order-1', 'user-1', {
        items: [{ variant_id: 'variant-a', quantity: 2 }],
      });

      expect(ctx.manager.update).toHaveBeenCalledWith(
        Order,
        'order-1',
        expect.objectContaining({ discount: 4, total: 40.98 }),
      );
      expect(savedCalls(ctx.manager, OrderItem)[0]).toEqual([
        expect.objectContaining({ discountAmount: 4, paidAmount: 40.98 }),
      ]);
      expect(ctx.discountsService.updateRedemptionAmount).toHaveBeenCalledWith(
        ctx.manager,
        'order-1',
        'd-1',
        4,
      );
    });

    it('rejects edits that drop below a discount minimum', async () => {
      const ctx = buildService();
      ctx.state.order = {
        ...pendingOrder(),
        discounts: [{ code: 'BIG', minOrderValue: '100.00' }],
      };

      await expect(
        ctx.service.update('order-1', 'user-1', {
          items: [{ variant_id: 'variant-a', quantity: 1 }],
        }),
      ).rejects.toThrow(
        'Order no longer meets the minimum value for discount code "BIG"',
      );
    });
  });

  describe('cancel', () => {
    const order = (status: OrderStatus, userId = 'user-1') => ({
      id: 'order-1',
      user_id: userId,
      status,
      orderNumber: 'ORD-1',
      items: [{ variant_id: 'variant-a', quantity: 2 }],
    });

    it.each([OrderStatus.PENDING, OrderStatus.CONFIRMED])(
      'cancels an unpaid %s order, restoring stock and recording history',
      async (status) => {
        const ctx = buildService();
        ctx.state.order = order(status);

        await ctx.service.cancel('order-1', 'user-1');
        await flush();

        expect(ctx.manager.findOne).toHaveBeenCalledWith(Order, {
          where: { id: 'order-1' },
          lock: { mode: 'pessimistic_write' },
        });
        expect(ctx.inventoryService.release).toHaveBeenCalledWith(
          ctx.manager,
          [{ variantId: 'variant-a', quantity: 2 }],
          {
            refType: 'order',
            refId: 'order-1',
            actorId: 'user-1',
            note: 'Cancelled by customer',
          },
        );
        expect(ctx.discountsService.releaseForOrder).toHaveBeenCalledWith(
          ctx.manager,
          'order-1',
        );
        // Open payments for a cancelled order are voided.
        expect(ctx.paymentQb.where).toHaveBeenCalledWith(
          'order_id = :orderId AND status = :pending',
          { orderId: 'order-1', pending: 'pending', reason: 'order_cancelled' },
        );
        expect(ctx.state.order.status).toBe(OrderStatus.CANCELLED);
        expect(savedCalls(ctx.manager, OrderStatusHistory)[0]).toEqual(
          expect.objectContaining({
            fromStatus: status,
            toStatus: OrderStatus.CANCELLED,
            changedByType: OrderStatusChangeActor.CUSTOMER,
            changedById: 'user-1',
          }),
        );
        expect(published(ctx, 'order.status_changed')).toEqual([
          expect.objectContaining({
            manager: ctx.manager,
            aggregateId: 'order-1',
            payload: {
              orderId: 'order-1',
              fromStatus: status,
              toStatus: OrderStatus.CANCELLED,
            },
          }),
        ]);
      },
    );

    it('refuses to cancel a paid order', async () => {
      const ctx = buildService();
      ctx.state.order = order(OrderStatus.CONFIRMED);
      ctx.state.payment = { id: 'payment-1' };

      await expect(ctx.service.cancel('order-1', 'user-1')).rejects.toThrow(
        /already been paid/,
      );
      expect(ctx.inventoryService.release).not.toHaveBeenCalled();
    });

    it.each([
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ])('refuses to cancel a %s order', async (status) => {
      const ctx = buildService();
      ctx.state.order = order(status);

      await expect(ctx.service.cancel('order-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it("forbids cancelling another user's order", async () => {
      const ctx = buildService();
      ctx.state.order = order(OrderStatus.PENDING, 'user-2');

      await expect(ctx.service.cancel('order-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException for a missing order', async () => {
      const ctx = buildService();

      await expect(ctx.service.cancel('x', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('loads items from the DB when the locked row has none attached', async () => {
      const ctx = buildService();
      ctx.state.order = { ...order(OrderStatus.PENDING), items: undefined };
      ctx.manager.find.mockResolvedValue([
        { variant_id: 'variant-a', quantity: 1 },
        { variant_id: null, quantity: 1 },
      ]);

      await ctx.service.cancel('order-1', 'user-1');

      expect(ctx.manager.find).toHaveBeenCalledWith(OrderItem, {
        where: { order_id: 'order-1' },
      });
      // Lines whose variant was deleted are skipped.
      expect(ctx.inventoryService.release).toHaveBeenCalledWith(
        ctx.manager,
        [{ variantId: 'variant-a', quantity: 1 }],
        expect.anything(),
      );
    });
  });

  describe('updateStatus', () => {
    const admin = {
      actorType: OrderStatusChangeActor.ADMIN,
      actorId: 'admin-1',
    };

    it.each([
      [OrderStatus.PENDING, OrderStatus.CONFIRMED],
      [OrderStatus.CONFIRMED, OrderStatus.PROCESSING],
    ])('allows %s -> %s', async (from, to) => {
      const ctx = buildService();
      ctx.state.order = { id: 'order-1', status: from, items: [] };

      await ctx.service.updateStatus(
        'order-1',
        { status: to, note: 'ok' },
        admin,
      );

      expect(ctx.state.order.status).toBe(to);
      expect(savedCalls(ctx.manager, OrderStatusHistory)[0]).toEqual(
        expect.objectContaining({
          fromStatus: from,
          toStatus: to,
          changedByType: OrderStatusChangeActor.ADMIN,
          changedById: 'admin-1',
          note: 'ok',
        }),
      );
      expect(ctx.inventoryService.release).not.toHaveBeenCalled();
    });

    it('restores stock when cancelling', async () => {
      const ctx = buildService();
      ctx.state.order = {
        id: 'order-1',
        status: OrderStatus.PROCESSING,
        items: [{ variant_id: 'variant-a', quantity: 3 }],
      };

      await ctx.service.updateStatus(
        'order-1',
        { status: OrderStatus.CANCELLED },
        admin,
      );

      expect(ctx.inventoryService.release).toHaveBeenCalledWith(
        ctx.manager,
        [{ variantId: 'variant-a', quantity: 3 }],
        {
          refType: 'order',
          refId: 'order-1',
          actorId: 'admin-1',
          note: 'Cancelled by staff',
        },
      );
      expect(ctx.discountsService.releaseForOrder).toHaveBeenCalledWith(
        ctx.manager,
        'order-1',
      );
    });

    it('does not release discount uses for non-cancelling transitions', async () => {
      const ctx = buildService();
      ctx.state.order = {
        id: 'order-1',
        status: OrderStatus.PENDING,
        items: [],
      };

      await ctx.service.updateStatus(
        'order-1',
        { status: OrderStatus.CONFIRMED },
        admin,
      );

      expect(ctx.discountsService.releaseForOrder).not.toHaveBeenCalled();
    });

    it('refuses to cancel a paid order and leaves stock untouched', async () => {
      const ctx = buildService();
      ctx.state.order = {
        id: 'order-1',
        status: OrderStatus.CONFIRMED,
        items: [{ variant_id: 'variant-a', quantity: 3 }],
      };
      ctx.state.payment = { id: 'payment-1' };

      await expect(
        ctx.service.updateStatus(
          'order-1',
          { status: OrderStatus.CANCELLED },
          admin,
        ),
      ).rejects.toThrow(/already been paid/);
      expect(ctx.inventoryService.release).not.toHaveBeenCalled();
      expect(ctx.state.order.status).toBe(OrderStatus.CONFIRMED);
    });

    it('does not check payments for non-cancel transitions', async () => {
      const ctx = buildService();
      ctx.state.order = { id: 'order-1', status: OrderStatus.CONFIRMED };
      ctx.state.payment = { id: 'payment-1' };

      await ctx.service.updateStatus(
        'order-1',
        { status: OrderStatus.PROCESSING },
        admin,
      );

      expect(ctx.state.order.status).toBe(OrderStatus.PROCESSING);
      expect(ctx.manager.findOne).not.toHaveBeenCalledWith(
        Payment,
        expect.anything(),
      );
    });

    it('throws NotFoundException for a missing order', async () => {
      const ctx = buildService();

      await expect(
        ctx.service.updateStatus('x', { status: OrderStatus.CONFIRMED }, admin),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('expiry of unpaid orders', () => {
    const cutoff = new Date('2026-11-28T10:00:00Z');
    const stale = (overrides: object = {}) => ({
      id: 'order-1',
      status: OrderStatus.PENDING,
      orderNumber: 'ORD-1',
      user_id: 'user-1',
      createdAt: new Date('2026-11-28T09:00:00Z'),
      items: [{ variant_id: 'variant-a', quantity: 2 }],
      ...overrides,
    });

    it('pre-filters pending orders past the cutoff without offline or paid payments', async () => {
      const ctx = buildService();
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
      };
      ctx.orderRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(
        ctx.service.findExpiredUnpaidOrderIds(cutoff, 50),
      ).resolves.toEqual(['a', 'b']);

      expect(qb.where).toHaveBeenCalledWith('o.status = :status', {
        status: OrderStatus.PENDING,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('o.createdAt < :cutoff', {
        cutoff,
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('NOT EXISTS'),
        {
          offline: ['cod', 'bank_transfer'],
          paid: ['completed', 'partially_refunded', 'refunded'],
        },
      );
      expect(qb.limit).toHaveBeenCalledWith(50);
    });

    it('cancels a stale unpaid order as the system, releasing stock and codes', async () => {
      const ctx = buildService();
      ctx.state.order = stale();

      await expect(ctx.service.expireUnpaid('order-1', cutoff)).resolves.toBe(
        true,
      );
      await flush();

      expect(ctx.manager.findOne).toHaveBeenCalledWith(Order, {
        where: { id: 'order-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(ctx.inventoryService.release).toHaveBeenCalledWith(
        ctx.manager,
        [{ variantId: 'variant-a', quantity: 2 }],
        expect.objectContaining({ refType: 'order', refId: 'order-1' }),
      );
      expect(ctx.discountsService.releaseForOrder).toHaveBeenCalledWith(
        ctx.manager,
        'order-1',
      );
      expect(ctx.paymentQb.where).toHaveBeenCalledWith(expect.any(String), {
        orderId: 'order-1',
        pending: 'pending',
        reason: 'order_expired',
      });
      expect(ctx.state.order.status).toBe(OrderStatus.CANCELLED);
      expect(savedCalls(ctx.manager, OrderStatusHistory)[0]).toEqual(
        expect.objectContaining({
          fromStatus: OrderStatus.PENDING,
          toStatus: OrderStatus.CANCELLED,
          changedByType: OrderStatusChangeActor.SYSTEM,
          changedById: null,
        }),
      );
      expect(published(ctx, 'order.status_changed')).toHaveLength(1);
    });

    it.each([
      ['confirmed meanwhile', stale({ status: OrderStatus.CONFIRMED }), []],
      [
        'not old enough',
        stale({ createdAt: new Date('2026-11-28T10:30:00Z') }),
        [],
      ],
      ['paid meanwhile', stale(), [{ method: 'stripe', status: 'completed' }]],
      [
        'paying cash on delivery',
        stale(),
        [{ method: 'cod', status: 'pending' }],
      ],
    ])('leaves the order alone when %s', async (_label, order, payments) => {
      const ctx = buildService();
      ctx.state.order = order;
      ctx.manager.find.mockResolvedValue(payments);

      await expect(ctx.service.expireUnpaid('order-1', cutoff)).resolves.toBe(
        false,
      );

      expect(ctx.inventoryService.release).not.toHaveBeenCalled();
      expect(ctx.state.order.status).toBe(order.status);
    });

    it('still expires when only a failed online payment exists', async () => {
      const ctx = buildService();
      ctx.state.order = stale({ items: [] });
      ctx.manager.find.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === Payment ? [{ method: 'stripe', status: 'failed' }] : [],
        ),
      );

      await expect(ctx.service.expireUnpaid('order-1', cutoff)).resolves.toBe(
        true,
      );
    });

    it('is a no-op for a missing order', async () => {
      const ctx = buildService();

      await expect(ctx.service.expireUnpaid('nope', cutoff)).resolves.toBe(
        false,
      );
    });
  });

  describe('applyShipmentProgress', () => {
    const admin = {
      actorType: OrderStatusChangeActor.ADMIN,
      actorId: 'admin-1',
    };
    const progress = (ctx: ReturnType<typeof buildService>, to: OrderStatus) =>
      ctx.service.applyShipmentProgress(
        ctx.manager as never,
        'order-1',
        to,
        admin,
      );

    it('ships the reservation and snapshots unit cost on hand-over', async () => {
      const ctx = buildService();
      ctx.state.order = {
        id: 'order-1',
        status: OrderStatus.PROCESSING,
        items: [
          { id: 'item-1', variant_id: 'variant-a', quantity: 2 },
          { id: 'item-2', variant_id: null, quantity: 1 },
        ],
      };
      ctx.inventoryService.ship.mockResolvedValue(new Map([['variant-a', 85]]));

      await progress(ctx, OrderStatus.SHIPPED);

      expect(ctx.inventoryService.ship).toHaveBeenCalledWith(
        ctx.manager,
        [{ variantId: 'variant-a', quantity: 2 }],
        { refType: 'order', refId: 'order-1', actorId: 'admin-1' },
      );
      expect(ctx.manager.update).toHaveBeenCalledWith(OrderItem, 'item-1', {
        unitCost: 85,
      });
      expect(ctx.state.order.status).toBe(OrderStatus.SHIPPED);
      expect(published(ctx, 'order.status_changed')).toHaveLength(1);
    });

    it('ships nothing again on a re-attempt after a failed delivery', async () => {
      const ctx = buildService();
      ctx.state.order = {
        id: 'order-1',
        status: OrderStatus.DELIVERY_FAILED,
        items: [{ id: 'item-1', variant_id: 'variant-a', quantity: 2 }],
      };

      await progress(ctx, OrderStatus.SHIPPED);

      expect(ctx.inventoryService.ship).not.toHaveBeenCalled();
      expect(ctx.state.order.status).toBe(OrderStatus.SHIPPED);
    });

    it('starts the return window on delivery', async () => {
      const ctx = buildService();
      ctx.state.order = {
        id: 'order-1',
        status: OrderStatus.SHIPPED,
        items: [],
      };

      await progress(ctx, OrderStatus.DELIVERED);

      expect(ctx.state.order.deliveredAt).toBeInstanceOf(Date);
      expect(ctx.inventoryService.ship).not.toHaveBeenCalled();
    });

    it('puts returned goods back on sale and publishes the refund trigger', async () => {
      const ctx = buildService();
      ctx.state.order = {
        id: 'order-1',
        status: OrderStatus.DELIVERY_FAILED,
        items: [{ id: 'item-1', variant_id: 'variant-a', quantity: 2 }],
      };
      const restock = jest.fn().mockResolvedValue(undefined);
      Object.assign(ctx.inventoryService, { restock });

      await progress(ctx, OrderStatus.RETURNED_TO_SENDER);

      expect(restock).toHaveBeenCalledWith(
        ctx.manager,
        [{ variantId: 'variant-a', quantity: 2 }],
        expect.objectContaining({ refType: 'order', refId: 'order-1' }),
      );
      expect(published(ctx, 'order.returned_to_sender')).toEqual([
        expect.objectContaining({
          manager: ctx.manager,
          payload: { orderId: 'order-1' },
        }),
      ]);
    });

    it('refuses moves a shipment cannot cause', async () => {
      const ctx = buildService();
      ctx.state.order = { id: 'order-1', status: OrderStatus.PENDING };

      await expect(progress(ctx, OrderStatus.SHIPPED)).rejects.toThrow(
        'Cannot move order from "pending" to "shipped" by shipment',
      );
    });

    it('is a no-op when the order is already there (repeated carrier update)', async () => {
      const ctx = buildService();
      ctx.state.order = { id: 'order-1', status: OrderStatus.SHIPPED };

      await progress(ctx, OrderStatus.SHIPPED);

      expect(ctx.manager.save).not.toHaveBeenCalled();
    });
  });

  describe('completeDelivered', () => {
    const cutoff = new Date('2026-11-21T00:00:00Z');

    it('completes a delivered order past the return window', async () => {
      const ctx = buildService();
      ctx.state.order = {
        id: 'order-1',
        status: OrderStatus.DELIVERED,
        deliveredAt: new Date('2026-11-10T00:00:00Z'),
      };
      ctx.manager.query.mockResolvedValue([]);

      await expect(
        ctx.service.completeDelivered('order-1', cutoff),
      ).resolves.toBe(true);

      expect(ctx.state.order.status).toBe(OrderStatus.COMPLETED);
      expect(ctx.state.order.completedAt).toBeInstanceOf(Date);
      expect(savedCalls(ctx.manager, OrderStatusHistory)[0]).toEqual(
        expect.objectContaining({
          fromStatus: OrderStatus.DELIVERED,
          toStatus: OrderStatus.COMPLETED,
          changedByType: OrderStatusChangeActor.SYSTEM,
        }),
      );
    });

    it('waits while a refund request is pending', async () => {
      const ctx = buildService();
      ctx.state.order = {
        id: 'order-1',
        status: OrderStatus.DELIVERED,
        deliveredAt: new Date('2026-11-10T00:00:00Z'),
      };
      ctx.manager.query.mockResolvedValue([{ '?column?': 1 }]);

      await expect(
        ctx.service.completeDelivered('order-1', cutoff),
      ).resolves.toBe(false);
      expect(ctx.state.order.status).toBe(OrderStatus.DELIVERED);
    });

    it.each([
      [
        'still inside the window',
        { deliveredAt: new Date('2026-11-25T00:00:00Z') },
      ],
      ['not delivered', { status: OrderStatus.SHIPPED }],
    ])('leaves an order alone when %s', async (_label, overrides) => {
      const ctx = buildService();
      ctx.state.order = {
        id: 'order-1',
        status: OrderStatus.DELIVERED,
        deliveredAt: new Date('2026-11-10T00:00:00Z'),
        ...overrides,
      };
      ctx.manager.query.mockResolvedValue([]);

      await expect(
        ctx.service.completeDelivered('order-1', cutoff),
      ).resolves.toBe(false);
    });
  });

  describe('confirmAfterPayment', () => {
    const system = { actorType: OrderStatusChangeActor.SYSTEM, note: 'paid' };

    it('confirms a pending order', async () => {
      const ctx = buildService();
      ctx.state.order = { id: 'order-1', status: OrderStatus.PENDING };

      const result = await ctx.service.confirmAfterPayment(
        'order-1',
        system,
        ctx.manager as never,
      );

      expect(result.outcome).toBe('confirmed');
      expect(result.fromStatus).toBe(OrderStatus.PENDING);
      expect(result.order.status).toBe(OrderStatus.CONFIRMED);
    });

    it('revives a cancelled order when its stock can be held again', async () => {
      const ctx = buildService();
      ctx.state.order = { id: 'order-1', status: OrderStatus.CANCELLED };
      ctx.manager.find.mockResolvedValue([
        { variant_id: 'variant-a', quantity: 2 },
      ]);

      const result = await ctx.service.confirmAfterPayment(
        'order-1',
        system,
        ctx.manager as never,
      );

      expect(result.outcome).toBe('revived');
      // Reserved inside a savepoint so a partial hold can roll back.
      expect(ctx.manager.transaction).toHaveBeenCalled();
      expect(ctx.inventoryService.reserve).toHaveBeenCalledWith(
        ctx.manager,
        [{ variantId: 'variant-a', quantity: 2 }],
        expect.objectContaining({ refType: 'order', refId: 'order-1' }),
      );
      expect(ctx.discountsService.reinstateForOrder).toHaveBeenCalledWith(
        ctx.manager,
        'order-1',
      );
      expect(ctx.state.order.status).toBe(OrderStatus.CONFIRMED);
      expect(savedCalls(ctx.manager, OrderStatusHistory)[0]).toEqual(
        expect.objectContaining({
          fromStatus: OrderStatus.CANCELLED,
          toStatus: OrderStatus.CONFIRMED,
          changedByType: OrderStatusChangeActor.SYSTEM,
          note: 'Revived: paid after cancellation. paid',
        }),
      );
    });

    it('leaves a cancelled order alone when the stock is gone', async () => {
      const ctx = buildService();
      ctx.state.order = { id: 'order-1', status: OrderStatus.CANCELLED };
      ctx.inventoryService.reserve.mockRejectedValue(
        new UnprocessableEntityException('Insufficient stock for variant A'),
      );

      const result = await ctx.service.confirmAfterPayment(
        'order-1',
        system,
        ctx.manager as never,
      );

      expect(result.outcome).toBe('not_revivable');
      expect(ctx.discountsService.reinstateForOrder).not.toHaveBeenCalled();
      expect(ctx.state.order.status).toBe(OrderStatus.CANCELLED);
    });

    it('rethrows unexpected errors while reserving', async () => {
      const ctx = buildService();
      ctx.state.order = { id: 'order-1', status: OrderStatus.CANCELLED };
      ctx.inventoryService.reserve.mockRejectedValue(new Error('db down'));

      await expect(
        ctx.service.confirmAfterPayment(
          'order-1',
          system,
          ctx.manager as never,
        ),
      ).rejects.toThrow('db down');
    });

    it.each([OrderStatus.CONFIRMED, OrderStatus.SHIPPED])(
      'does nothing to a %s order',
      async (status) => {
        const ctx = buildService();
        ctx.state.order = { id: 'order-1', status };

        const result = await ctx.service.confirmAfterPayment(
          'order-1',
          system,
          ctx.manager as never,
        );

        expect(result).toEqual(
          expect.objectContaining({ outcome: 'unchanged', fromStatus: null }),
        );
        expect(ctx.state.order.status).toBe(status);
      },
    );
  });

  describe('applyStatusChange', () => {
    const system = { actorType: OrderStatusChangeActor.SYSTEM, note: 'paid' };

    it('moves a pending order to confirmed in its own transaction and notifies', async () => {
      const ctx = buildService();
      ctx.state.order = { id: 'order-1', status: OrderStatus.PENDING };

      const result = await ctx.service.applyStatusChange(
        'order-1',
        OrderStatus.CONFIRMED,
        system,
      );
      await flush();

      expect(result.fromStatus).toBe(OrderStatus.PENDING);
      expect(ctx.dataSource.transaction).toHaveBeenCalled();
      expect(savedCalls(ctx.manager, OrderStatusHistory)[0]).toEqual(
        expect.objectContaining({
          changedByType: OrderStatusChangeActor.SYSTEM,
          changedById: null,
          note: 'paid',
        }),
      );
      expect(published(ctx, 'order.status_changed')).toHaveLength(1);
    });

    it("uses the caller's manager for the change and its event", async () => {
      const ctx = buildService();
      ctx.state.order = { id: 'order-1', status: OrderStatus.PENDING };

      await ctx.service.applyStatusChange(
        'order-1',
        OrderStatus.CONFIRMED,
        system,
        ctx.manager as never,
      );
      await flush();

      expect(ctx.dataSource.transaction).not.toHaveBeenCalled();
      expect(published(ctx, 'order.status_changed')[0].manager).toBe(
        ctx.manager,
      );
    });

    it('is a no-op when the order already has the target status', async () => {
      const ctx = buildService();
      ctx.state.order = { id: 'order-1', status: OrderStatus.CONFIRMED };

      await expect(
        ctx.service.applyStatusChange('order-1', OrderStatus.CONFIRMED, system),
      ).resolves.toEqual({ order: ctx.state.order, fromStatus: null });
      expect(ctx.manager.save).not.toHaveBeenCalled();
    });

    it.each([
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.CANCELLED,
    ])(
      'never moves a %s order backwards to confirmed (redelivered webhook)',
      async (status) => {
        const ctx = buildService();
        ctx.state.order = { id: 'order-1', status };

        const result = await ctx.service.applyStatusChange(
          'order-1',
          OrderStatus.CONFIRMED,
          system,
        );

        expect(result.fromStatus).toBeNull();
        expect(ctx.state.order.status).toBe(status);
        expect(ctx.manager.save).not.toHaveBeenCalled();
      },
    );

    it('applies non-confirm transitions such as refunds', async () => {
      const ctx = buildService();
      ctx.state.order = { id: 'order-1', status: OrderStatus.DELIVERED };

      const result = await ctx.service.applyStatusChange(
        'order-1',
        OrderStatus.PARTIALLY_REFUNDED,
        system,
      );

      expect(result.fromStatus).toBe(OrderStatus.DELIVERED);
      expect(ctx.state.order.status).toBe(OrderStatus.PARTIALLY_REFUNDED);
    });

    it('throws NotFoundException for a missing order', async () => {
      const ctx = buildService();

      await expect(
        ctx.service.applyStatusChange('x', OrderStatus.CONFIRMED, system),
      ).rejects.toThrow(NotFoundException);
    });
  });

  it('getStatusHistory checks ownership then lists history oldest first', async () => {
    const ctx = buildService();
    ctx.state.order = { id: 'order-1', user_id: 'user-1' };

    await ctx.service.getStatusHistory('order-1', 'user-1');

    expect(ctx.statusHistoryRepo.find).toHaveBeenCalledWith({
      where: { order_id: 'order-1' },
      order: { createdAt: 'ASC' },
    });

    ctx.state.order = { id: 'order-1', user_id: 'user-2' };
    await expect(
      ctx.service.getStatusHistory('order-1', 'user-1'),
    ).rejects.toThrow(ForbiddenException);
  });
});
