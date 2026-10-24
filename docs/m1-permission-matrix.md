# M1 Permission Matrix

The authenticated session is the sole source of tenant identity. The immutable owner receives `*`; custom roles receive only explicitly selected capability keys and cannot grant owner status.

| Area             | Read capability           | Manage capability           | Manage permits                                              |
| ---------------- | ------------------------- | --------------------------- | ----------------------------------------------------------- |
| Vendor profile   | `vendor.profile.read`     | `vendor.profile.manage`     | Update tenant profile                                       |
| Staff            | `staff.read`              | `staff.manage`              | Invite, view, disable, and assign roles                     |
| Roles            | `roles.read`              | `roles.manage`              | Create, update, and delete custom roles                     |
| Audit            | `audit.read`              | —                           | View tenant audit evidence                                  |
| Dashboard        | `dashboard.read`          | —                           | View approved-vendor dashboard                              |
| Operations       | `operations.read`         | `operations.manage`         | View assigned manifests and record receiving-vendor actions |
| Manifests        | `manifests.read`          | `manifests.manage`          | Validate IDs and create batches, manifests, and revisions   |
| Dispatch         | `dispatch.read`           | `dispatch.manage`           | Future dispatch actions                                     |
| Dispatchers      | `people.dispatchers.read` | `people.dispatchers.manage` | Future dispatcher actions                                   |
| Customers        | `people.customers.read`   | `people.customers.manage`   | Future customer actions                                     |
| Settlement       | `settlement.read`         | —                           | View settlement data                                        |
| Wallet           | `wallet.read`             | `wallet.manage`             | View or manage wallet features                              |
| Payment settings | `payment-settings.read`   | `payment-settings.manage`   | View or manage payment configuration                        |

All API handlers re-check capabilities server-side. UI filtering is only a usability aid. Role writes reject unknown capability keys, owner assignment, and owner-role mutation.
