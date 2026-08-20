// ESLint flat config (ESLint >= 9). Complements the custom syntax/JSON check in scripts/lint.mjs
// with real static-analysis rules. Kept deliberately conservative: the renderer exposes many
// functions as window globals for inline onclick handlers, so no-undef/no-unused-vars stay off.
import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['node_modules/**', 'out/**', 'build/**', 'dist/**', 'release/**', 'src/renderer/assets/**'] },
  js.configs.recommended,
  {
    files: ['src/main/**/*.js', 'src/preload/**/*.js'],
    languageOptions: { globals: { ...globals.node }, sourceType: 'commonjs' },
    rules: {
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
    },
  },
  {
    files: ['src/renderer/**/*.js'],
    languageOptions: { globals: { ...globals.browser }, sourceType: 'module' },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.js', '*.config.mjs', '*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser }, sourceType: 'module' },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
  {
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-redeclare': 'error',
      'no-unreachable': 'error',
      'no-constant-binary-expression': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-assignment': 'off',
      'no-useless-escape': 'off',
      'preserve-caught-error': 'off',
    },
  },
]