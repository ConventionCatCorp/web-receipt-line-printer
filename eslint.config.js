// @ts-check

import { defineConfig, globalIgnores } from 'eslint/config';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    'dist/',
    'coverage/',
    'docs/',
    'demo/',
    // Vendored third-party JS, not ours to lint.
    'src/ReceiptLine/*.js',
    '**/node_modules/**',
  ]),
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        // Type-aware linting. projectService picks up tsconfig.json automatically;
        // allowDefaultProject covers the root config files that tsconfig excludes.
        projectService: {
          allowDefaultProject: ['eslint.config.js', 'vite.config.ts'],
        },
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      // --- Real-bug rules, explicitly errors ---
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-declaration-merging': 'error',
      '@typescript-eslint/no-unsafe-enum-comparison': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      '@typescript-eslint/no-unsafe-unary-minus': 'error',
      'consistent-return': 'error',
      'require-await': 'off', // superseded by the type-aware version above

      // --- Aesthetic noise, off ---
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/member-ordering': 'off',
      '@typescript-eslint/explicit-member-accessibility': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/class-literal-property-style': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/consistent-generic-constructors': 'off',

      // Tests reach into private members deliberately; the bracket form is the
      // supported escape hatch and autofixing it away breaks compilation.
      '@typescript-eslint/dot-notation': ['error', { allowPrivateClassPropertyAccess: true }],
      // Numbers in log and error strings are fine.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // A `default` clause is an intentional statement that the remaining cases
      // are handled elsewhere; several parsers here deliberately cover only the
      // subcommands they own.
      '@typescript-eslint/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: true }],

      // --- Codebase idioms, deliberately off ---
      // Enum members are computed from shared constants in the ReceiptLine parser.
      '@typescript-eslint/prefer-literal-enum-member': 'off',
      // Static-only classes are used as namespaces for command sets.
      '@typescript-eslint/no-extraneous-class': 'off',
      // Parameter properties read as useless constructors to this rule.
      '@typescript-eslint/no-useless-constructor': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
  {
    // Test files: relax the rules that only make sense for library code.
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-misused-spread': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
    },
  },
  {
    // src/ReceiptLine/Parser.ts is a TypeScript port of the ReceiptLine
    // reference implementation, kept deliberately close to the original so it
    // can be diffed against upstream. It is still type-checked; only the
    // style-of-code rules that would force it to diverge are relaxed.
    files: ['src/ReceiptLine/Parser.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-useless-assignment': 'off',
    },
  },
  {
    // vite.config.ts pulls in plugins that ship no types.
    files: ['vite.config.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
);
