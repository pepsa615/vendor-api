export const HEALTH_READINESS = Symbol('HEALTH_READINESS');
export interface HealthReadinessPort {
  check(): Promise<void>;
}
