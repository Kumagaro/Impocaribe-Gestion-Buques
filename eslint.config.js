import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/out/**', '**/coverage/**', 'packages/android/android/**', 'docs/referencia/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
);
