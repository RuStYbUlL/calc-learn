// eslint.config.cjs (ESLint 9 "flat config")
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const globals = require("globals");

module.exports = tseslint.config(
  // 1) Global ignores (don’t lint build output or deps)
  {
    ignores: ["node_modules/**", "backend/dist/**", "frontend/dist/**"]
  },

  // 2) Rules for our source files
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        // We’re not using project-wide type-aware linting yet
        // (keeps setup simple). We’ll rely on `pnpm typecheck` for types.
        project: false
      },
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,     // Node globals (require, module, etc)
        ...globals.browser   // Browser globals (window, document)
      }
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin
    },
    rules: {
      // Start with ESLint + TS recommended rule sets
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules
    }
  }
);
