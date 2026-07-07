// 責務: ESLint flat config（規約の機械化。02-architecture.md §5準拠）
import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import globals from "globals";

import { fileResponsibilityRule } from "./tools/eslint-rules/file-responsibility.mjs";

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
      local: { rules: { "file-responsibility": fileResponsibilityRule } },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Math.random() は禁止（シード乱数DIを使用すること）。",
        },
      ],
      "sort-imports": [
        "error",
        {
          ignoreDeclarationSort: true,
        },
      ],
      "import/order": [
        "error",
        {
          alphabetize: { order: "asc" },
          "newlines-between": "never",
        },
      ],
      "local/file-responsibility": "error",
      "no-magic-numbers": [
        "error",
        {
          ignore: [0, 1, -1],
          ignoreDefaultValues: true,
          enforceConst: true,
        },
      ],
    },
  },
  {
    files: ["**/constants.ts", "**/*.constants.ts"],
    rules: {
      "no-magic-numbers": "off",
    },
  },
  {
    files: ["packages/viewer/**/*.ts"],
    languageOptions: {
      globals: globals.browser,
    },
  },
];
