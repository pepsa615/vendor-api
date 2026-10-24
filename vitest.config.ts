import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    exclude: ['test/**', 'node_modules/**', 'dist/**'],
    maxWorkers: 1,
    coverage: {
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 70, functions: 70, branches: 60, statements: 70 },
    },
  },
});
