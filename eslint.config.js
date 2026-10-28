import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    ignores: ['dist/**', 'generated/**', 'coverage/**'],
  },
);
