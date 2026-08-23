import { OrderStatusChangeActor } from '@/orders/enums/order-status-change-actor.enum';
import { OrderStatus } from '@/orders/enums/order-status.enum';
import { PaymentsService } from './payments.service';
import { PaymentMethod } from './enums/payment-method.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { RefundStatus } from './enums/refund-status.enum';

describe('PaymentsService', () => {
  const order = {
    id: 'order-1',
    user_id: 'user-1',
    status: OrderStatus.PENDING,
    total: 100000,
    orderNumber: 'ORD-1',
  };

  const buildService = (overrides?: {
    provider?: { initiate: jest.Mock } | undefined;
  }) => {
    // A single fake EntityManager shared by every `dataSource.transaction`
    // call, since the service now does its reads/writes through the
    // transactional manager rather than the injected repos directly. Each
    // test configures `manager.findOne`/`manager.save` call-by-call with
    // `mockResolvedValueOnce`, in the same order the implementation calls
    // them.
    // Captured separately (rather than read back off
    // `manager.createQueryBuilder()`) so tests get a concretely-typed mock
    // to sequence `.mockResolvedValueOnce()` on for
    // sumRefundAmount/committed-balance checks, instead of an `any` from
    // re-invoking the loosely-typed chain.
    const getRawOne = jest.fn().mockResolvedValue({ total: '0' });
    const manager = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      save: jest
        .fn()
        .mockImplementation((_entity, data) => Promise.resolve(data)),
      create: jest
        .fn()
        .mockImplementation((_entity: unknown, data: object) => ({
          ...data,
        })),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne,
      }),
    };
    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation((cb: (m: unknown) => Promise<unknown>) =>
          cb(manager),
        ),
    };
    const paymentRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
    };
    const refundRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
    };
    const ordersService = {
      applyStatusChange: jest.fn().mockResolvedValue(null),
      notifyOrderStatusChanged: jest.fn(),
    };
    const gatewayRegistry = {
      resolve: jest.fn().mockReturnValue(overrides?.provider),
    };

    const service = new PaymentsService(
      paymentRepo as never,
      refundRepo as never,
      dataSource as never,
      ordersService as never,
      gatewayRegistry as never,
    );

    return {
      service,
      manager,
      getRawOne,
      dataSource,
      paymentRepo,
      refundRepo,
      ordersService,
      gatewayRegistry,
    };
  };

  describe('create', () => {
    it('creates a plain PENDING payment without calling a gateway when none is resolved', async () => {
      const { service, manager } = buildService({ provider: undefined });
      manager.findOne
        .mockResolvedValueOnce(order) // locked order lookup
        .mockResolvedValueOnce(null); // existing-active-payment check

      const payment = await service.create('user-1', {
        order_id: 'order-1',
        method: PaymentMethod.COD,
      });

      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.transactionId).toBeUndefined();
      expect(manager.save).toHaveBeenCalledTimes(1);
    });

    it('initiates the gateway and persists the providerRef + checkoutUrl when a provider resolves', async () => {
      const initiate = jest.fn().mockResolvedValue({
        providerRef: 'cs_test_123',
        redirectUrl: 'https://checkout.stripe.com/pay/cs_test_123',
      });
      const { service, manager, paymentRepo } = buildService({
        provider: { initiate },
      });
      manager.findOne
        .mockResolvedValueOnce(order) // locked order lookup
        .mockResolvedValueOnce(null); // existing-active-payment check

      const payment = await service.create('user-1', {
        order_id: 'order-1',
        method: PaymentMethod.STRIPE,
      });

      expect(initiate).toHaveBeenCalledWith(
        expect.objectContaining({ order_id: 'order-1' }),
        order,
      );
      expect(payment.transactionId).toBe('cs_test_123');
      expect(payment.metadata).toEqual({
        checkoutUrl: 'https://checkout.stripe.com/pay/cs_test_123',
      });
      // One insert inside the transaction, one update after the gateway call.
      expect(manager.save).toHaveBeenCalledTimes(1);
      expect(paymentRepo.save).toHaveBeenCalledTimes(1);
    });

    it('marks the payment FAILED and rethrows when provider.initiate() fails, so a retry is not blocked by a stuck PENDING payment', async () => {
      const initiate = jest.fn().mockRejectedValue(new Error('stripe down'));
      const { service, manager, paymentRepo } = buildService({
        provider: { initiate },
      });
      manager.findOne
        .mockResolvedValueOnce(order) // locked order lookup
        .mockResolvedValueOnce(null); // existing-active-payment check

      await expect(
        service.create('user-1', {
          order_id: 'order-1',
          method: PaymentMethod.STRIPE,
        }),
      ).rejects.toThrow('stripe down');

      expect(paymentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.FAILED }),
      );
    });
  });

  describe('completeFromGatewayEvent', () => {
    it('returns not_found when the payment does not exist', async () => {
      const { service, manager } = buildService();
      manager.findOne.mockResolvedValueOnce(null);

      const outcome = await service.completeFromGatewayEvent(
        'missing-payment',
        'pi_123',
        {},
        'note',
      );

      expect(outcome).toBe('not_found');
    });

    it('is a no-op returning already_terminal when the payment is already COMPLETED', async () => {
      const { service, manager, ordersService } = buildService();
      manager.findOne.mockResolvedValueOnce({
        id: 'payment-1',
        order_id: 'order-1',
        status: PaymentStatus.COMPLETED,
      });

      const outcome = await service.completeFromGatewayEvent(
        'payment-1',
        'pi_123',
        {},
        'note',
      );

      expect(outcome).toBe('already_terminal');
      expect(manager.save).not.toHaveBeenCalled();
      expect(ordersService.applyStatusChange).not.toHaveBeenCalled();
    });

    it('completes the payment, confirms the order via SYSTEM actor, and notifies once the transaction has committed', async () => {
      const { service, manager, ordersService } = buildService();
      const updatedOrder = { id: 'order-1', status: OrderStatus.CONFIRMED };
      ordersService.applyStatusChange.mockResolvedValue({
        order: updatedOrder,
        fromStatus: OrderStatus.PENDING,
      });
      manager.findOne.mockResolvedValueOnce({
        id: 'payment-1',
        order_id: 'order-1',
        status: PaymentStatus.PENDING,
      });

      const outcome = await service.completeFromGatewayEvent(
        'payment-1',
        'pi_123',
        { foo: 'bar' },
        'Stripe webhook evt_1: checkout completed',
      );

      expect(outcome).toBe('processed');
      expect(manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: PaymentStatus.COMPLETED,
          transactionId: 'pi_123',
        }),
      );
      expect(ordersService.applyStatusChange).toHaveBeenCalledWith(
        'order-1',
        OrderStatus.CONFIRMED,
        {
          actorType: OrderStatusChangeActor.SYSTEM,
          note: 'Stripe webhook evt_1: checkout completed',
        },
        manager,
      );
      // Fired via the dedicated post-commit hook, not from inside the
      // transaction callback — see notifyOrderStatusChanged's doc comment.
      expect(ordersService.notifyOrderStatusChanged).toHaveBeenCalledWith(
        updatedOrder,
        OrderStatus.PENDING,
      );
    });

    it('never notifies the order status change if the transaction rolls back after applyStatusChange ran', async () => {
      // Regression test for a bug where the order-status-change email fired
      // from inside the transaction callback, before a later statement in
      // that same transaction (here, the final payment save) could still
      // fail and roll everything back — emailing a change that never
      // actually persisted.
      const { service, manager, ordersService } = buildService();
      ordersService.applyStatusChange.mockResolvedValue({
        order: { id: 'order-1', status: OrderStatus.CONFIRMED },
        fromStatus: OrderStatus.PENDING,
      });
      manager.findOne.mockResolvedValueOnce({
        id: 'payment-1',
        order_id: 'order-1',
        status: PaymentStatus.PENDING,
      });
      manager.save.mockRejectedValueOnce(new Error('db exploded'));

      await expect(
        service.completeFromGatewayEvent('payment-1', 'pi_123', {}, 'note'),
      ).rejects.toThrow('db exploded');

      expect(ordersService.notifyOrderStatusChanged).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('rejects setting status to partially_refunded directly', async () => {
      const { service } = buildService();

      await expect(
        service.updateStatus('payment-1', {
          status: PaymentStatus.PARTIALLY_REFUNDED,
        }),
      ).rejects.toThrow(
        'Status "partially_refunded" is set automatically by the refund flow and cannot be assigned directly',
      );
    });

    it('rejects setting status to refunded directly', async () => {
      const { service, ordersService } = buildService();

      await expect(
        service.updateStatus('payment-1', {
          status: PaymentStatus.REFUNDED,
        }),
      ).rejects.toThrow(
        'Status "refunded" is set automatically by the refund flow and cannot be assigned directly',
      );
      // Must fail before ever touching the order — no Refund record and no
      // gateway call happened, so the order must not be moved either.
      expect(ordersService.applyStatusChange).not.toHaveBeenCalled();
    });

    it('throws when the payment is already in a terminal status', async () => {
      const { service, manager } = buildService();
      manager.findOne.mockResolvedValueOnce({
        id: 'payment-1',
        status: PaymentStatus.COMPLETED,
      });

      await expect(
        service.updateStatus('payment-1', { status: PaymentStatus.FAILED }),
      ).rejects.toThrow('Cannot update a payment with status "completed"');
    });

    it('completes the payment, confirms the order, and notifies after commit', async () => {
      const { service, manager, ordersService } = buildService();
      const updatedOrder = { id: 'order-1', status: OrderStatus.CONFIRMED };
      ordersService.applyStatusChange.mockResolvedValue({
        order: updatedOrder,
        fromStatus: OrderStatus.PENDING,
      });
      manager.findOne.mockResolvedValueOnce({
        id: 'payment-1',
        order_id: 'order-1',
        status: PaymentStatus.PENDING,
      });

      const payment = await service.updateStatus(
        'payment-1',
        { status: PaymentStatus.COMPLETED },
        'admin-1',
      );

      expect(payment.status).toBe(PaymentStatus.COMPLETED);
      expect(payment.paidAt).toBeInstanceOf(Date);
      expect(ordersService.applyStatusChange).toHaveBeenCalledWith(
        'order-1',
        OrderStatus.CONFIRMED,
        {
          actorType: OrderStatusChangeActor.ADMIN,
          actorId: 'admin-1',
          note: 'Payment completed',
        },
        manager,
      );
      expect(ordersService.notifyOrderStatusChanged).toHaveBeenCalledWith(
        updatedOrder,
        OrderStatus.PENDING,
      );
    });

    it('does not touch the order or notify for a status change with no order side effect', async () => {
      const { service, manager, ordersService } = buildService();
      manager.findOne.mockResolvedValueOnce({
        id: 'payment-1',
        order_id: 'order-1',
        status: PaymentStatus.PENDING,
      });

      const payment = await service.updateStatus('payment-1', {
        status: PaymentStatus.FAILED,
      });

      expect(payment.status).toBe(PaymentStatus.FAILED);
      expect(ordersService.applyStatusChange).not.toHaveBeenCalled();
      expect(ordersService.notifyOrderStatusChanged).not.toHaveBeenCalled();
    });
  });

  describe('refundFromGatewayEvent', () => {
    it('returns not_found when the payment does not exist', async () => {
      const { service, manager } = buildService();
      manager.findOne.mockResolvedValueOnce(null);

      const outcome = await service.refundFromGatewayEvent(
        'missing-payment',
        {},
        'note',
      );

      expect(outcome).toBe('not_found');
    });

    it('is a no-op when the payment is already fully REFUNDED', async () => {
      const { service, manager } = buildService();
      manager.findOne.mockResolvedValueOnce({
        id: 'payment-1',
        status: PaymentStatus.REFUNDED,
      });

      const outcome = await service.refundFromGatewayEvent(
        'payment-1',
        {},
        'note',
      );

      expect(outcome).toBe('already_terminal');
    });

    it('is idempotent against a refund it already recorded', async () => {
      const { service, manager } = buildService();
      manager.findOne
        .mockResolvedValueOnce({
          id: 'payment-1',
          status: PaymentStatus.COMPLETED,
        })
        .mockResolvedValueOnce({ id: 're_already_recorded' }); // Refund lookup by transactionId

      const outcome = await service.refundFromGatewayEvent(
        'payment-1',
        { refunds: { data: [{ id: 're_already_recorded' }] } },
        'note',
      );

      expect(outcome).toBe('already_terminal');
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('converts charge.amount/amount_refunded from Stripe units to decimal using the charge currency', async () => {
      const { service, manager, getRawOne, ordersService } = buildService();
      const updatedOrder = {
        id: 'order-1',
        status: OrderStatus.PARTIALLY_REFUNDED,
      };
      ordersService.applyStatusChange.mockResolvedValue({
        order: updatedOrder,
        fromStatus: OrderStatus.CONFIRMED,
      });
      manager.findOne.mockResolvedValueOnce({
        id: 'payment-1',
        order_id: 'order-1',
        amount: 49.99,
        status: PaymentStatus.COMPLETED,
      });
      // sumRefundAmount(SUCCEEDED) — nothing recorded yet.
      getRawOne.mockResolvedValueOnce({ total: '0' });

      const outcome = await service.refundFromGatewayEvent(
        'payment-1',
        { currency: 'usd', amount: 4999, amount_refunded: 1999 },
        'Stripe webhook: charge refunded',
      );

      expect(outcome).toBe('processed');
      // 1999 cents -> 19.99, not the raw 1999.
      expect(manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amount: 19.99 }),
      );
      // 19.99 < 49.99, so only partially refunded.
      expect(ordersService.applyStatusChange).toHaveBeenCalledWith(
        'order-1',
        OrderStatus.PARTIALLY_REFUNDED,
        expect.anything(),
        manager,
      );
      expect(ordersService.notifyOrderStatusChanged).toHaveBeenCalledWith(
        updatedOrder,
        OrderStatus.CONFIRMED,
      );
    });
  });

  describe('createRefund', () => {
    const paymentWithOrder = {
      id: 'payment-1',
      order_id: 'order-1',
      status: PaymentStatus.COMPLETED,
      amount: 100,
      method: PaymentMethod.STRIPE,
      order: {
        items: [
          {
            id: 'item-1',
            quantity: 2,
            unitPrice: 50,
            productName: 'Widget',
          },
        ],
      },
    };

    it('validates, calls the gateway, and settles the payment/order once the gateway confirms', async () => {
      const refundFn = jest.fn().mockResolvedValue({
        providerRef: 're_123',
        raw: { id: 're_123' },
      });
      const {
        service,
        manager,
        getRawOne,
        refundRepo,
        ordersService,
        gatewayRegistry,
      } = buildService();
      gatewayRegistry.resolve.mockReturnValue({ refund: refundFn });

      const updatedOrder = {
        id: 'order-1',
        status: OrderStatus.PARTIALLY_REFUNDED,
      };
      ordersService.applyStatusChange.mockResolvedValue({
        order: updatedOrder,
        fromStatus: OrderStatus.CONFIRMED,
      });

      manager.findOne
        .mockResolvedValueOnce({}) // Phase 1: lock-only fetch, result unused
        .mockResolvedValueOnce(paymentWithOrder) // resolveRefundableItems' own fetch
        .mockResolvedValueOnce({
          // Phase 3: re-locked payment, fresh from the DB
          id: 'payment-1',
          order_id: 'order-1',
          amount: 100,
          status: PaymentStatus.COMPLETED,
        });
      getRawOne
        .mockResolvedValueOnce({ total: '0' }) // Phase 1 committed-balance check
        .mockResolvedValueOnce({ total: '50' }); // Phase 3 succeeded-total check
      refundRepo.findOne.mockResolvedValue({
        id: 'refund-1',
        status: RefundStatus.SUCCEEDED,
        amount: 50,
      });

      const refund = await service.createRefund(
        'payment-1',
        { items: [{ order_item_id: 'item-1', quantity: 1 }], reason: 'oops' },
        'admin-1',
      );

      expect(refund).toEqual({
        id: 'refund-1',
        status: RefundStatus.SUCCEEDED,
        amount: 50,
      });
      expect(refundFn).toHaveBeenCalledWith(paymentWithOrder, 50, 'oops');
      // Settled as PARTIALLY_REFUNDED: 50 succeeded out of 100.
      expect(manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: PaymentStatus.PARTIALLY_REFUNDED }),
      );
      expect(ordersService.applyStatusChange).toHaveBeenCalledWith(
        'order-1',
        OrderStatus.PARTIALLY_REFUNDED,
        expect.objectContaining({ actorId: 'admin-1' }),
        manager,
      );
      expect(ordersService.notifyOrderStatusChanged).toHaveBeenCalledWith(
        updatedOrder,
        OrderStatus.CONFIRMED,
      );
    });

    it('marks the refund FAILED, skips the payment/order settlement, and rethrows when the gateway call fails', async () => {
      const refundFn = jest
        .fn()
        .mockRejectedValue(new Error('card network down'));
      const { service, manager, getRawOne, ordersService, gatewayRegistry } =
        buildService();
      gatewayRegistry.resolve.mockReturnValue({ refund: refundFn });

      manager.findOne
        .mockResolvedValueOnce({}) // Phase 1: lock-only fetch, result unused
        .mockResolvedValueOnce(paymentWithOrder); // resolveRefundableItems' own fetch
      getRawOne.mockResolvedValueOnce({ total: '0' }); // Phase 1 committed-balance check

      await expect(
        service.createRefund('payment-1', {
          items: [{ order_item_id: 'item-1', quantity: 1 }],
          reason: 'oops',
        }),
      ).rejects.toThrow('card network down');

      // Refund persisted as FAILED (last manager.save call)...
      expect(manager.save).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ status: RefundStatus.FAILED }),
      );
      // ...but the payment/order were never touched or notified.
      expect(ordersService.applyStatusChange).not.toHaveBeenCalled();
      expect(ordersService.notifyOrderStatusChanged).not.toHaveBeenCalled();
    });
  });
});
