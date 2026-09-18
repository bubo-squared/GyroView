// Lint gate for production packages. The Phase 0 spike is throwaway and excluded.
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

const FUNCTION_LENGTH_LIMIT = 30;
const FILE_LENGTH_LIMIT = 300;
const COMPLEXITY_LIMIT = 8;
const NESTING_LIMIT = 3;
const PARAMETER_LIMIT = 3;

/** Class layout: fields, constructor, static factories, accessors, then instance methods by visibility. */
const MEMBER_ORDER = [
  'signature',
  'public-static-field',
  'protected-static-field',
  'private-static-field',
  'public-instance-field',
  'protected-instance-field',
  'private-instance-field',
  'constructor',
  'public-static-method',
  'protected-static-method',
  'private-static-method',
  ['public-get', 'public-set'],
  'public-instance-method',
  'protected-instance-method',
  'private-instance-method',
];

export default defineConfig(
  globalIgnores(['**/node_modules/', '**/dist/', '**/coverage/', 'spike/', 'test/fixtures/']),
  {
    files: ['packages/**/*.ts', 'apps/**/*.ts', 'tools/**/*.ts', 'test/**/*.ts'],
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      unicorn.configs.recommended,
      prettier,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      complexity: ['error', COMPLEXITY_LIMIT],
      'max-depth': ['error', NESTING_LIMIT],
      'max-lines': ['error', { max: FILE_LENGTH_LIMIT, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'error',
        { max: FUNCTION_LENGTH_LIMIT, skipBlankLines: true, skipComments: true },
      ],
      'max-params': ['error', PARAMETER_LIMIT],
      'no-console': 'error',
      'no-param-reassign': 'error',
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          ignore: [-1, 0, 1, 2],
          ignoreEnums: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
          ignoreNumericLiteralTypes: true,
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: false, allowNullish: false },
      ],
      '@typescript-eslint/member-ordering': ['error', { default: MEMBER_ORDER }],
      // typescript-eslint's member-ordering above is the single source of truth for class layout.
      'unicorn/consistent-class-member-order': 'off',
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'forbid' },
        {
          selector: 'variable',
          modifiers: ['const', 'global'],
          format: ['camelCase', 'UPPER_CASE'],
        },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['PascalCase'] },
        { selector: 'import', format: null },
      ],
      'unicorn/filename-case': ['error', { cases: { camelCase: true, pascalCase: true } }],
      'unicorn/no-null': 'off',
      'unicorn/name-replacements': [
        'error',
        {
          allowList: {
            fs: true,
            url: true,
            uv: true,
            xi: true,
            fx: true,
            fy: true,
            cx: true,
            cy: true,
          },
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.contract.ts', '**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-magic-numbers': 'off',
      'max-lines-per-function': 'off',
      'max-lines': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
