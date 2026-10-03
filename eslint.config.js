import js from '@eslint/js';

export default [
  {
    ignores: ['frontend/dist/**'],
  },
  {
    files: ['backend/**/*.js', 'frontend/**/*.js', 'scripts/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        Buffer: 'readonly',
        cancelAnimationFrame: 'readonly',
        document: 'readonly',
        URL: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        requestAnimationFrame: 'readonly',
        ResizeObserver: 'readonly',
        setImmediate: 'readonly',
        window: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
