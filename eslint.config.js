import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '**/docs/screenshots/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Vite HMR 只允许导出组件（常量导出可保留）
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // 空函数体可能是有意为之的 no-op 占位
      '@typescript-eslint/no-empty-function': ['error', { allow: ['arrowFunctions'] }],
    },
  },
  {
    // 独立的 Node CJS 工具脚本（如 client/orch-countdown.cjs）
    files: ['**/*.cjs'],
    languageOptions: {
      globals: {
        require: 'readonly',
        module: 'readonly',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // Prettier 负责格式，关闭与格式冲突的规则
  prettier,
)
