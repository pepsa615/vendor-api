# Pepsa Order → Vendor dispatch status webhook

OWN_FLEET and GENERAL_POOL both store `Dispatch.providerReference` as the pepsa-order shipment id. RiderApp progress only reaches the vendor UI when pepsa-order delivers partner webhooks to:

`POST /api/v1/webhooks/pepsa-order`

Without an ACTIVE **PARTNER** subscription pointed at the vendor API, runway stays on `PENDING_MATCH` forever (BAS-only webhooks do not update vendor).

## Register (sandbox / production)

1. As the vendor partner in pepsa-order, create a PARTNER webhook subscription with event types:
   - `dispatch.assigned`
   - `pickup.confirmed`
   - `delivery.confirmed`
   - `delivery.completed`
   - `cancellation.confirmed`
2. Set `endpointUrl` to the vendor API URL above (staging or production), e.g. `https://vendorsandbox-api.pepsa.co/api/v1/webhooks/pepsa-order`.
3. Store the one-time secret as `PEPSA_ORDER_WEBHOOK_SECRET` on the vendor API.
4. Confirm a runway create → rider accept updates vendor status to `PAIRED`.

## Settlement on `COMPLETED`

Automated — not manual docs:

| Mode | Money movement |
| ---- | -------------- |
| `OWN_FLEET` | `commerceDebit` vendor main for `payoutAmountMinor` → `commerceCredit` linked rider main |
| `GENERAL_POOL` | `commerceCredit` assigned rider for `fundingRequiredMinor` (vendor prepaid at create) |

Requires `COMMERCE_CREDIT_ENABLED=true` on pepsa-payment when `NODE_ENV=production`. Idempotency keys: `dispatch-rider-debit:{id}`, `dispatch-rider-credit:{id}`, `dispatch-open-rider-credit:{id}`.

## Mapping

| pepsa-order type          | vendor status |
| ------------------------- | ------------- |
| `dispatch.assigned`       | `PAIRED`      |
| `pickup.confirmed`        | `PICKED_UP`   |
| `delivery.confirmed`      | `DELIVERED`   |
| `delivery.completed`      | `COMPLETED`   |
| `cancellation.confirmed`  | `CANCELLED`   |

Other event types are acknowledged and ignored.
