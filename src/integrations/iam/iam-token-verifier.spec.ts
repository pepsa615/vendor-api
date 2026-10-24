import { IamTokenVerifier } from './iam-token-verifier.js';
describe('first-party access tokens', () => {
  it('round-trips the server-owned actor, tenant and permissions', async () => {
    const service = new IamTokenVerifier();
    const token = await service.sign({
      actorId: 'actor-1',
      tenantId: 'tenant-1',
      permissions: ['staff.read'],
      tokenVersion: 2,
    });
    await expect(service.verify(token)).resolves.toEqual({
      actorId: 'actor-1',
      tenantId: 'tenant-1',
      permissions: ['staff.read'],
      tokenVersion: 2,
    });
  });
  it('rejects a token from a different signing authority', async () => {
    const issued = await new IamTokenVerifier().sign({
      actorId: 'actor-1',
      tenantId: 'tenant-1',
      permissions: [],
      tokenVersion: 0,
    });
    await expect(new IamTokenVerifier().verify(issued)).rejects.toThrow(
      'Invalid access token',
    );
  });
});
