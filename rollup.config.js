import babel from "@rollup/plugin-babel";
import resolve from "@rollup/plugin-node-resolve";
import rust from "@wasm-tool/rollup-plugin-rust";

function removeImportMetaUrl() {
  // This plugin replaces import.meta.url with an empty string. Why?
  // wasm-bindgen produces a wasm loading code having reference to
  // import.meta.url, which becomes a dead code given rust plugin inlines the
  // wasm blob, while import.meta.url causes bundling issues with popular
  // bundlers (or requires plugins).

  return {
    resolveImportMeta(property, {moduleId}) {
      if (property === 'url') { return "''" }
      return null;
    }
  }
}

const plugins = [
  babel({
    exclude: "node_modules/**",
    babelHelpers: "runtime",
    presets: ["solid", "@babel/preset-env"],
    plugins: [['@babel/transform-runtime']]
  }),
  rust({ inlineWasm: true, wasmOptArgs: ["-O4"] }),
  resolve({ extensions: [".js", ".jsx"] }),
  removeImportMetaUrl()
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
