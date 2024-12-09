import eslint from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginImportX from "eslint-plugin-import-x";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import globals from "globals";
import tseslint from "typescript-eslint";

// eslint-disable-next-line import-x/no-default-export
export default tseslint.config(
  { ignores: ["dist/", "docs/", "examples/"] },
  { files: ["**/*.{js,mjs,cjs,ts}"] },
  {
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: {
      "import-x": eslintPluginImportX,
      unicorn: eslintPluginUnicorn,
    },
    rules: {
      "import-x/consistent-type-specifier-style": ["error", "prefer-top-level"],
      "import-x/no-cycle": "warn",
      "import-x/no-default-export": "error",
      "import-x/no-duplicates": ["error"],
      "import-x/no-named-as-default": "off",
      "import-x/no-unresolved": "error",
      "import-x/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index", "type"],
          "newlines-between": "always",
          alphabetize: { order: "asc" },
        },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "unicorn/better-regex": "error",
      "unicorn/consistent-function-scoping": "error",
      "unicorn/expiring-todo-comments": "error",
      "unicorn/filename-case": ["error", { case: "kebabCase" }],
      "unicorn/no-array-for-each": "error",
      "unicorn/no-for-loop": "error",
    },
  },
  {
    files: ["**/*?(.c|.m)js"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    settings: {
      "import-x/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"],
      },
      "import-x/resolver": {
        typescript: true,
        node: true,
      },
    },
  },
  { linterOptions: { reportUnusedDisableDirectives: true } },
  eslintConfigPrettier,
);
