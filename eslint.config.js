import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "electron/**",
      "*.config.js",
      "*.config.ts",
    ],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended (type-aware disabled for speed)
  ...tseslint.configs.recommended,

  // Server-specific overrides
  {
    files: ["server/**/*.ts"],
    rules: {
      // Allow unused vars prefixed with _ (common for Express middleware)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Warn on explicit any (don't error — too many existing uses)
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow require() for dynamic imports in Node
      "@typescript-eslint/no-require-imports": "off",
      // Prefer const
      "prefer-const": "warn",
      // No console (use structured logger)
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // Client-specific overrides
  {
    files: ["client/src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "prefer-const": "warn",
    },
  },

  // Test files — relax rules
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  }
);
