export const PERMISSIONS = [
  'vendor.profile.read',
  'vendor.profile.manage',
  'staff.read',
  'staff.manage',
  'roles.read',
  'roles.manage',
  'audit.read',
  'dashboard.read',
  'operations.read',
  'operations.manage',
  'orders.read',
  'orders.manage',
  'manifests.read',
  'manifests.manage',
  'dispatch.read',
  'dispatch.manage',
  'people.dispatchers.read',
  'people.dispatchers.manage',
  'people.customers.read',
  'people.customers.manage',
  'settlement.read',
  'wallet.read',
  'wallet.manage',
  'payment-settings.read',
  'payment-settings.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export const isPermission = (value: string): value is Permission =>
  (PERMISSIONS as readonly string[]).includes(value);
