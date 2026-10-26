import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentGatewayRegistry } from './payment-gateway.registry';

describe('PaymentGatewayRegistry', () => {
  it('resolves a registered provider by its method', () => {
    const stripe = { method: PaymentMethod.STRIPE, initiate: jest.fn() };
    const registry = new PaymentGatewayRegistry([stripe]);

    expect(registry.resolve(PaymentMethod.STRIPE)).toBe(stripe);
  });

  it('returns undefined for an unregistered method', () => {
    const registry = new PaymentGatewayRegistry([]);

    expect(registry.resolve(PaymentMethod.STRIPE)).toBeUndefined();
  });
});
