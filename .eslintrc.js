module.exports = {
  parser: '@typescript-eslint/parser',
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  env: {
    node: true,
    es2020: true,
    jest: true,
  },
  rules: {
    'no-unused-vars': 'off', // Disable base rule, will be handled by TypeScript
    'no-console': 'off', // CLI tools use console
    'no-redeclare': 'error',
    'no-shadow': 'error',
    'no-undef': 'error',
    'no-empty': 'error',

    // Code quality rules
    eqeqeq: ['error', 'always'],
    curly: ['error', 'all'],
    'no-var': 'error',
    'prefer-const': 'error',
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.js', 'coverage/'],
};
