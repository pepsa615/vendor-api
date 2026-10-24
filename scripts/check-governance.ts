import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const required = [
  'AGENTS.md',
  'ARCHITECTURE.md',
  'ROADMAP.md',
  'CLAUDE.md',
  'GEMINI.md',
  'ANTIGRAVITY.md',
  'docs/progress-log.md',
  'docs/product-reference.md',
  'docs/security.md',
  '.agents/skills/pepsa-vendor/SKILL.md',
  '.cursor/rules/pepsa-vendor.mdc',
  '.grok/instructions.md',
  '.github/copilot-instructions.md',
];
const missing = required.filter((path) => !existsSync(path));
if (missing.length)
  throw new Error(`Missing governance files: ${missing.join(', ')}`);
const version = /Governance version: `([^`]+)`/.exec(
  readFileSync('AGENTS.md', 'utf8'),
)?.[1];
if (!version) throw new Error('AGENTS.md has no governance version');
for (const path of required.filter((path) => path.endsWith('.md'))) {
  const content = readFileSync(path, 'utf8');
  if (path !== 'docs/progress-log.md' && !content.includes(version))
    throw new Error(`${path} does not reference governance version ${version}`);
}
const hash = createHash('sha256')
  .update(required.map((path) => readFileSync(path)).join(''))
  .digest('hex')
  .slice(0, 12);
console.log(`Governance ${version} valid; local content checksum ${hash}.`);
