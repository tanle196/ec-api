// Outbox event types published by the orders module.
export const OrderEvents = {
  // { orderId }
  PLACED: 'order.placed',
  // { orderId, fromStatus, toStatus }
  STATUS_CHANGED: 'order.status_changed',
  // { orderId } — the parcel came back undelivered; money goes back.
  RETURNED_TO_SENDER: 'order.returned_to_sender',
} as const;

export interface OrderEventPayload {
  orderId: string;
  fromStatus?: string | null;
  toStatus?: string;
}
