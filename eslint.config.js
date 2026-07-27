import js from "@eslint/js";
import solid from "eslint-plugin-solid";
import globals from "globals";

export default [
  { ignores: ["dist/", "src/vt/target/"] },

  js.configs.recommended,
  solid.configs["flat/recommended"],

  {
    languageOptions: {
      // Syntax floor of our browserslist targets; there is no transpilation,
      // so newer syntax must fail the build. Bump when targets move.
      ecmaVersion: 2021,
      globals: { ...globals.browser, ...globals.worker },
    },

    rules: {
      // Control characters in regexes are the norm in a terminal emulator
      "no-control-regex": "off",

      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
];
