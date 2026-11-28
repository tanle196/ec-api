export enum ShipmentStatus {
  // Handed to the carrier, on its way.
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered',
  // A delivery attempt failed; the carrier will retry or send it back.
  DELIVERY_FAILED = 'delivery_failed',
  // On its way back to the warehouse.
  RETURNING = 'returning',
  // Back in the warehouse.
  RETURNED = 'returned',
}
