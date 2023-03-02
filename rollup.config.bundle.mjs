import resolve from "@rollup/plugin-node-resolve";
import commonjs from '@rollup/plugin-commonjs';
import terser from "@rollup/plugin-terser";

export default {
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
  plugins: [resolve(), commonjs()]
};
