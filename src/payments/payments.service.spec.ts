import { PaymentPolicy } from './policies/payment.policy';
import { OrderStatusChangeActor } from '@/orders/enums/order-status-change-actor.enum';
import { OrderStatus } from '@/orders/enums/order-status.enum';
import { PaymentsService } from './payments.service';
import { PaymentIssueType } from './enums/payment-issue-type.enum';
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
    codMaxOrderTotal?: number;
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
      manager,
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
      confirmAfterPayment: jest.fn().mockResolvedValue({
        outcome: 'confirmed',
        order: { id: 'order-1', status: OrderStatus.CONFIRMED, total: 100000 },
        fromStatus: OrderStatus.PENDING,
      }),
    };
    const issuesService = {
      raise: jest.fn().mockResolvedValue(undefined),
      resolveOpen: jest.fn().mockResolvedValue(undefined),
    };
    const configService = {
      getAppConfig: () => ({
        codMaxOrderTotal: overrides?.codMaxOrderTotal ?? 0,
      }),
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
      new PaymentPolicy(),
      issuesService as never,
      configService as never,
    );

    return {
      service,
      issuesService,
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

    it('rejects an online method that has no gateway configured', async () => {
      const { service, dataSource } = buildService({ provider: undefined });

      await expect(
        service.create('user-1', {
          order_id: 'order-1',
          method: PaymentMethod.VNPAY,
        }),
      ).rejects.toThrow('Payment method "vnpay" is not available');
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects cash on delivery above the configured limit', async () => {
      const { service, manager } = buildService({ codMaxOrderTotal: 50000 });
      manager.findOne.mockResolvedValueOnce(order);

      await expect(
        service.create('user-1', {
          order_id: 'order-1',
          method: PaymentMethod.COD,
        }),
      ).rejects.toThrow(
        'Cash on delivery is only available for orders up to 50000',
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('keeps the metadata a gateway returns and passes the client context', async () => {
      const initiate = jest.fn().mockResolvedValue({
        providerRef: 'ref',
        redirectUrl: 'https://pay',
        metadata: { vnpCreateDate: '20261128100000' },
      });
      const { service, manager } = buildService({ provider: { initiate } });
      manager.findOne.mockResolvedValueOnce(order).mockResolvedValueOnce(null);

      const payment = await service.create(
        'user-1',
        { order_id: 'order-1', method: PaymentMethod.VNPAY },
        { clientIp: '1.2.3.4' },
      );

      expect(initiate).toHaveBeenCalledWith(expect.anything(), order, {
        clientIp: '1.2.3.4',
      });
      expect(payment.metadata).toEqual({
        vnpCreateDate: '20261128100000',
        checkoutUrl: 'https://pay',
      });
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
        {},
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

    it('completes the payment and confirms the order via SYSTEM actor in the same transaction', async () => {
      const { service, manager, ordersService, issuesService } = buildService();
      const updatedOrder = {
        id: 'order-1',
        status: OrderStatus.CONFIRMED,
        total: 100000,
      };
      ordersService.confirmAfterPayment.mockResolvedValue({
        outcome: 'confirmed',
        order: updatedOrder,
        fromStatus: OrderStatus.PENDING,
      });
      manager.findOne.mockResolvedValueOnce({
        id: 'payment-1',
        order_id: 'order-1',
        status: PaymentStatus.PENDING,
        amount: 100000,
        metadata: { vnpCreateDate: '20261128100000' },
      });

      const outcome = await service.completeFromGatewayEvent(
        'payment-1',
        'pi_123',
        { foo: 'bar' },
        'Stripe webhook evt_1: checkout completed',
        100000,
      );

      expect(outcome).toBe('processed');
      expect(manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: PaymentStatus.COMPLETED,
          transactionId: 'pi_123',
          // Merged: what the gateway stored at initiation is kept.
          metadata: { vnpCreateDate: '20261128100000', foo: 'bar' },
        }),
      );
      expect(ordersService.confirmAfterPayment).toHaveBeenCalledWith(
        'order-1',
        {
          actorType: OrderStatusChangeActor.SYSTEM,
          note: 'Stripe webhook evt_1: checkout completed',
        },
        manager,
      );
      expect(issuesService.raise).not.toHaveBeenCalled();
    });

    it('propagates a failure to persist the payment', async () => {
      // The order sync runs in the same transaction, and its email goes
      // through the outbox in it too, so a failed save rolls all of it back.
      const { service, manager, ordersService } = buildService();
      manager.findOne.mockResolvedValueOnce({
        id: 'payment-1',
        order_id: 'order-1',
        status: PaymentStatus.PENDING,
      });
      manager.save.mockRejectedValueOnce(new Error('db exploded'));

      await expect(
        service.completeFromGatewayEvent('payment-1', 'pi_123', {}, 'note'),
      ).rejects.toThrow('db exploded');
      expect(ordersService.confirmAfterPayment).not.toHaveBeenCalled();
    });

    it('completes a payment we had voided (late payment) instead of ignoring it', async () => {
      const { service, manager, ordersService } = buildService();
      manager.findOne.mockResolvedValueOnce({
        id: 'payment-1',
        order_id: 'order-1',
        status: PaymentStatus.FAILED,
        amount: 100000,
      });

      await expect(
        service.completeFromGatewayEvent('payment-1', 'pi_1', {}, 'late'),
      ).resolves.toBe('processed');
      expect(ordersService.confirmAfterPayment).toHaveBeenCalled();
    });

    it('raises an issue when the captured amount differs from the order total', async () => {
      const { service, manager, issuesService } = buildService();
      manager.findOne.mockResolvedValueOnce({
        id: 'payment-1',
        order_id: 'order-1',
        status: PaymentStatus.PENDING,
        method: PaymentMethod.STRIPE,
        amount: 90000,
      });

      await service.completeFromGatewayEvent(
        'payment-1',
        'pi_1',
        {},
        'paid',
        90000,
      );

      expect(issuesService.raise).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PaymentIssueType.AMOUNT_MISMATCH,
          paymentId: 'payment-1',
          details: { captured: 90000, orderTotal: 100000 },
        }),
      );
    });

    describe('when the order was cancelled and the stock is gone', () => {
      const setup = () => {
        const ctx = buildService();
        ctx.ordersService.confirmAfterPayment.mockResolvedValue({
          outcome: 'not_revivable',
          order: {
            id: 'order-1',
            status: OrderStatus.CANCELLED,
            total: 100000,
          },
          fromStatus: null,
        });
        ctx.manager.findOne.mockResolvedValueOnce({
          id: 'payment-1',
          order_id: 'order-1',
          status: PaymentStatus.FAILED,
          method: PaymentMethod.STRIPE,
          amount: 100000,
        });
        ctx.manager.find.mockResolvedValueOnce([{ id: 'item-1', quantity: 2 }]);
        const createRefund = jest.spyOn(ctx.service, 'createRefund');
        return { ...ctx, createRefund };
      };

      it('refunds every item in full and flags it for customer service', async () => {
        const { service, issuesService, createRefund } = setup();
        createRefund.mockResolvedValue({
          id: 'refund-1',
          amount: 100000,
        } as never);

        await service.completeFromGatewayEvent('payment-1', 'pi_1', {}, 'late');

        expect(createRefund).toHaveBeenCalledWith('payment-1', {
          items: [{ order_item_id: 'item-1', quantity: 2 }],
          reason: expect.stringContaining(
            'after the order was cancelled',
          ) as unknown,
        });
        expect(issuesService.raise).toHaveBeenCalledWith(
          expect.objectContaining({
            type: PaymentIssueType.LATE_PAYMENT_REFUNDED,
            details: { refundId: 'refund-1', amount: 100000 },
          }),
        );
      });

      it('raises a hand-refund issue when the automatic refund fails', async () => {
        const { service, issuesService, createRefund } = setup();
        createRefund.mockRejectedValue(new Error('gateway down'));
        jest
          .spyOn(service['logger'], 'error')
          .mockImplementation(() => undefined);

        await expect(
          service.completeFromGatewayEvent('payment-1', 'pi_1', {}, 'late'),
        ).resolves.toBe('processed');
        expect(issuesService.raise).toHaveBeenCalledWith(
          expect.objectContaining({
            type: PaymentIssueType.LATE_PAYMENT_REFUND_FAILED,
            details: { error: 'gateway down' },
          }),
        );
      });
    });
  });

  describe('refundRemaining', () => {
    it('refunds only the units not refunded yet', async () => {
      const { service, paymentRepo, manager } = buildService();
      paymentRepo.findOne.mockResolvedValue({
        id: 'payment-1',
        status: PaymentStatus.PARTIALLY_REFUNDED,
        order: {
          items: [
            { id: 'item-1', quantity: 2 },
            { id: 'item-2', quantity: 1 },
          ],
        },
      });
      // item-2 already fully refunded, item-1 half.
      manager.find.mockResolvedValueOnce([
        {
          items: [
            { order_item_id: 'item-1', quantity: 1 },
            { order_item_id: 'item-2', quantity: 1 },
          ],
        },
      ]);
      const createRefund = jest
        .spyOn(service, 'createRefund')
        .mockResolvedValue({ id: 'r' } as never);

      await service.refundRemaining('payment-1', 'returned');

      expect(createRefund).toHaveBeenCalledWith('payment-1', {
        items: [{ order_item_id: 'item-1', quantity: 1 }],
        reason: 'returned',
      });
    });

    it('does nothing when everything is refunded or the payment is not paid', async () => {
      const { service, paymentRepo, manager } = buildService();
      const createRefund = jest.spyOn(service, 'createRefund');

      paymentRepo.findOne.mockResolvedValueOnce({
        id: 'p',
        status: PaymentStatus.COMPLETED,
        order: { items: [{ id: 'item-1', quantity: 1 }] },
      });
      manager.find.mockResolvedValueOnce([
        { items: [{ order_item_id: 'item-1', quantity: 1 }] },
      ]);
      await expect(service.refundRemaining('p', 'x')).resolves.toBeNull();

      paymentRepo.findOne.mockResolvedValueOnce({
        id: 'p',
        status: PaymentStatus.PENDING,
      });
      await expect(service.refundRemaining('p', 'x')).resolves.toBeNull();

      expect(createRefund).not.toHaveBeenCalled();
    });
  });

  describe('settleCod', () => {
    const dto = {
      reference: 'GHN-DS-1',
      carrier: 'GHN',
      lines: [{ orderNumber: 'ORD-1', amount: 100000 }],
    };
    const codPayment = (overrides: object = {}) => ({
      id: 'payment-1',
      order_id: 'order-1',
      method: PaymentMethod.COD,
      status: PaymentStatus.PENDING,
      amount: 100000,
      ...overrides,
    });

    it("marks a delivered order's COD payment paid", async () => {
      const { service, manager, issuesService } = buildService();
      manager.findOne
        .mockResolvedValueOnce({ ...order, status: OrderStatus.DELIVERED })
        .mockResolvedValueOnce(codPayment())
        .mockResolvedValueOnce(codPayment()); // locked

      const summary = await service.settleCod(dto, 'admin-1');

      expect(summary).toEqual(
        expect.objectContaining({ settled: 1, needsAttention: 0 }),
      );
      expect(issuesService.resolveOpen).toHaveBeenCalledWith(
        'payment-1',
        [
          PaymentIssueType.COD_AMOUNT_MISMATCH,
          PaymentIssueType.COD_NOT_DELIVERED,
        ],
        'Settled by COD statement GHN-DS-1',
        'admin-1',
        manager,
      );
      expect(manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: PaymentStatus.COMPLETED,
          metadata: {
            codSettlement: expect.objectContaining({
              reference: 'GHN-DS-1',
              carrier: 'GHN',
              amount: 100000,
              settledBy: 'admin-1',
            }) as unknown,
          },
        }),
      );
    });

    it.each([
      [
        'amount_mismatch',
        OrderStatus.DELIVERED,
        90000,
        PaymentIssueType.COD_AMOUNT_MISMATCH,
      ],
      [
        'not_delivered',
        OrderStatus.SHIPPED,
        100000,
        PaymentIssueType.COD_NOT_DELIVERED,
      ],
    ])(
      'leaves %s lines unpaid and raises an issue',
      async (result, orderStatus, amount, issueType) => {
        const { service, manager, issuesService } = buildService();
        manager.findOne
          .mockResolvedValueOnce({ ...order, status: orderStatus })
          .mockResolvedValueOnce(codPayment())
          .mockResolvedValueOnce(codPayment());

        const summary = await service.settleCod(
          { ...dto, lines: [{ orderNumber: 'ORD-1', amount }] },
          'admin-1',
        );

        expect(summary.lines[0].result).toBe(result);
        expect(summary.needsAttention).toBe(1);
        expect(manager.save).not.toHaveBeenCalled();
        expect(issuesService.raise).toHaveBeenCalledWith(
          expect.objectContaining({ type: issueType, paymentId: 'payment-1' }),
          manager,
        );
      },
    );

    it('reports unknown orders, missing COD payments and repeats', async () => {
      const { service, manager } = buildService();
      manager.findOne
        .mockResolvedValueOnce(null) // ORD-X: no order
        .mockResolvedValueOnce(order) // ORD-2: order, no COD payment
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(order) // ORD-3: already settled
        .mockResolvedValueOnce(codPayment({ status: PaymentStatus.COMPLETED }))
        .mockResolvedValueOnce(codPayment({ status: PaymentStatus.COMPLETED }));

      const summary = await service.settleCod(
        {
          reference: 'R',
          lines: [
            { orderNumber: 'ORD-X', amount: 1 },
            { orderNumber: 'ORD-2', amount: 1 },
            { orderNumber: 'ORD-3', amount: 1 },
          ],
        },
        'admin-1',
      );

      expect(summary.lines.map((l) => l.result)).toEqual([
        'order_not_found',
        'no_cod_payment',
        'already_settled',
      ]);
      expect(summary.needsAttention).toBe(2);
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

    it('completes the payment and confirms the order', async () => {
      const { service, manager, ordersService } = buildService();
      const updatedOrder = { id: 'order-1', status: OrderStatus.CONFIRMED };
      ordersService.confirmAfterPayment.mockResolvedValue({
        outcome: 'confirmed',
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
      expect(ordersService.confirmAfterPayment).toHaveBeenCalledWith(
        'order-1',
        {
          actorType: OrderStatusChangeActor.ADMIN,
          actorId: 'admin-1',
          note: 'Payment completed',
        },
        manager,
      );
    });

    it('refuses to mark paid a cancelled order whose stock is gone', async () => {
      const { service, manager, ordersService } = buildService();
      ordersService.confirmAfterPayment.mockResolvedValue({
        outcome: 'not_revivable',
        order: { id: 'order-1', status: OrderStatus.CANCELLED },
        fromStatus: null,
      });
      manager.findOne.mockResolvedValueOnce({
        id: 'payment-1',
        order_id: 'order-1',
        status: PaymentStatus.FAILED,
      });

      await expect(
        service.updateStatus('payment-1', { status: PaymentStatus.COMPLETED }),
      ).rejects.toThrow('cannot be marked paid');
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
    });
  });

  describe('resolveRefundableItems', () => {
    // Scoped code took 30 off the second line only; shipping 5 split 1:3.
    const payment = {
      id: 'payment-1',
      order_id: 'order-1',
      status: PaymentStatus.COMPLETED,
      amount: 375,
      method: PaymentMethod.STRIPE,
      order: {
        subtotal: 400,
        items: [
          {
            id: 'item-a',
            quantity: 1,
            unitPrice: 100,
            paidAmount: 101.25,
            productName: 'A',
          },
          {
            id: 'item-b',
            quantity: 3,
            unitPrice: 100,
            paidAmount: 273.75,
            productName: 'B',
          },
        ],
      },
    };

    it("refunds each line's own paidAmount, not a whole-order ratio", async () => {
      const { service, manager } = buildService();
      manager.findOne.mockResolvedValueOnce(payment);

      const { amount, itemsToCreate } = await service.resolveRefundableItems(
        manager as never,
        'payment-1',
        [{ order_item_id: 'item-a', quantity: 1 }],
      );

      // The undiscounted line gets its full price + its shipping share back.
      expect(amount).toBe(101.25);
      expect(itemsToCreate).toEqual([
        { order_item_id: 'item-a', quantity: 1, amount: 101.25 },
      ]);
    });

    it('prices later partial refunds so a line adds back up exactly', async () => {
      const amounts: number[] = [];
      for (let taken = 0; taken < 3; taken++) {
        const { service, manager } = buildService();
        manager.findOne.mockResolvedValueOnce(payment);
        manager.find.mockResolvedValueOnce(
          taken === 0
            ? []
            : [{ items: [{ order_item_id: 'item-b', quantity: taken }] }],
        );

        const { amount } = await service.resolveRefundableItems(
          manager as never,
          'payment-1',
          [{ order_item_id: 'item-b', quantity: 1 }],
        );
        amounts.push(amount);
      }

      expect(amounts).toEqual([91.25, 91.25, 91.25]);
      expect(amounts.reduce((a, b) => a + b, 0)).toBe(273.75);
    });

    it('slices after quantities reserved by pending requests', async () => {
      const { service, manager } = buildService();
      manager.findOne.mockResolvedValueOnce({
        ...payment,
        order: {
          ...payment.order,
          items: [{ ...payment.order.items[1], paidAmount: 10 }],
        },
      });

      const { amount } = await service.resolveRefundableItems(
        manager as never,
        'payment-1',
        [{ order_item_id: 'item-b', quantity: 1 }],
        new Map([['item-b', 1]]),
      );

      // 10 over 3 units: cumulative 3.33 → 6.67, so the second unit is 3.34.
      expect(amount).toBe(3.34);
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
        subtotal: 100,
        items: [
          {
            id: 'item-1',
            quantity: 2,
            unitPrice: 50,
            paidAmount: 100,
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
      expect(refundFn).toHaveBeenCalledWith(
        paymentWithOrder,
        50,
        'oops',
        undefined,
      );
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
    });
  });
});
