import resolve from "@rollup/plugin-node-resolve";
import babel from "@rollup/plugin-babel";
import rust from "@wasm-tool/rollup-plugin-rust";
import { terser } from "rollup-plugin-terser";

const plugins = [
  babel({
    exclude: "node_modules/**",
    babelHelpers: "bundled",
    presets: ["solid"]
  }),
  resolve({ extensions: [".js", ".jsx"] }),
  rust({ inlineWasm: true })
];

export default {
  input: "src/index.js",
  output: [
    {
      file: "public/bundle.js",
      format: "iife"
    },
    {
      file: "public/bundle.min.js",
      format: "iife",
      plugins: [terser()]
    }
  ],
  preserveEntrySignatures: false,
  plugins
};
