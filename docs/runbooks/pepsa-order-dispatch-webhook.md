# Pepsa Order → Vendor dispatch status webhook

OWN_FLEET and GENERAL_POOL both store `Dispatch.providerReference` as the pepsa-order shipment id. RiderApp progress only reaches the vendor UI when pepsa-order delivers partner webhooks to:

`POST /api/v1/webhooks/pepsa-order`

## Register (sandbox / production)

1. As the vendor partner in pepsa-order, create a PARTNER webhook subscription with event types:
   - `dispatch.assigned`
   - `pickup.confirmed`
   - `delivery.confirmed`
   - `delivery.completed`
   - `cancellation.confirmed`
2. Set `endpointUrl` to the vendor API URL above (staging or production).
3. Store the one-time secret as `PEPSA_ORDER_WEBHOOK_SECRET` on the vendor API.
4. Confirm a runway create → rider accept updates vendor status to `PAIRED`.

## Mapping

| pepsa-order type          | vendor status |
| ------------------------- | ------------- |
| `dispatch.assigned`       | `PAIRED`      |
| `pickup.confirmed`        | `PICKED_UP`   |
| `delivery.confirmed`      | `DELIVERED`   |
| `delivery.completed`      | `COMPLETED`   |
| `cancellation.confirmed`  | `CANCELLED`   |

Other event types are acknowledged and ignored.
