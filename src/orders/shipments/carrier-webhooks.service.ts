import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CarrierRegistry } from '@/shipping/carriers/carrier.registry';
import { CarrierWebhookEvent } from '@/shipping/entities/carrier-webhook-event.entity';
import { CarrierWebhookStatus } from '@/shipping/enums/carrier-webhook-status.enum';
import { ShipmentEventSource } from './enums/shipment-event-source.enum';
import { ShipmentsService } from './shipments.service';

/**
 * Carrier status callbacks -> shipment events. Each callback is recorded
 * once (carrier, eventKey); a redelivery is acknowledged and skipped.
 * Callbacks we can't apply are acknowledged too (so the carrier stops
 * retrying) and kept with a status explaining why.
 */
@Injectable()
export class CarrierWebhooksService {
  private readonly logger = new Logger(CarrierWebhooksService.name);

  constructor(
    @InjectRepository(CarrierWebhookEvent)
    private readonly eventRepo: Repository<CarrierWebhookEvent>,
    private readonly carriers: CarrierRegistry,
    private readonly shipmentsService: ShipmentsService,
  ) {}

  async handle(
    carrierCode: string,
    body: Record<string, unknown>,
    query: Record<string, string>,
  ): Promise<CarrierWebhookStatus> {
    const provider = this.carriers.resolve(carrierCode);
    if (!provider) throw new NotFoundException('Unknown carrier');
    if (!provider.verifyWebhook(query)) throw new UnauthorizedException();

    const update = provider.parseWebhook(body);
    const record = await this.record(provider.code, update.eventKey, body, {
      trackingNumber: update.trackingNumber,
      carrierStatus: update.carrierStatus,
    });
    if (!record) return CarrierWebhookStatus.PROCESSED; // duplicate

    const finish = async (
      status: CarrierWebhookStatus,
      error?: string,
      shipmentId?: string,
    ) => {
      await this.eventRepo.update(record.id, {
        status,
        errorMessage: error ?? null,
        shipment_id: shipmentId ?? null,
      });
      return status;
    };

    const shipment = await this.shipmentsService.findByTracking(
      provider.code,
      update.trackingNumber,
    );
    if (!shipment) {
      return finish(
        CarrierWebhookStatus.ERROR,
        `No ${provider.code} shipment with tracking number ${update.trackingNumber}`,
      );
    }
    if (!update.status) {
      return finish(CarrierWebhookStatus.UNMAPPED, undefined, shipment.id);
    }

    try {
      await this.shipmentsService.recordEvent(
        shipment.id,
        {
          status: update.status,
          description: update.description ?? undefined,
          occurredAt: update.occurredAt,
        },
        { source: ShipmentEventSource.CARRIER },
        body,
      );
      return finish(CarrierWebhookStatus.PROCESSED, undefined, shipment.id);
    } catch (error) {
      // An impossible move (e.g. "delivered" after "returned"): keep it for
      // a person rather than have the carrier retry forever.
      if (error instanceof BadRequestException) {
        return finish(CarrierWebhookStatus.ERROR, error.message, shipment.id);
      }
      this.logger.error(
        `Applying ${provider.code} update ${update.eventKey} failed`,
        error instanceof Error ? error.stack : error,
      );
      await finish(
        CarrierWebhookStatus.RECEIVED,
        error instanceof Error ? error.message : String(error),
        shipment.id,
      );
      // Our fault: let the carrier retry. The record stays RECEIVED, so the
      // retry is processed rather than treated as a duplicate.
      throw error;
    }
  }

  // Null when this exact update was already handled.
  private async record(
    carrier: string,
    eventKey: string,
    payload: Record<string, unknown>,
    fields: { trackingNumber: string; carrierStatus: string },
  ): Promise<CarrierWebhookEvent | null> {
    try {
      return await this.eventRepo.save(
        this.eventRepo.create({ carrier, eventKey, payload, ...fields }),
      );
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { code?: string }).code === '23505'
      ) {
        const existing = await this.eventRepo.findOneOrFail({
          where: { carrier, eventKey },
        });
        return existing.status === CarrierWebhookStatus.RECEIVED
          ? existing
          : null;
      }
      throw error;
    }
  }
}
