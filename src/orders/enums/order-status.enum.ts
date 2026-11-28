export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  // The carrier could not deliver; it will retry or send the parcel back.
  DELIVERY_FAILED = 'delivery_failed',
  // The parcel came back to the warehouse undelivered.
  RETURNED_TO_SENDER = 'returned_to_sender',
  // Delivered and the return window has passed.
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  PARTIALLY_REFUNDED = 'partially_refunded',
  REFUNDED = 'refunded',
}
