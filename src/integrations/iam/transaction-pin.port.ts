export interface TransactionPinPort {
  verify(actorId: string, challengeToken: string): Promise<boolean>;
}
