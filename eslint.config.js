import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  { ignores: ['dist/**', 'test-results/**', 'playwright-report/**', '.chrome-command-check/**', '.claude/**'] },
  js.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser }
    },
    rules: {
      // Single-word component names (Legend) are fine.
      'vue/multi-word-component-names': 'off',
      // An unused argument kept for its place in a signature is fine.
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }]
    }
  },
  {
    files: ['**/__tests__/**', 'e2e/**', 'scripts/**', '*.config.js'],
    languageOptions: { globals: { ...globals.node } }
  }
]
