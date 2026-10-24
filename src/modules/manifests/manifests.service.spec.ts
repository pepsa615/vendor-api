import { describe, expect, it } from 'vitest';
import { ManifestsService } from './manifests.service.js';

describe('ManifestsService', () => {
  const service = new ManifestsService({} as never, {} as never);

  it('normalizes comma and newline separated tracking IDs and reports duplicates', () => {
    expect(service.parse(' o-abcd, O-EFGH\no-abcd ')).toEqual({
      submitted: ['O-ABCD', 'O-EFGH', 'O-ABCD'],
      unique: ['O-ABCD', 'O-EFGH'],
      duplicates: ['O-ABCD'],
    });
  });

  it('rejects more than 500 tracking IDs', () => {
    expect(() =>
      service.parse(
        Array.from({ length: 501 }, (_, index) => `O-${index}`).join(','),
      ),
    ).toThrow('A maximum of 500 tracking IDs is allowed');
  });
});
