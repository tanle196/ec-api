export enum InventoryMovementReason {
  // Balance carried over when the ledger was introduced.
  OPENING_BALANCE = 'opening_balance',
  // Stock a variant was created with.
  INITIAL_STOCK = 'initial_stock',
  // Order placed: available -> reserved.
  ORDER_RESERVE = 'order_reserve',
  // Order cancelled or edited before shipping: reserved -> available.
  ORDER_RELEASE = 'order_release',
  // Order handed to the carrier: leaves the warehouse.
  ORDER_SHIP = 'order_ship',
  // Goods received on a confirmed stock receipt.
  PURCHASE_IN = 'purchase_in',
  // Manual correction (stocktake, damage, loss...).
  ADJUSTMENT = 'adjustment',
}
