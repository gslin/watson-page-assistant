import globals from "globals";

export default [
  {
    // 排除 bundled 檔案和 node_modules
    ignores: [
      "node_modules/**",
      "src/common/*.min.js",
      "dist/**"
    ]
  },
  {
    // Browser extension 原始碼
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        browser: "readonly",
        chrome: "readonly",
        // 第三方函式庫
        MarkedModule: "readonly",
        DOMPurifyModule: "readonly",
        Readability: "readonly"
      }
    },
    rules: {
      // 基本規則
      "no-unused-vars": "warn",
      "no-console": "off",
      "semi": ["error", "always"],
      "quotes": ["error", "single"]
    }
  },
  {
    // Node.js build scripts
    files: ["scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node
      }
    },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off",
      "semi": ["error", "always"],
      "quotes": ["error", "single"]
    }
  }
];
