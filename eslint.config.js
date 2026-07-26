import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['lumi-core/**', '.lumi/**', 'node_modules/**', 'dist/**', '**/*.js', '**/*.mjs'] },
  { files: ['**/*.ts'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-useless-escape': 'off',
      'no-empty': 'off',
    },
  },
);
