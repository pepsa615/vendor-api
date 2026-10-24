# Phase 6 reporting/read-model decision

Decision date: 24 October 2026

Vendor remains authoritative for live operational detail and mutations. Admin uses bounded Vendor APIs for current detail and a KPI response calculated from source tables with an explicit `asOf`, watermark, timezone, currency, freshness, classification and data-quality state. At current measured development volume, a second durable Admin database projection would add reconciliation risk without a demonstrated scaling benefit.

The extraction threshold is sustained production traffic above 50 read requests/second or a p95 KPI query above 750 ms for seven days. Crossing either threshold requires an event-fed Admin projection keyed by immutable event ID, while source APIs remain authoritative. Financial values from Vendor remain `PROJECTED`; Payment totals must never be summed with those projections.

Retention is seven years for financial, approval and audit evidence and two years for detailed operational/KPI data. Exports are limited to authorized, bounded server ranges, formula-safe encoded and included in quarterly access review.
