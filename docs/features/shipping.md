# Shipping

## Overview
- **Purpose**: Price shipping at checkout from the shop's own rate table, and book / track parcels with carriers (GHN first).
- **Scope**: `src/shipping/` (rate table, carrier adapters, locations) and `src/orders/shipments/` (bookings on hand-over, carrier webhooks). Shipment statuses and how they move orders: see [orders.md](orders.md).

---

## Shipping fee at checkout
- Charged from the **shop's rate table** (`shipping_rates`), never from a carrier API, so checkout doesn't depend on a carrier being up.
- Zone: `intra_province` when the address's province matches `SHOP_PROVINCE` (spelling-insensitive: "TP. Hồ Chí Minh" = "Thành phố Hồ Chí Minh"), else `inter_province`.
- Fee = `baseFee` up to `baseWeightGrams`, plus `stepFee` per started `stepWeightGrams` above it.
- Weight = Σ quantity × variant `weightGrams` (`DEFAULT_ITEM_WEIGHT_GRAMS`, default 500 g, when unknown); stored on the order (`weightGrams`).
- No rate for the zone yet → `SHIPPING_FLAT_FEE`.
- Free shipping:
  - subtotal ≥ `FREE_SHIPPING_THRESHOLD` (0 = off), or
  - a `free_shipping` discount code: takes nothing off the lines; the order's `shippingFee` becomes 0 and the redemption records the waived fee.
- Editing a pending order re-prices shipping: new items → new weight; new address → new zone (line `shippingAmount`/`paidAmount` re-spread, pending payments voided).
- `POST /shipping/quote` `{ address_id, items?, discountCode? }` (items default to the cart) returns exactly what checkout will charge.
- Admin: `GET /admin/shipping-rates`, `PUT /admin/shipping-rates/:zone`.

## Carriers
- Adapter interface `CarrierProvider` (`book`, `cancel`, `verifyWebhook`, `parseWebhook`), registry keyed by `Shipment.carrier` (case-insensitive).
- **Hand-over** (`POST /admin/orders/:orderId/shipments { carrier }`): for an integrated carrier and no `trackingNumber` given, the parcel is booked first (recipient from the order's address snapshot, items, parcel size from variant dimensions with 10 cm minimum per side and heights stacked, COD = the open cash-on-delivery payment, declared value = subtotal). The tracking number, carrier fee and ETA are stored on the shipment. If recording the hand-over fails afterwards, the booking is cancelled. A `trackingNumber` from staff means the parcel was booked outside the system: nothing is booked.
- **Webhooks**: `POST /shipping/webhooks/:carrier`. Verified, recorded once per `(carrier, eventKey)` in `carrier_webhook_events`, matched to the shipment by tracking number, mapped and applied as a shipment event (source `carrier`). Updates we can't apply are acknowledged (200) and kept: `error` (unknown parcel, impossible move) or `unmapped` (cancelled, lost, damaged, exception). A failure on our side returns 5xx so the carrier retries.

### GHN
- Enabled when `GHN_TOKEN` and `GHN_SHOP_ID` are set (`GHN_API_URL` defaults to the dev environment).
- Booking: `POST /v2/shipping-order/create`, shop pays GHN (`payment_type_id` 1), `GHN_REQUIRED_NOTE`, `GHN_SERVICE_TYPE_ID`. Requires the address's GHN `districtCode` + `wardCode`.
- Address picker data: `GET /shipping/locations` (provinces), `?province_id=` (districts), `?district_id=` (wards), proxied from GHN master data and cached for a day.
- Webhook URL to register with GHN: `/shipping/webhooks/ghn?token=<GHN_WEBHOOK_SECRET>` (GHN doesn't sign callbacks).
- Status map: `ready_to_pick` … `delivering` → `in_transit`; `delivered`; `delivery_fail`; `waiting_to_return` / `return*` / `returning` → `returning`; `returned`; `cancel` / `exception` / `damage` / `lost` → unmapped.

## Known gaps
- The GHN adapter follows GHN API v2 as documented but has not been run against a real GHN account; verify payloads, the post-2025 location model, and webhook fields in the GHN sandbox.
- No carrier fee quote at checkout by design; carrier fee vs. charged fee is only recorded (`shipment.carrierFee`).
- COD cash remitted by the carrier is booked via `POST /admin/cod-settlements` (see payments.md).
