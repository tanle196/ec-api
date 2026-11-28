import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminShippingController } from './admin-shipping.controller';
import {
  CARRIER_PROVIDERS,
  CarrierRegistry,
} from './carriers/carrier.registry';
import { GhnProvider } from './carriers/ghn/ghn.provider';
import { CarrierWebhookEvent } from './entities/carrier-webhook-event.entity';
import { ShippingRate } from './entities/shipping-rate.entity';
import { ShippingLocationsController } from './shipping-locations.controller';
import { ShippingRatesService } from './shipping-rates.service';

// Rates and carrier adapters. Depends on nothing order-related, so
// OrdersModule can import it; carrier webhooks and bookings that move
// shipments live in orders/shipments.
@Module({
  imports: [TypeOrmModule.forFeature([ShippingRate, CarrierWebhookEvent])],
  controllers: [AdminShippingController, ShippingLocationsController],
  providers: [
    ShippingRatesService,
    GhnProvider,
    CarrierRegistry,
    {
      provide: CARRIER_PROVIDERS,
      useFactory: (ghn: GhnProvider) => (ghn.isConfigured() ? [ghn] : []),
      inject: [GhnProvider],
    },
  ],
  exports: [ShippingRatesService, CarrierRegistry, TypeOrmModule],
})
export class ShippingModule {}
