import { SetMetadata } from '@nestjs/common';

export const ADMIN_PERMISSION_KEY = 'vendor-admin-permission';
export const RequireAdminPermission = (permission: string) =>
  SetMetadata(ADMIN_PERMISSION_KEY, permission);
