import { Inject, Injectable } from '@nestjs/common';
import { CarrierProvider } from './carrier.interface';

export const CARRIER_PROVIDERS = Symbol('CARRIER_PROVIDERS');

@Injectable()
export class CarrierRegistry {
  private readonly providers = new Map<string, CarrierProvider>();

  constructor(@Inject(CARRIER_PROVIDERS) providers: CarrierProvider[]) {
    for (const p of providers) this.providers.set(p.code.toLowerCase(), p);
  }

  /** Undefined for carriers we don't integrate with (e.g. "manual"). */
  resolve(code: string): CarrierProvider | undefined {
    return this.providers.get(code.toLowerCase());
  }
}
