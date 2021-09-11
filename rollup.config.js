import resolve from "@rollup/plugin-node-resolve";
import babel from "@rollup/plugin-babel";
import rust from "@wasm-tool/rollup-plugin-rust";
import { terser } from "rollup-plugin-terser";

function removeImportMetaUrl() {
  // This plugin replaces import.meta.url with an empty string. Why?
  // wasm-bindgen produces a wasm loading code having reference to
  // import.meta.url, which becomes a dead code given rust plugin inlines the
  // wasm blob, while import.meta.url triggers bundling issues with popular
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
    babelHelpers: "bundled",
    presets: ["solid"]
  }),
  resolve({ extensions: [".js", ".jsx"] }),
  rust({ inlineWasm: true }),
  removeImportMetaUrl()
];

export default {
  input: "src/index.js",
  output: [
    {
      file: "dist/index.js",
      format: "es"
    },
    {
      file: "public/bundle.js",
      format: "iife",
      name: "AsciinemaPlayer"
    },
    {
      file: "public/bundle.min.js",
      format: "iife",
      name: "AsciinemaPlayer",
      plugins: [terser()]
    }
  ],
  plugins
};
