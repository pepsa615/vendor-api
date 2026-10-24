# Vendor–Admin production enablement

No checkbox in this document may be completed from code inspection alone. Attach the evidence ID, owner and UTC timestamp. Staging and production use independent databases, queues, private storage, provider accounts, URLs, secrets and relationship signing keys; there is no runtime environment switch.

## Infrastructure

- [ ] Staging resources and secret-manager references provisioned
- [ ] Production resources and secret-manager references provisioned
- [ ] Unique Admin→Vendor, Vendor→Payment, Payment→Vendor, Vendor→Order, Order→Vendor and provider key IDs verified
- [ ] Network allow-lists/private routes and request-size/rate limits verified
- [ ] Forward-only migrations applied and point-in-time restore proven

## Certification

- [ ] Contract compatibility and event schema checks
- [ ] Load and soak report
- [ ] Penetration/security report
- [ ] Keyboard, screen-reader and responsive accessibility report
- [ ] Queue restart, dead-letter and worker recovery drill
- [ ] Payment, Order and provider outage drills
- [ ] Backup/restore and rollback drills
- [ ] Onboarding/provisioning, customer checkout, own fleet, General Pool, inter-vendor manifest, settlement, fees, refund/cancellation and reconciliation journeys

## Pilot gates

- [ ] Canary cohort and dates recorded
- [ ] Zero unexplained monetary variance
- [ ] Zero duplicate projections or Order submissions
- [ ] Zero cross-tenant exposure
- [ ] 99% Payment delivery within 60 seconds
- [ ] 100% eventual processing or visible exception
- [ ] 100% immutable fee snapshot coverage
- [ ] 100% privileged mutation audit correlation

## Rollback

Disable new Admin mutations and scheduled fee activation. Preserve reads, audit/evidence, reconciliation, event delivery and in-flight completion/refund/support. Never roll back by deleting migrations, ledger entries, assessments, inbox events or audit records.

## Sign-off

| Role        | Name | Evidence ID | UTC date |
| ----------- | ---- | ----------- | -------- |
| Product     |      |             |          |
| Finance     |      |             |          |
| Security    |      |             |          |
| Operations  |      |             |          |
| Engineering |      |             |          |
