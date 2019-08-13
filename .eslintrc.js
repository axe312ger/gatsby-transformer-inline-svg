module.exports = {
  env: {
    es6: true
  },
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: '2017'
  },
  extends: ['standard', 'prettier'],
  plugins: ['node'],
  rules: {
    'node/no-unsupported-features/es-syntax': 2
  }
}
