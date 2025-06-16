import babel from "@rollup/plugin-babel";
import resolve from "@rollup/plugin-node-resolve";
import rust from "@wasm-tool/rollup-plugin-rust";
import commonjs from '@rollup/plugin-commonjs';
import terser from "@rollup/plugin-terser";

const esmPlugins = [
  babel({
    exclude: "node_modules/**",
    babelHelpers: "runtime",
    presets: ["solid", "@babel/preset-env"],
    plugins: [['@babel/transform-runtime']]
  }),
  rust({ 
    inlineWasm: true, 
    wasmOptArgs: ["-O4", "--enable-bulk-memory", "--enable-sign-ext"]
  }),
  resolve({ extensions: [".js", ".jsx"] })
];

const cjsPlugins = [
  resolve(),
  commonjs()
];

export default [
  // 1. Build the raw ESM modules
  {
    input: ["src/index.js", "src/ui.js", "src/worker.js"],
    output: [
      {
        dir: "dist",
        format: "es"
      }
    ],
    external: [/@babel\/runtime/],
    plugins: esmPlugins
  },

  // 2. Build the main (combined) standalone IIFE from the ESM output
  {
    input: "dist/index.js",
    output: [
      {
        file: "dist/bundle/asciinema-player.js",
        format: "iife",
        name: "AsciinemaPlayer"
      },
      {
        file: "dist/bundle/asciinema-player.min.js",
        format: "iife",
        name: "AsciinemaPlayer",
        plugins: [terser()]
      }
    ],
    plugins: cjsPlugins
  },

  // 3. Build the UI-only standalone IIFE from the ESM output
  {
    input: "dist/ui.js",
    output: [
      {
        file: "dist/bundle/asciinema-player-ui.js",
        format: "iife",
        name: "AsciinemaPlayer"
      },
      {
        file: "dist/bundle/asciinema-player-ui.min.js",
        format: "iife",
        name: "AsciinemaPlayer",
        plugins: [terser()]
      }
    ],
    plugins: cjsPlugins
  },

  // 4. Build the worker-only standalone IIFE from the ESM output
  {
    input: "dist/worker.js",
    output: [
      {
        file: "dist/bundle/asciinema-player-worker.js",
        format: "iife"
      },
      {
        file: "dist/bundle/asciinema-player-worker.min.js",
        format: "iife",
        plugins: [terser()]
      }
    ],
    plugins: cjsPlugins
  }
];
