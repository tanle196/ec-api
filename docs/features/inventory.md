# Inventory

## Overview
- **Purpose**: Keep stock correct and auditable: reserve stock for orders, consume it on shipment, give it back on cancellation, receive purchased goods with cost, and correct stock after a count.
- **Scope**: `src/inventory/` (ledger service, stock receipts, audit, admin API). Orders call it to reserve/release/ship; products call it when variants are created or their stock is set.
- **Entry point**: `AdminInventoryController` (`/admin/inventory`), `InventoryService` (used by `OrdersService` and `ProductsService`).

---

## Model

| Counter | Meaning |
|---|---|
| `product_variants.stock` | Available to sell. Everything that asks "can I sell N?" (cart, checkout, storefront) reads this. |
| `product_variants.reserved` | Held for orders that are placed but not shipped. |
| on hand = `stock + reserved` | Units physically in the warehouse. |

Every change to `stock`/`reserved` goes through `InventoryService` and writes an `inventory_movements` row in the same transaction. The ledger is append-only. For every variant:

```
SUM(onHandDelta)   = stock + reserved
SUM(reservedDelta) = reserved
```

`InventoryAuditService` checks this nightly (02:00, logs an error listing mismatched SKUs) and on demand (`GET /admin/inventory/audit`).

| Reason | When | onHand | reserved | available |
|---|---|---|---|---|
| `opening_balance` | Ledger introduced (migration) | stock + reserved | reserved | — |
| `initial_stock` | Variant created with stock | +n | 0 | +n |
| `order_reserve` | Order placed / edited | 0 | +n | −n |
| `order_release` | Order cancelled, expired or edited | 0 | −n | +n |
| `order_ship` | Order moved to `shipped` | −n | −n | 0 |
| `purchase_in` | Stock receipt confirmed | +n | 0 | +n |
| `adjustment` | Stocktake / correction / product form | ±n | 0 | ±n |

---

## Business Rules

- **Reserve** uses a conditional `UPDATE ... WHERE stock >= qty AND isActive` so two orders racing for the last units can't both win; the loser gets `422 Insufficient stock for variant <sku>` (or `422 Variant <sku> is no longer available` if it was deactivated).
- All multi-variant operations merge repeated variants and lock rows in variant-id order, so concurrent transactions sharing variants can't deadlock.
- **Release** skips lines whose variant was deleted. If a variant holds fewer reserved units than released (data predating the ledger), the shortfall is restored to available as found stock, logged, and recorded so the ledger still balances.
- **Ship** consumes the reservation; units that were not reserved must be covered by available stock (`422 Not enough stock to ship variant <sku>`). The variant's `avgCost` is snapshotted on each order line as `unitCost`.
- **Adjustments** (`POST /admin/inventory/adjustments`) take exactly one of `onHand` (the counted quantity) or `delta`, plus a required `note`. On hand cannot go below `reserved` (`422`). A zero change is rejected (`400`).
- **Stock receipts** (phiếu nhập): created as `draft` (editable; `items` replaces the list), then `confirmed` (adds stock, updates average cost) or `cancelled`. Only drafts can change (`400`). A variant may appear once per receipt. Confirm locks the receipt row so it can't be booked twice.
- **Average cost** is weighted: `(onHand × avgCost + qty × unitCost) / (onHand + qty)`. With nothing on hand or no cost yet, the receipt's unit cost becomes the average.
- The database rejects negative `stock`/`reserved` (`CHECK` constraints).
- **Low stock**: `GET /admin/inventory/low-stock` lists active variants whose `stock <= lowStockThreshold`.

---

## Endpoints (`/admin/inventory`, `JwtAuthGuard` + `PermissionsGuard`)

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/variants` | `inventory.read` | Available / reserved / on hand / cost per variant (`product_id`, `search`) |
| GET | `/low-stock` | `inventory.read` | Variants at or below their threshold |
| GET | `/movements` | `inventory.read` | Ledger, newest first (`variant_id`, `reason`, `ref_type`, `ref_id`) |
| GET | `/audit` | `inventory.read` | Counter vs ledger check |
| POST | `/adjustments` | `inventory.update` | Stocktake or correction |
| POST | `/receipts` | `inventory.create` | Create draft receipt |
| GET | `/receipts`, `/receipts/:id` | `inventory.read` | List / get receipts |
| PATCH | `/receipts/:id` | `inventory.create` | Edit draft |
| POST | `/receipts/:id/confirm` | `inventory.update` | Book into stock |
| POST | `/receipts/:id/cancel` | `inventory.update` | Cancel draft |

---

## Known Gaps
- Returned goods are not restocked yet (return/RMA flow).
- `delivery_failed` / returned-to-sender is not modelled yet (fulfillment flow).
- Single warehouse only.
- Low-stock is a report only; no notification is sent yet.
