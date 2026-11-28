import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus } from '../../enums/order-status.enum';
import { ShipmentStatus } from '../enums/shipment-status.enum';

@Injectable()
export class ShipmentPolicy {
  private static readonly TRANSITIONS: Record<
    ShipmentStatus,
    ShipmentStatus[]
  > = {
    [ShipmentStatus.IN_TRANSIT]: [
      ShipmentStatus.DELIVERED,
      ShipmentStatus.DELIVERY_FAILED,
    ],
    [ShipmentStatus.DELIVERY_FAILED]: [
      ShipmentStatus.IN_TRANSIT, // re-attempt
      ShipmentStatus.DELIVERED,
      ShipmentStatus.RETURNING,
    ],
    [ShipmentStatus.RETURNING]: [ShipmentStatus.RETURNED],
    [ShipmentStatus.DELIVERED]: [],
    [ShipmentStatus.RETURNED]: [],
  };

  // What the order becomes when its shipment moves. RETURNING keeps the
  // order at delivery_failed until the parcel is actually back.
  private static readonly ORDER_STATUS: Record<ShipmentStatus, OrderStatus> = {
    [ShipmentStatus.IN_TRANSIT]: OrderStatus.SHIPPED,
    [ShipmentStatus.DELIVERED]: OrderStatus.DELIVERED,
    [ShipmentStatus.DELIVERY_FAILED]: OrderStatus.DELIVERY_FAILED,
    [ShipmentStatus.RETURNING]: OrderStatus.DELIVERY_FAILED,
    [ShipmentStatus.RETURNED]: OrderStatus.RETURNED_TO_SENDER,
  };

  assertCanMove(from: ShipmentStatus, to: ShipmentStatus): void {
    if (!ShipmentPolicy.TRANSITIONS[from].includes(to))
      throw new BadRequestException(
        `Cannot move shipment from "${from}" to "${to}"`,
      );
  }

  orderStatusFor(status: ShipmentStatus): OrderStatus {
    return ShipmentPolicy.ORDER_STATUS[status];
  }

  assertReadyToShip(orderStatus: OrderStatus): void {
    if (orderStatus !== OrderStatus.PROCESSING)
      throw new BadRequestException(
        `Only processing orders can be handed to a carrier (order is "${orderStatus}")`,
      );
  }

  isActive(status: ShipmentStatus): boolean {
    return [
      ShipmentStatus.IN_TRANSIT,
      ShipmentStatus.DELIVERY_FAILED,
      ShipmentStatus.RETURNING,
    ].includes(status);
  }
}
