import { ShipmentStatus } from '@/orders/shipments/enums/shipment-status.enum';

/**
 * GHN order statuses -> our shipment status. Everything between pickup and
 * the doorstep is "in transit"; the return leg is "returning". null means
 * no automatic move: the booking was cancelled, or the parcel is lost /
 * damaged / in an exception state — a person decides.
 */
const GHN_STATUS: Record<string, ShipmentStatus | null> = {
  ready_to_pick: ShipmentStatus.IN_TRANSIT,
  picking: ShipmentStatus.IN_TRANSIT,
  money_collect_picking: ShipmentStatus.IN_TRANSIT,
  picked: ShipmentStatus.IN_TRANSIT,
  storing: ShipmentStatus.IN_TRANSIT,
  transporting: ShipmentStatus.IN_TRANSIT,
  sorting: ShipmentStatus.IN_TRANSIT,
  delivering: ShipmentStatus.IN_TRANSIT,
  money_collect_delivering: ShipmentStatus.IN_TRANSIT,
  delivered: ShipmentStatus.DELIVERED,
  delivery_fail: ShipmentStatus.DELIVERY_FAILED,
  waiting_to_return: ShipmentStatus.RETURNING,
  return: ShipmentStatus.RETURNING,
  return_transporting: ShipmentStatus.RETURNING,
  return_sorting: ShipmentStatus.RETURNING,
  returning: ShipmentStatus.RETURNING,
  return_fail: ShipmentStatus.RETURNING,
  returned: ShipmentStatus.RETURNED,
  cancel: null,
  exception: null,
  damage: null,
  lost: null,
};

export function mapGhnStatus(status: string): ShipmentStatus | null {
  return GHN_STATUS[status] ?? null;
}
