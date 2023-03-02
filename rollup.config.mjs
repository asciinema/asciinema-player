import babel from "@rollup/plugin-babel";
import resolve from "@rollup/plugin-node-resolve";
import rust from "@wasm-tool/rollup-plugin-rust";

const plugins = [
  babel({
    exclude: "node_modules/**",
    babelHelpers: "runtime",
    presets: ["solid", "@babel/preset-env"],
    plugins: [['@babel/transform-runtime']]
  }),
  rust({ inlineWasm: true, wasmOptArgs: ["-O4"] }),
  resolve({ extensions: [".js", ".jsx"] })
];

export default {
  input: "src/index.js",
  output: [
    {
      file: "dist/index.js",
      format: "es"
    }
  ],
  external: [/@babel\/runtime/],
  plugins
};
