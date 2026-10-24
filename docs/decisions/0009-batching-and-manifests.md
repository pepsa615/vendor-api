# ADR 0009: M4 batching and manifest lifecycle

Governance version: `2026.10.14-m0`

**Status:** Accepted

M4 uses one manifest aggregate for outbound Travel Manifests and inbound Assigned Manifests, presented as direction-specific views. Finalization is preceded by a server-issued preview and atomically creates immutable batch or manifest records. Requested manifest changes create immutable revisions under the same manifest and waybill identifiers.

The lifecycle is Sent, Change Requested, Declined, Accepted, In Transit, Rerouted or Remote Location, and Delivered. The receiving vendor owns response and transit actions. Both vendors can read the append-only action history. Dispatch-ready vendor and paid accepted customer-link orders are eligible; active membership is exclusive. Waybills are generated as version-specific PDFs on demand.
