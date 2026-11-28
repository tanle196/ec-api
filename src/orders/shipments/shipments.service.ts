import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { OrderStatusChangeActor } from '../enums/order-status-change-actor.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { OrdersService } from '../orders.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { RecordShipmentEventDto } from './dto/record-shipment-event.dto';
import { ShipmentEvent } from './entities/shipment-event.entity';
import { Shipment } from './entities/shipment.entity';
import { ShipmentEventSource } from './enums/shipment-event-source.enum';
import { ShipmentStatus } from './enums/shipment-status.enum';
import { ShipmentPolicy } from './policies/shipment.policy';

const ACTIVE = [
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.DELIVERY_FAILED,
  ShipmentStatus.RETURNING,
];

export interface ShipmentActor {
  source: ShipmentEventSource;
  actorId?: string;
}

/**
 * Hands orders to carriers and records what happens to the parcel; each
 * step moves the order with it (OrdersService.applyShipmentProgress), in
 * one transaction. Carrier integrations will call `recordEvent` with
 * source CARRIER; staff use the admin API.
 */
@Injectable()
export class ShipmentsService {
  constructor(
    @InjectRepository(Shipment)
    private readonly shipmentRepo: Repository<Shipment>,
    private readonly dataSource: DataSource,
    private readonly ordersService: OrdersService,
    private readonly shipmentPolicy: ShipmentPolicy,
  ) {}

  /** processing -> shipped: the parcel leaves with `carrier`. */
  async handOver(
    orderId: string,
    dto: CreateShipmentDto,
    actor: ShipmentActor,
  ): Promise<Shipment> {
    const id = await this.dataSource.transaction(async (manager) => {
      // Moves the order first: it locks the order row and refuses unless
      // the order is ready to ship, which also serializes two hand-overs.
      await this.ordersService.applyShipmentProgress(
        manager,
        orderId,
        OrderStatus.SHIPPED,
        this.orderActor(actor, dto.note ?? `Handed to ${dto.carrier}`),
      );

      const active = await manager.findOne(Shipment, {
        where: { order_id: orderId, status: In(ACTIVE) },
      });
      if (active) {
        throw new BadRequestException(
          'Order already has a shipment on its way',
        );
      }

      const now = new Date();
      const shipment = await manager.save(
        Shipment,
        manager.create(Shipment, {
          order_id: orderId,
          status: ShipmentStatus.IN_TRANSIT,
          carrier: dto.carrier,
          trackingNumber: dto.trackingNumber ?? null,
          attempts: 1,
          shippedAt: now,
        }),
      );
      await this.addEvent(manager, shipment, {
        status: ShipmentStatus.IN_TRANSIT,
        description: dto.note ?? `Handed to ${dto.carrier}`,
        occurredAt: now,
        actor,
      });
      return shipment.id;
    });
    return this.findOne(id);
  }

  /**
   * Records a tracking update and moves the order accordingly. Repeating
   * the shipment's current status (carriers resend updates) only adds to
   * the history.
   */
  async recordEvent(
    shipmentId: string,
    dto: RecordShipmentEventDto,
    actor: ShipmentActor,
    raw?: Record<string, unknown>,
  ): Promise<Shipment> {
    await this.dataSource.transaction(async (manager) => {
      const shipment = await manager.findOne(Shipment, {
        where: { id: shipmentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!shipment) throw new NotFoundException('Shipment not found');

      const occurredAt = dto.occurredAt ?? new Date();
      if (shipment.status !== dto.status) {
        this.shipmentPolicy.assertCanMove(shipment.status, dto.status);

        if (
          shipment.status === ShipmentStatus.DELIVERY_FAILED &&
          dto.status === ShipmentStatus.IN_TRANSIT
        ) {
          shipment.attempts += 1;
        }
        if (dto.status === ShipmentStatus.DELIVERED)
          shipment.deliveredAt = occurredAt;
        if (dto.status === ShipmentStatus.RETURNED)
          shipment.returnedAt = occurredAt;
        shipment.status = dto.status;
        await manager.save(Shipment, shipment);

        await this.ordersService.applyShipmentProgress(
          manager,
          shipment.order_id,
          this.shipmentPolicy.orderStatusFor(dto.status),
          this.orderActor(
            actor,
            dto.description ?? `Shipment ${dto.status.replace(/_/g, ' ')}`,
          ),
        );
      }

      await this.addEvent(manager, shipment, {
        status: dto.status,
        description: dto.description ?? null,
        occurredAt,
        actor,
        raw,
      });
    });
    return this.findOne(shipmentId);
  }

  /** The order's active shipment (for status shortcuts from the order). */
  async findActiveForOrder(orderId: string): Promise<Shipment | null> {
    return this.shipmentRepo.findOne({
      where: { order_id: orderId, status: In(ACTIVE) },
    });
  }

  async findForOrder(orderId: string): Promise<Shipment[]> {
    return this.shipmentRepo.find({
      where: { order_id: orderId },
      relations: ['events'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Shipment> {
    const shipment = await this.shipmentRepo.findOne({
      where: { id },
      relations: ['events'],
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    return shipment;
  }

  private orderActor(actor: ShipmentActor, note: string) {
    return {
      actorType:
        actor.source === ShipmentEventSource.ADMIN
          ? OrderStatusChangeActor.ADMIN
          : OrderStatusChangeActor.SYSTEM,
      actorId: actor.actorId,
      note,
    };
  }

  private async addEvent(
    manager: EntityManager,
    shipment: Shipment,
    event: {
      status: ShipmentStatus;
      description: string | null;
      occurredAt: Date;
      actor: ShipmentActor;
      raw?: Record<string, unknown>;
    },
  ): Promise<void> {
    await manager.save(
      ShipmentEvent,
      manager.create(ShipmentEvent, {
        shipment_id: shipment.id,
        status: event.status,
        description: event.description,
        occurredAt: event.occurredAt,
        source: event.actor.source,
        actorId: event.actor.actorId ?? null,
        raw: event.raw ?? null,
      }),
    );
  }
}
