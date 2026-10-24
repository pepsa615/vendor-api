# ADR 0008: M3 order lifecycle and pricing boundaries

Governance version: `2026.10.14-m0`

**Status:** Accepted

M3 uses separate source-aware order and payment states. Vendor-direct orders move from Draft to Ready or Cancelled. Customer-link orders move from Pending Payment to Pending Acceptance after a verified Pepsa Payment event, then to Accepted or Cancelled. Rider assignment and fulfilment states remain owned by M5.

Same-city pricing uses integer road metres from the server-side Google adapter, NGN minor units, and discount basis points. Every active configuration contains exactly four continuous tiers. Tiers one through three use half-open boundaries and tier four includes its configured maximum. Quotes are immutable, expire after fifteen minutes, and snapshot every calculation input.

Parcel category and handling are compulsory order inputs. Categories use the BAS reference identifiers `food_essentials`, `pharmaceutical`, `mail_parcel`, `laundry_clothing`, `electronics_gadgets`, and `large_item`; handling is one of General, Fragile, Perishable, Hazardous, Sensitive, or Oversize. Vendor intake presents contacts, route, parcel, and review as separate steps and creates an unpriced order. Mobility and pricing are not order-intake concerns; they are selected and resolved only when publishing to Open Dispatch.
