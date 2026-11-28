import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Payment } from '@/payments/entities/payment.entity';
import { PaymentMethod } from '@/payments/enums/payment-method.enum';
import { PaymentStatus } from '@/payments/enums/payment-status.enum';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import {
  CarrierBooking,
  CarrierBookingRequest,
} from '@/shipping/carriers/carrier.interface';
import { CarrierRegistry } from '@/shipping/carriers/carrier.registry';
import { ShippingRatesService } from '@/shipping/shipping-rates.service';
import { OrderItem } from '../entities/order-item.entity';
import { Order } from '../entities/order.entity';
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

// Parcel side used when the variants don't give their size (cm).
const DEFAULT_SIDE_CM = 10;

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
  private readonly logger = new Logger(ShipmentsService.name);

  constructor(
    @InjectRepository(Shipment)
    private readonly shipmentRepo: Repository<Shipment>,
    private readonly dataSource: DataSource,
    private readonly ordersService: OrdersService,
    private readonly shipmentPolicy: ShipmentPolicy,
    private readonly carriers: CarrierRegistry,
    private readonly shippingRates: ShippingRatesService,
  ) {}

  /**
   * processing -> shipped: the parcel leaves with `carrier`. For an
   * integrated carrier (e.g. GHN) and no tracking number given, the parcel
   * is booked with the carrier first; if recording the hand-over then
   * fails, that booking is cancelled again. A tracking number given by
   * staff means it was booked outside the system, so nothing is booked.
   */
  async handOver(
    orderId: string,
    dto: CreateShipmentDto,
    actor: ShipmentActor,
  ): Promise<Shipment> {
    const provider = dto.trackingNumber
      ? undefined
      : this.carriers.resolve(dto.carrier);

    let booking: CarrierBooking | null = null;
    if (provider) {
      // Checked before calling the carrier so a wrong order isn't booked;
      // the transaction below checks again under the order lock.
      await this.assertReadyToHandOver(orderId);
      booking = await provider.book(
        await this.bookingRequest(orderId, dto.note),
      );
    }

    try {
      return await this.recordHandOver(orderId, dto, actor, booking);
    } catch (error) {
      if (provider && booking) {
        const tracking = booking.trackingNumber;
        await provider
          .cancel(tracking)
          .catch((cancelError: unknown) =>
            this.logger.error(
              `Hand-over of order ${orderId} failed and cancelling ${dto.carrier} booking ${tracking} failed too; cancel it by hand`,
              cancelError instanceof Error ? cancelError.stack : cancelError,
            ),
          );
      }
      throw error;
    }
  }

  private async recordHandOver(
    orderId: string,
    dto: CreateShipmentDto,
    actor: ShipmentActor,
    booking: CarrierBooking | null,
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
          trackingNumber: booking?.trackingNumber ?? dto.trackingNumber ?? null,
          carrierFee: booking?.fee ?? null,
          expectedDeliveryAt: booking?.expectedDeliveryAt ?? null,
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

  /** The shipment a carrier refers to by its tracking number. */
  findByTracking(
    carrier: string,
    trackingNumber: string,
  ): Promise<Shipment | null> {
    return this.shipmentRepo
      .createQueryBuilder('s')
      .where('LOWER(s.carrier) = LOWER(:carrier)', { carrier })
      .andWhere('s.trackingNumber = :trackingNumber', { trackingNumber })
      .orderBy('s.createdAt', 'DESC')
      .getOne();
  }

  private async assertReadyToHandOver(orderId: string): Promise<void> {
    const order = await this.dataSource.manager.findOne(Order, {
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');
    this.shipmentPolicy.assertReadyToShip(order.status);
    const active = await this.findActiveForOrder(orderId);
    if (active) {
      throw new BadRequestException('Order already has a shipment on its way');
    }
  }

  /** What the carrier needs: recipient, contents, parcel size, COD. */
  private async bookingRequest(
    orderId: string,
    note?: string,
  ): Promise<CarrierBookingRequest> {
    const manager = this.dataSource.manager;
    const order = await manager.findOneOrFail(Order, {
      where: { id: orderId },
    });
    if (!order.shippingAddress) {
      throw new BadRequestException('Order has no delivery address');
    }
    const items = await manager.find(OrderItem, {
      where: { order_id: orderId },
    });
    const variantIds = items.flatMap((i) =>
      i.variant_id ? [i.variant_id] : [],
    );
    const variants = variantIds.length
      ? await manager.find(ProductVariant, { where: { id: In(variantIds) } })
      : [];
    const byId = new Map(variants.map((v) => [v.id, v]));

    // Cash the carrier collects: an open cash-on-delivery payment.
    const cod = await manager.findOne(Payment, {
      where: {
        order_id: orderId,
        method: PaymentMethod.COD,
        status: PaymentStatus.PENDING,
      },
    });

    const lines = items.map((item) => {
      const v = item.variant_id ? byId.get(item.variant_id) : undefined;
      return { item, v, weightGrams: v?.weightGrams ?? null };
    });
    const side = (pick: (v: ProductVariant) => number | null) =>
      Math.max(DEFAULT_SIDE_CM, ...lines.map((l) => (l.v && pick(l.v)) || 0));
    const address = order.shippingAddress;

    return {
      reference: order.orderNumber,
      recipient: {
        fullName: address.fullName,
        phone: address.phone,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2 ?? null,
        city: address.city,
        province: address.province,
        districtCode: address.districtCode ?? null,
        wardCode: address.wardCode ?? null,
      },
      items: lines.map((l) => ({
        name: [l.item.productName, l.item.variantName]
          .filter(Boolean)
          .join(' - '),
        quantity: l.item.quantity,
        weightGrams: this.shippingRates.weightOf([
          { weightGrams: l.weightGrams, quantity: 1 },
        ]),
      })),
      parcel: {
        weightGrams:
          order.weightGrams ||
          this.shippingRates.weightOf(
            lines.map((l) => ({
              weightGrams: l.weightGrams,
              quantity: l.item.quantity,
            })),
          ),
        lengthCm: side((v) => v.lengthCm),
        widthCm: side((v) => v.widthCm),
        // Items stacked.
        heightCm: Math.max(
          DEFAULT_SIDE_CM,
          lines.reduce(
            (sum, l) => sum + (l.v?.heightCm ?? 0) * l.item.quantity,
            0,
          ),
        ),
      },
      codAmount: cod ? Number(cod.amount) : 0,
      insuranceValue: Number(order.subtotal),
      note,
    };
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
