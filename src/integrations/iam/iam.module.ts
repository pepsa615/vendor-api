import { Global, Module } from '@nestjs/common';
import { IamTokenVerifier } from './iam-token-verifier.js';
import { IamAuthGuard } from './iam-auth.guard.js';
import { PermissionGuard } from './permission.guard.js';
@Global()
@Module({
  providers: [IamTokenVerifier, IamAuthGuard, PermissionGuard],
  exports: [IamTokenVerifier, IamAuthGuard, PermissionGuard],
})
export class IamModule {}
