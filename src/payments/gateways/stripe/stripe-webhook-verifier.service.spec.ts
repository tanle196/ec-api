import { BadRequestException } from '@nestjs/common';
import { StripeWebhookVerifierService } from './stripe-webhook-verifier.service';

describe('StripeWebhookVerifierService', () => {
  const buildService = () => {
    const constructEvent = jest.fn();
    const stripeClient = { client: { webhooks: { constructEvent } } };
    const config = {
      getStripeConfig: () => ({ webhookSecret: 'whsec_test' }),
    };
    const service = new StripeWebhookVerifierService(
      stripeClient as never,
      config as never,
    );
    return { service, constructEvent };
  };

  it('returns the verified event using the configured webhook secret', () => {
    const { service, constructEvent } = buildService();
    const event = { id: 'evt_1' };
    constructEvent.mockReturnValue(event);
    const body = Buffer.from('{}');

    expect(service.verify(body, 'sig')).toBe(event);
    expect(constructEvent).toHaveBeenCalledWith(body, 'sig', 'whsec_test');
  });

  it('throws BadRequestException when the signature is invalid', () => {
    const { service, constructEvent } = buildService();
    constructEvent.mockImplementation(() => {
      throw new Error('bad signature');
    });

    expect(() => service.verify(Buffer.from('{}'), 'sig')).toThrow(
      BadRequestException,
    );
  });
});
