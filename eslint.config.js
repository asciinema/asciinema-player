import js from "@eslint/js";
import solid from "eslint-plugin-solid";
import globals from "globals";

export default [
  { ignores: ["dist/", "src/vt/target/"] },

  js.configs.recommended,
  solid.configs["flat/recommended"],

  {
    languageOptions: {
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
