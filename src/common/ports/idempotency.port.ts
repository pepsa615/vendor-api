export interface IdempotencyPort {
  execute<T>(
    tenantId: string,
    key: string,
    operation: () => Promise<T>,
  ): Promise<T>;
}
