// Lint gate for every package, app and tool.
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import esX from 'eslint-plugin-es-x';
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
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/coverage/',
    '**/.stryker-tmp/',
    'test/fixtures/',
    // Checked against the built npm package by its tsconfig.consumer.json, outside the sources.
    'apps/library/consumer/',
    'apps/library/types/',
  ]),
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
      // A branded unit (`Degrees`, `Seconds`) is a number the rule does not recognise as one; the
      // brand keeps units apart, negating one keeps its unit.
      '@typescript-eslint/no-unsafe-unary-minus': 'off',
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
          selector: 'parameter',
          modifiers: ['unused'],
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        // Global constants: UPPER_CASE for values, PascalCase for enum-like `as const` objects.
        {
          selector: 'variable',
          modifiers: ['const', 'global'],
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        },
        // PascalCase for enum-like keys, and for a constructor a type names as a global does.
        {
          selector: ['objectLiteralProperty', 'typeProperty'],
          format: ['camelCase', 'PascalCase'],
        },
        // A key that needs quotes is data spelled as the outside world spells it (an attribute
        // name, a kebab-case choice), not an identifier this codebase names.
        {
          selector: ['objectLiteralProperty', 'objectLiteralMethod', 'typeProperty'],
          modifiers: ['requiresQuotes'],
          format: null,
        },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['PascalCase'] },
        { selector: 'import', format: null },
      ],
      // Package directories follow npm's kebab-case; everything beneath them is camel or pascal case.
      'unicorn/filename-case': [
        'error',
        {
          cases: { camelCase: true, pascalCase: true },
          directoryRoots: [/^(packages\/adapters|packages|tools|apps)\/[^/]+$/u],
        },
      ],
      'unicorn/no-null': 'off',
      // Iterator helpers need iOS Safari 18.4+; the player targets older iOS releases too.
      'unicorn/prefer-iterator-to-array': 'off',
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
          // "configuration" is the full word; the rule would shorten it to "config".
          replacements: { configuration: false },
        },
      ],
    },
  },
  {
    // What a page runs: the oldest browsers the npm README names (Chrome 111, Safari 16.4) have
    // ES2023 and nothing newer, so a later built-in or syntax would break them where nothing
    // guards it. Tests and tools run in Node 24 and current browsers only.
    files: ['packages/**/src/**/*.ts', 'apps/**/src/**/*.ts'],
    ignores: [
      '**/*.test.ts',
      '**/*.contract.ts',
      '**/test/**',
      '**/testing/**',
      'packages/adapters/node/**',
    ],
    extends: [esX.configs['flat/restrict-to-es2023']],
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
