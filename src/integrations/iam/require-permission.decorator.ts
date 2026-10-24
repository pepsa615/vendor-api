import { SetMetadata } from '@nestjs/common';
export const REQUIRED_PERMISSION = 'pepsa.requiredPermission';
export const RequirePermission = (permission: string | readonly string[]) =>
  SetMetadata(REQUIRED_PERMISSION, permission);
