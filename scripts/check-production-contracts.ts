import { existsSync, readFileSync } from 'node:fs';

const required = [
  'docs/contracts/platform-event-envelope.v1.schema.json',
  'docs/contracts/order-dispatch-event.v1.schema.json',
  'docs/contracts/rider-provider-event.v1.schema.json',
  'docs/phase6-read-model-decision.md',
  'docs/production-enablement.md',
  'docs/release-evidence.example.json',
  'docs/runbooks/payment-mismatch.md',
  'docs/runbooks/duplicate-conflicting-event.md',
  'docs/runbooks/stuck-order.md',
  'docs/runbooks/provisioning-failure.md',
  'docs/runbooks/incorrect-fee.md',
  'docs/runbooks/provider-ambiguity.md',
  'docs/runbooks/key-rotation.md',
];

const missing = required.filter((path) => !existsSync(path));
if (missing.length)
  throw new Error(`Missing production contracts: ${missing.join(', ')}`);

for (const path of required.filter((value) => value.endsWith('.json'))) {
  const value = JSON.parse(readFileSync(path, 'utf8')) as Record<
    string,
    unknown
  >;
  if (path.includes('schema') && (!value.$schema || !value.$id))
    throw new Error(`${path} is not a versioned JSON schema`);
}

const rider = JSON.parse(
  readFileSync('docs/contracts/rider-provider-event.v1.schema.json', 'utf8'),
) as { properties?: { type?: { enum?: string[] } } };
const requiredRiderEvents = [
  'OFFERED',
  'ACCEPTED',
  'PICKED_UP',
  'POD_CAPTURED',
  'FAILED_ATTEMPT',
  'RTO_STARTED',
  'RTO_COMPLETED',
];
for (const event of requiredRiderEvents)
  if (!rider.properties?.type?.enum?.includes(event))
    throw new Error(`Rider contract is missing ${event}`);

console.log(`Production contract pack valid (${required.length} artifacts).`);
