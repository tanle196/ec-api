export enum DiscountRedemptionStatus {
  // Counts toward usageLimit / perUserLimit.
  ACTIVE = 'active',
  // The order was cancelled; the use was given back.
  RELEASED = 'released',
}
