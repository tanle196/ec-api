import { PaymentWebhooksController } from './payment-webhooks.controller';
import { WebhookProcessingStatus } from './enums/webhook-processing-status.enum';

describe('PaymentWebhooksController', () => {
  const buildController = () => {
    const stripeWebhookVerifier = { verify: jest.fn() };
    const paymentWebhooksService = {
      recordEvent: jest.fn(),
      markProcessed: jest.fn(),
      markIgnored: jest.fn(),
      markError: jest.fn(),
    };
    const paymentsService = {
      completeFromGatewayEvent: jest.fn(),
      failFromGatewayEvent: jest.fn(),
      findByTransactionId: jest.fn(),
      refundFromGatewayEvent: jest.fn(),
    };

    const controller = new PaymentWebhooksController(
      stripeWebhookVerifier as never,
      paymentWebhooksService as never,
      paymentsService as never,
    );

    return {
      controller,
      stripeWebhookVerifier,
      paymentWebhooksService,
      paymentsService,
    };
  };

  const fakeRequest = () => ({
    headers: { 'stripe-signature': 'sig_test' },
    rawBody: Buffer.from('{}'),
  });

  it('short-circuits without reprocessing a duplicate event that already finished (PROCESSED)', async () => {
    const {
      controller,
      stripeWebhookVerifier,
      paymentWebhooksService,
      paymentsService,
    } = buildController();
    stripeWebhookVerifier.verify.mockReturnValue({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: {} },
    });
    paymentWebhooksService.recordEvent.mockResolvedValue({
      isNew: false,
      record: { status: WebhookProcessingStatus.PROCESSED },
    });

    const result = await controller.handleStripe(fakeRequest() as never);

    expect(result).toEqual({ received: true });
    expect(paymentsService.completeFromGatewayEvent).not.toHaveBeenCalled();
  });

  it('reprocesses a duplicate event still stuck at RECEIVED, instead of silently swallowing it', async () => {
    const {
      controller,
      stripeWebhookVerifier,
      paymentWebhooksService,
      paymentsService,
    } = buildController();
    const record = { status: WebhookProcessingStatus.RECEIVED };
    stripeWebhookVerifier.verify.mockReturnValue({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { metadata: { payment_id: 'payment-1' }, id: 'cs_1' } },
    });
    paymentWebhooksService.recordEvent.mockResolvedValue({
      isNew: false,
      record,
    });
    paymentsService.completeFromGatewayEvent.mockResolvedValue('processed');

    const result = await controller.handleStripe(fakeRequest() as never);

    expect(result).toEqual({ received: true });
    expect(paymentsService.completeFromGatewayEvent).toHaveBeenCalledWith(
      'payment-1',
      'cs_1',
      expect.anything(),
      expect.stringContaining('evt_1'),
    );
    expect(paymentWebhooksService.markProcessed).toHaveBeenCalledWith(
      record,
      'payment-1',
    );
  });

  it('processes a brand-new event normally', async () => {
    const {
      controller,
      stripeWebhookVerifier,
      paymentWebhooksService,
      paymentsService,
    } = buildController();
    const record = { status: WebhookProcessingStatus.RECEIVED };
    stripeWebhookVerifier.verify.mockReturnValue({
      id: 'evt_2',
      type: 'payment_intent.payment_failed',
      data: { object: { metadata: { payment_id: 'payment-1' } } },
    });
    paymentWebhooksService.recordEvent.mockResolvedValue({
      isNew: true,
      record,
    });
    paymentsService.failFromGatewayEvent.mockResolvedValue('processed');

    const result = await controller.handleStripe(fakeRequest() as never);

    expect(result).toEqual({ received: true });
    expect(paymentsService.failFromGatewayEvent).toHaveBeenCalled();
    expect(paymentWebhooksService.markProcessed).toHaveBeenCalledWith(
      record,
      'payment-1',
    );
  });
});
