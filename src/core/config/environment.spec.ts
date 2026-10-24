import { describe, expect, it } from 'vitest';
import { loadEnvironment } from './environment.js';

const valid = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/vendor',
  IAM_ISSUER: 'https://iam.pepsa.test',
  IAM_AUDIENCE: 'vendor-api',
  IAM_JWKS_URL: 'https://iam.pepsa.test/.well-known/jwks.json',
};

describe('loadEnvironment', () => {
  it('parses safe defaults and an origin list', () => {
    expect(
      loadEnvironment({
        ...valid,
        CORS_ORIGINS: 'https://one.test,https://two.test',
      }).CORS_ORIGINS,
    ).toEqual(['https://one.test', 'https://two.test']);
  });
  it('fails closed when security-critical configuration is missing', () => {
    expect(() => loadEnvironment({ NODE_ENV: 'production' })).toThrow(
      'Invalid environment configuration',
    );
  });
});
