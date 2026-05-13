import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "coverage",
      ".wrangler",
      "src/types/database.ts",
      "*.config.{js,ts}",
      "vite.config.ts",
      "vitest.config.ts",
      "eslint.config.js",
    ],
  },

  // Type-aware strict baseline
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.es2022 },
      parserOptions: {
        project: ["./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
      import: importPlugin,
      unicorn,
    },
    settings: {
      "import/resolver": {
        typescript: { project: "./tsconfig.app.json" },
        node: true,
      },
    },
    rules: {
      // React
      ...reactHooks.configs.recommended.rules,
      // react-refresh: convivemos com Providers exportando hooks (padrão React comum).
      // O HMR ainda funciona — só não preserva state nesses arquivos específicos.
      "react-refresh/only-export-components": "off",

      // Accessibility (essentials only — não bloqueia velocidade)
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/anchor-is-valid": "warn",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/role-has-required-aria-props": "error",

      // TypeScript — overrides ao strict-type-checked
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } }, // permite onClick={async () => ...}
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true, allowNullish: false },
      ],
      "@typescript-eslint/no-unnecessary-condition": "off", // muito ruidoso com data fetching
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-empty-object-type": [
        "error",
        { allowInterfaces: "with-single-extends" },
      ],

      // Imports (Prettier mantém type imports separados → não force prefer-inline)
      "import/no-duplicates": "error",
      "import/no-self-import": "error",
      "import/no-cycle": ["error", { maxDepth: 5 }],
      "import/first": "error",
      "import/newline-after-import": "error",
      "import/no-default-export": "off", // routes/login.tsx etc. usam default

      // Unicorn — picks pragmáticos
      "unicorn/filename-case": [
        "error",
        {
          cases: { kebabCase: true, pascalCase: true, camelCase: true },
          ignore: ["^[A-Z][A-Za-z0-9]+\\.tsx$"], // permite Component.tsx
        },
      ],
      "unicorn/no-array-for-each": "off",
      "unicorn/no-null": "off",
      "unicorn/prevent-abbreviations": "off",
      "unicorn/prefer-top-level-await": "off",
      "unicorn/no-useless-undefined": "off",
      "unicorn/no-array-reduce": "off",
      "unicorn/no-nested-ternary": "off",
      "unicorn/prefer-query-selector": "off",
      "unicorn/explicit-length-check": "warn",
      "unicorn/prefer-node-protocol": "error",
      "unicorn/throw-new-error": "error",
      "unicorn/error-message": "error",
      "unicorn/no-instanceof-array": "error",

      // Core
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "no-alert": "error",
      "prefer-const": ["error", { destructuring: "all" }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      curly: ["error", "multi-line"],
    },
  },

  // Tests: relax some rules
  {
    files: ["**/*.{test,spec}.{ts,tsx}", "**/test/**", "**/__tests__/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },

  // Disable rules conflicting with Prettier formatting
  prettier,
);
