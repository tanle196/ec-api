import { MailService } from './mail.service';

describe('MailService', () => {
  const buildService = (currency = 'usd') => {
    const mailerService = { sendMail: jest.fn().mockResolvedValue(undefined) };
    const config = { getStripeConfig: () => ({ currency }) };
    return {
      service: new MailService(mailerService as never, config as never),
      sendMail: mailerService.sendMail,
    };
  };
  const year = new Date().getFullYear().toString();

  it('sends the verification email', async () => {
    const { service, sendMail } = buildService();

    await service.sendVerificationEmail('a@example.com', 'https://verify');

    expect(sendMail).toHaveBeenCalledWith({
      to: 'a@example.com',
      subject: 'Verify your email address',
      template: './verify-email',
      context: { email: 'a@example.com', url: 'https://verify', year },
    });
  });

  it('sends the forgot-password email with the reset URL', async () => {
    const { service, sendMail } = buildService();

    await service.sendForgotPassword('a@example.com', 'https://reset');

    expect(sendMail).toHaveBeenCalledWith({
      to: 'a@example.com',
      subject: 'Reset your password',
      template: './forgot-password',
      context: { email: 'a@example.com', url: 'https://reset', year },
    });
  });

  it('formats money in the configured currency in the order confirmation', async () => {
    const { service, sendMail } = buildService();

    await service.sendOrderConfirmation('a@example.com', {
      orderNumber: 'ORD-1',
      items: [
        {
          productName: 'Áo',
          variantName: 'M',
          quantity: 2,
          unitPrice: 50,
          total: 100,
        },
      ],
      subtotal: 100,
      shippingFee: 10.5,
      discount: 0,
      total: 110.5,
    });

    expect(sendMail).toHaveBeenCalledWith({
      to: 'a@example.com',
      subject: 'Order Confirmation - ORD-1',
      template: './order-confirmation',
      context: {
        email: 'a@example.com',
        orderNumber: 'ORD-1',
        items: [
          {
            productName: 'Áo',
            variantName: 'M',
            quantity: 2,
            unitPrice: '$50.00',
            total: '$100.00',
          },
        ],
        subtotal: '$100.00',
        shippingFee: '$10.50',
        discount: '$0.00',
        total: '$110.50',
        year,
      },
    });
  });

  it('formats VND without decimals', async () => {
    const { service, sendMail } = buildService('vnd');

    await service.sendRefundRequestReceived('a@example.com', {
      reason: 'damaged',
      amount: 150000,
    });

    const [{ context }] = sendMail.mock.calls[0] as [
      { context: { amount: string } },
    ];
    expect(context.amount).toBe('150.000\u00a0₫');
  });

  it('sends the order status update', async () => {
    const { service, sendMail } = buildService();

    await service.sendOrderStatusUpdate('a@example.com', {
      orderNumber: 'ORD-1',
      fromStatus: 'pending',
      toStatus: 'shipped',
    });

    expect(sendMail).toHaveBeenCalledWith({
      to: 'a@example.com',
      subject: 'Order ORD-1 status updated to shipped',
      template: './order-status-update',
      context: {
        email: 'a@example.com',
        orderNumber: 'ORD-1',
        fromStatus: 'pending',
        toStatus: 'shipped',
        year,
      },
    });
  });

  it.each([
    [
      'sendRefundRequestReceived',
      'We received your refund request',
      './refund-request-received',
      false,
    ],
    [
      'sendRefundRequestApproved',
      'Your refund request has been approved',
      './refund-request-approved',
      true,
    ],
    [
      'sendRefundRequestRejected',
      'Your refund request has been rejected',
      './refund-request-rejected',
      true,
    ],
  ] as const)('%s', async (method, subject, template, includesNote) => {
    const { service, sendMail } = buildService();

    await service[method]('a@example.com', {
      reason: 'damaged',
      amount: 25,
      adminNote: 'ok',
    });

    expect(sendMail).toHaveBeenCalledWith({
      to: 'a@example.com',
      subject,
      template,
      context: {
        email: 'a@example.com',
        reason: 'damaged',
        amount: '$25.00',
        ...(includesNote ? { adminNote: 'ok' } : {}),
        year,
      },
    });
  });
});
