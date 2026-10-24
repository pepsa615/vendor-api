export interface AuthenticatedActor {
  actorId: string;
  tenantId: string;
  permissions: readonly string[];
  tokenVersion?: number;
}
