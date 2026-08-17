/**
 * Practical, not exhaustive: catches real bugs (unused vars, missing hook
 * deps, invalid hook calls, undefined React components) without imposing a
 * stylistic rulebook (no import-order/naming-convention/max-lines rules) on
 * an existing ~5000-line-per-file codebase that was never linted before.
 */
module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: {
    react: { version: 'detect' },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  rules: {
    // React 17+ JSX transform - no `import React` needed per file.
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off', // TypeScript already covers this.

    // Unused vars/imports are real dead-code bugs - but a leading
    // underscore is the established convention for "intentionally unused"
    // (e.g. destructured but unneeded) rather than a lint violation.
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

    // This codebase uses `any` deliberately in several places (axios error
    // handling, third-party interop) - flagging it as a warning (visible,
    // trackable) rather than an error avoids a wall of pre-existing
    // "violations" on day one while still discouraging new unnecessary use.
    '@typescript-eslint/no-explicit-any': 'warn',

    // Real bug classes worth erroring on.
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'no-fallthrough': 'error',
    'no-duplicate-imports': 'error',

    // Flags a literal apostrophe/quote in JSX text (e.g. "Here's") as an
    // "error" demanding &apos;/&rsquo; entity-escaping. Every browser
    // renders both forms identically - this is a purely cosmetic style
    // preference, not a real bug, and this codebase has 30+ pre-existing,
    // completely correct instances. Off rather than mass-editing working
    // JSX copy for zero functional benefit.
    'react/no-unescaped-entities': 'off',

    // `while (true) { ...; if (done) break }` is the standard, correct
    // pattern for reading a stream (see AlertsPage.tsx's AI-explain
    // fetch-stream reader) - not an accidental infinite loop.
    'no-constant-condition': ['error', { checkLoops: false }],
  },
  ignorePatterns: ['dist', 'node_modules', 'coverage', 'playwright-report', 'test-results', '*.config.js', '*.config.ts'],
}
