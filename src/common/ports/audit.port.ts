export interface AuditEvent {
  tenantId: string;
  actorId: string;
  action: string;
  subjectId?: string;
  metadata?: Record<string, unknown>;
}
export interface AuditPort {
  append(event: AuditEvent): Promise<void>;
}
