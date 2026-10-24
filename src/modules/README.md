# Module boundaries

Governance version: `2026.10.14-m0`

Milestone 0 implements only health and integration foundations. Future bounded modules are reserved below and must follow `controllers -> application -> domain ports <- infrastructure`:

- `vendor-profile`, `staff`, `customers`, `dispatchers`
- `orders`, `batching`, `manifests`, `dispatch`, `pricing`
- `settlement`, `notifications`

Do not create placeholder endpoints that imply unfinished business behavior is available.
