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
    product: { name: 'Áo thun' },
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

    const stockQb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const manager = {
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
      createQueryBuilder: jest.fn().mockReturnValue(stockQb),
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
      computeAmount: jest.fn(),
      incrementUsedCount: jest.fn().mockResolvedValue(undefined),
    };
    const configService = {
      getAppConfig: () => ({ shippingFlatFee: SHIPPING }),
    };
    const cartsService = { getCart: jest.fn() };
    const mailService = {
      sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
      sendOrderStatusUpdate: jest.fn().mockResolvedValue(undefined),
    };
    const usersService = {
      findById: jest.fn().mockResolvedValue({ email: 'a@example.com' }),
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
      mailService as never,
      usersService as never,
      new OrderPolicy(),
    );
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

    return {
      service,
      state,
      manager,
      stockQb,
      listQb,
      addressRepo,
      variantRepo,
      statusHistoryRepo,
      dataSource,
      discountsService,
      cartsService,
      mailService,
      usersService,
    };
  };

  const flush = () => new Promise((r) => setImmediate(r));

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

    it('decrements stock atomically, guarded by stock and isActive', async () => {
      const ctx = buildService();

      await ctx.service.create('user-1', dto);

      expect(ctx.stockQb.where).toHaveBeenCalledWith(
        'id = :id AND stock >= :qty AND "isActive" = true',
        { id: 'variant-a', qty: 3 },
      );
      const { stock } = (ctx.stockQb.set.mock.calls as unknown[][])[0][0] as {
        stock: () => string;
      };
      expect(stock()).toBe('stock - :qty');
    });

    it('locks variants in a deterministic (sorted) order', async () => {
      const ctx = buildService();
      ctx.variantRepo.find.mockResolvedValue([
        variant({ id: 'variant-z', sku: 'Z' }),
        variant({ id: 'variant-a', sku: 'A' }),
      ]);

      await ctx.service.create('user-1', {
        address_id: 'address-1',
        items: [
          { variant_id: 'variant-z', quantity: 1 },
          { variant_id: 'variant-a', quantity: 1 },
        ],
      });

      expect(
        ctx.stockQb.where.mock.calls.map(([, p]) => (p as { id: string }).id),
      ).toEqual(['variant-a', 'variant-z']);
    });

    it('applies a discount code and records its usage', async () => {
      const ctx = buildService();
      ctx.discountsService.resolveCode.mockResolvedValue({ id: 'd-1' });
      ctx.discountsService.computeAmount.mockReturnValue(10);

      await ctx.service.create('user-1', { ...dto, discountCode: 'SALE10' });

      expect(ctx.discountsService.resolveCode).toHaveBeenCalledWith(
        'SALE10',
        59.97,
      );
      expect(savedCalls(ctx.manager, Order)[0]).toEqual(
        expect.objectContaining({ discount: 10, total: 54.97 }),
      );
      expect(ctx.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO "order_discount"'),
        ['order-1', 'd-1'],
      );
      expect(ctx.discountsService.incrementUsedCount).toHaveBeenCalledWith(
        ctx.manager,
        'd-1',
      );
    });

    it('sends the confirmation email after creating', async () => {
      const ctx = buildService();

      await ctx.service.create('user-1', dto);
      await flush();

      expect(ctx.mailService.sendOrderConfirmation).toHaveBeenCalledWith(
        'a@example.com',
        expect.objectContaining({ subtotal: 59.97, total: 64.97 }),
      );
    });

    it('does not fail the order when the email fails', async () => {
      const ctx = buildService();
      ctx.mailService.sendOrderConfirmation.mockRejectedValue(
        new Error('smtp'),
      );

      await expect(ctx.service.create('user-1', dto)).resolves.toBeDefined();
      await flush();
      expect(jest.spyOn(ctx.service['logger'], 'error')).toHaveBeenCalled();
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

    it('reports insufficient stock when the conditional decrement fails', async () => {
      const ctx = buildService();
      ctx.stockQb.execute.mockResolvedValue({ affected: 0 });
      ctx.state.variant = { isActive: true };

      await expect(ctx.service.create('user-1', dto)).rejects.toThrow(
        new UnprocessableEntityException(
          'Insufficient stock for variant SKU-A',
        ),
      );
    });

    it('reports a variant deactivated mid-checkout', async () => {
      const ctx = buildService();
      ctx.stockQb.execute.mockResolvedValue({ affected: 0 });
      ctx.state.variant = { isActive: false };

      await expect(ctx.service.create('user-1', dto)).rejects.toThrow(
        'Variant SKU-A is no longer available',
      );
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
      expect(ctx.manager.increment).not.toHaveBeenCalled();
      expect(ctx.manager.update).toHaveBeenCalledWith(Order, 'order-1', {
        address_id: 'address-2',
        notes: 'leave at door',
        subtotal: 19.99,
        discount: 0,
        total: 24.99,
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

      expect(ctx.manager.increment).toHaveBeenCalledWith(
        ProductVariant,
        { id: 'variant-a' },
        'stock',
        1,
      );
      expect(ctx.stockQb.where).toHaveBeenCalledWith(expect.any(String), {
        id: 'variant-a',
        qty: 2,
      });
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
        discounts: [{ code: 'SALE', minOrderValue: null }],
      };
      ctx.discountsService.computeAmount.mockReturnValue(4);

      await ctx.service.update('order-1', 'user-1', {
        items: [{ variant_id: 'variant-a', quantity: 2 }],
      });

      expect(ctx.manager.update).toHaveBeenCalledWith(
        Order,
        'order-1',
        expect.objectContaining({ discount: 4, total: 40.98 }),
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
        expect(ctx.manager.increment).toHaveBeenCalledWith(
          ProductVariant,
          { id: 'variant-a' },
          'stock',
          2,
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
        expect(ctx.mailService.sendOrderStatusUpdate).toHaveBeenCalledWith(
          'a@example.com',
          {
            orderNumber: 'ORD-1',
            fromStatus: status,
            toStatus: OrderStatus.CANCELLED,
          },
        );
      },
    );

    it('refuses to cancel a paid order', async () => {
      const ctx = buildService();
      ctx.state.order = order(OrderStatus.CONFIRMED);
      ctx.state.payment = { id: 'payment-1' };

      await expect(ctx.service.cancel('order-1', 'user-1')).rejects.toThrow(
        /already been paid/,
      );
      expect(ctx.manager.increment).not.toHaveBeenCalled();
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
      expect(ctx.manager.increment).toHaveBeenCalledTimes(1);
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
      [OrderStatus.PROCESSING, OrderStatus.SHIPPED],
      [OrderStatus.SHIPPED, OrderStatus.DELIVERED],
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
      expect(ctx.manager.increment).not.toHaveBeenCalled();
    });

    it.each([
      [OrderStatus.SHIPPED, OrderStatus.PENDING],
      [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
      [OrderStatus.CANCELLED, OrderStatus.CONFIRMED],
      [OrderStatus.REFUNDED, OrderStatus.DELIVERED],
      [OrderStatus.PENDING, OrderStatus.SHIPPED],
      // Refund statuses are only set by the payment refund flow.
      [OrderStatus.DELIVERED, OrderStatus.REFUNDED],
      [OrderStatus.DELIVERED, OrderStatus.PARTIALLY_REFUNDED],
      [OrderStatus.PARTIALLY_REFUNDED, OrderStatus.REFUNDED],
    ])('rejects %s -> %s', async (from, to) => {
      const ctx = buildService();
      ctx.state.order = { id: 'order-1', status: from };

      await expect(
        ctx.service.updateStatus('order-1', { status: to }, admin),
      ).rejects.toThrow(`Cannot transition order from "${from}" to "${to}"`);
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

      expect(ctx.manager.increment).toHaveBeenCalledWith(
        ProductVariant,
        { id: 'variant-a' },
        'stock',
        3,
      );
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
      expect(ctx.manager.increment).not.toHaveBeenCalled();
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
      expect(ctx.mailService.sendOrderStatusUpdate).toHaveBeenCalled();
    });

    it("uses the caller's manager and leaves notifying to the caller", async () => {
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
      expect(ctx.mailService.sendOrderStatusUpdate).not.toHaveBeenCalled();
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

  describe('notifyOrderStatusChanged', () => {
    it('notifies only when a change actually happened', async () => {
      const ctx = buildService();
      const order = { user_id: 'user-1', orderNumber: 'ORD-1', status: 'x' };

      ctx.service.notifyOrderStatusChanged(order as never, null);
      await flush();
      expect(ctx.mailService.sendOrderStatusUpdate).not.toHaveBeenCalled();

      ctx.service.notifyOrderStatusChanged(order as never, OrderStatus.PENDING);
      await flush();
      expect(ctx.mailService.sendOrderStatusUpdate).toHaveBeenCalled();
    });

    it('skips users that no longer exist', async () => {
      const ctx = buildService();
      ctx.usersService.findById.mockResolvedValue(null);

      ctx.service.notifyOrderStatusChanged(
        { user_id: 'gone' } as never,
        OrderStatus.PENDING,
      );
      await flush();

      expect(ctx.mailService.sendOrderStatusUpdate).not.toHaveBeenCalled();
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
