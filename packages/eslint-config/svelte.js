import prettier from "eslint-config-prettier";
import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import { defineConfig } from "eslint/config";
import globals from "globals";
import ts from "typescript-eslint";

/**
 * Shared ESLint config for SvelteKit apps.
 *
 * @param {{ gitignorePath: string, svelteConfig: Record<string, unknown> }} options
 * @returns {import("eslint").Linter.Config[]}
 */
export const createSvelteConfig = ({ gitignorePath, svelteConfig }) => {
  return defineConfig(
    includeIgnoreFile(gitignorePath),
    js.configs.recommended,
    ...ts.configs.recommended,
    ...svelte.configs.recommended,
    prettier,
    ...svelte.configs.prettier,
    {
      languageOptions: { globals: { ...globals.browser, ...globals.node } },
      rules: {
        "no-undef": "off",
      },
    },
    {
      files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
      languageOptions: {
        parserOptions: {
          projectService: true,
          extraFileExtensions: [".svelte"],
          parser: ts.parser,
          svelteConfig,
        },
      },
    },
  );
};
