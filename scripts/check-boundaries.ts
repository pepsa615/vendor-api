import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../src/', import.meta.url).pathname;
const files: string[] = [];
const visit = (directory: string) => {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) visit(path);
    else if (path.endsWith('.ts')) files.push(path);
  }
};
visit(root);

const violations: string[] = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const name = relative(root, file);
  if (name.includes('/controllers/') || name.endsWith('.controller.ts')) {
    if (source.includes('PrismaService') || source.includes('@prisma/'))
      violations.push(`${name}: controller imports persistence`);
  }
  if (
    name.includes('/domain/') &&
    (source.includes('@nestjs/') || source.includes('@prisma/'))
  ) {
    violations.push(`${name}: domain imports framework or persistence`);
  }
  if (name.includes('/application/') && source.includes('@prisma/')) {
    violations.push(`${name}: application imports Prisma implementation`);
  }
}
if (violations.length)
  throw new Error(
    `Architecture boundary violations:\n${violations.join('\n')}`,
  );
console.log(
  `Architecture boundaries verified across ${files.length} TypeScript files.`,
);
