export enum PaymentIssueType {
  // Paid after the order was cancelled and the stock was gone: refunded
  // automatically. Someone should tell the customer.
  LATE_PAYMENT_REFUNDED = 'late_payment_refunded',
  // Same, but the automatic refund failed: refund by hand.
  LATE_PAYMENT_REFUND_FAILED = 'late_payment_refund_failed',
  // The gateway captured a different amount than the payment asked for.
  AMOUNT_MISMATCH = 'amount_mismatch',
  // The gateway says paid but no webhook ever told us; fixed automatically.
  WEBHOOK_MISSED = 'webhook_missed',
  // We have it as paid, the gateway does not.
  GATEWAY_NOT_PAID = 'gateway_not_paid',
  // The gateway answered with a state we can't map (reversal, fraud hold...).
  GATEWAY_STATUS_UNKNOWN = 'gateway_status_unknown',
  // A paid payment sits on a cancelled order with no refund.
  PAID_ON_CANCELLED_ORDER = 'paid_on_cancelled_order',
  // Carrier remitted a different COD amount than the order total.
  COD_AMOUNT_MISMATCH = 'cod_amount_mismatch',
  // Carrier remitted COD for an order we don't have as delivered.
  COD_NOT_DELIVERED = 'cod_not_delivered',
}
