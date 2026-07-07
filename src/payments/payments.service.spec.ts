import { OrderStatusChangeActor } from '@/orders/enums/order-status-change-actor.enum';
import { OrderStatus } from '@/orders/enums/order-status.enum';
import { PaymentsService } from './payments.service';
import { PaymentMethod } from './enums/payment-method.enum';
import { PaymentStatus } from './enums/payment-status.enum';

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
    const paymentRepo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data: object) => ({ ...data })),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
    };
    const orderRepo = {
      findOne: jest.fn().mockResolvedValue(order),
    };
    const ordersService = {
      applyStatusChange: jest.fn().mockResolvedValue(undefined),
    };
    const gatewayRegistry = {
      resolve: jest.fn().mockReturnValue(overrides?.provider),
    };

    const service = new PaymentsService(
      paymentRepo as never,
      orderRepo as never,
      ordersService as never,
      gatewayRegistry as never,
    );

    return { service, paymentRepo, orderRepo, ordersService, gatewayRegistry };
  };

  describe('create', () => {
    it('creates a plain PENDING payment without calling a gateway when none is resolved', async () => {
      const { service, paymentRepo } = buildService({ provider: undefined });
      paymentRepo.findOne.mockResolvedValue(null);

      const payment = await service.create('user-1', {
        order_id: 'order-1',
        method: PaymentMethod.COD,
      });

      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.transactionId).toBeUndefined();
      expect(paymentRepo.save).toHaveBeenCalledTimes(1);
    });

    it('initiates the gateway and persists the providerRef + checkoutUrl when a provider resolves', async () => {
      const initiate = jest.fn().mockResolvedValue({
        providerRef: 'cs_test_123',
        redirectUrl: 'https://checkout.stripe.com/pay/cs_test_123',
      });
      const { service, paymentRepo } = buildService({
        provider: { initiate },
      });
      paymentRepo.findOne.mockResolvedValue(null);

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
      expect(paymentRepo.save).toHaveBeenCalledTimes(2);
    });
  });

  describe('completeFromGatewayEvent', () => {
    it('returns not_found when the payment does not exist', async () => {
      const { service, paymentRepo } = buildService();
      paymentRepo.findOne.mockResolvedValue(null);

      const outcome = await service.completeFromGatewayEvent(
        'missing-payment',
        'pi_123',
        {},
        'note',
      );

      expect(outcome).toBe('not_found');
    });

    it('is a no-op returning already_terminal when the payment is already COMPLETED', async () => {
      const { service, paymentRepo, ordersService } = buildService();
      paymentRepo.findOne.mockResolvedValue({
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
      expect(paymentRepo.save).not.toHaveBeenCalled();
      expect(ordersService.applyStatusChange).not.toHaveBeenCalled();
    });

    it('completes the payment and confirms the order via SYSTEM actor on first delivery', async () => {
      const { service, paymentRepo, ordersService } = buildService();
      paymentRepo.findOne.mockResolvedValue({
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
      expect(paymentRepo.save).toHaveBeenCalledWith(
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
      );
    });
  });
});
