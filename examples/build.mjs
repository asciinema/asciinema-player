// Builds every terminal-backend example in one go. Each adapter is bundled into
// its own <name>/dist/ so same-named assets (two different ghostty-vt.wasm files)
// never collide. Run: `npm ci && npm run build` from examples/.
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// The recording the launcher plays.
execSync("node gen-cast.mjs", { stdio: "inherit" });

// adapter entry -> bundled output (one esbuild per adapter, into its own dist/).
const adapters = [
  "ghostty-web/ghostty-web-backend.js",
  "wterm/wterm-backend.js",
  "xterm/xterm-backend.js",
  "rioterm/rioterm-backend.js",
];
for (const entry of adapters) {
  const dir = entry.slice(0, entry.indexOf("/"));
  const file = entry.slice(entry.indexOf("/") + 1);
  await build({ entryPoints: [entry], bundle: true, format: "esm", outfile: `${dir}/dist/${file}` });
}

// Non-inlined assets each adapter fetches at runtime (WASM served separately, CSS).
const assets = [
  ["node_modules/ghostty-web/ghostty-vt.wasm", "ghostty-web/dist/ghostty-vt.wasm"],
  ["node_modules/@wterm/dom/src/terminal.css", "wterm/dist/wterm.css"],
  ["node_modules/@wterm/ghostty/wasm/ghostty-vt.wasm", "wterm/dist/ghostty-vt.wasm"],
  ["node_modules/@xterm/xterm/css/xterm.css", "xterm/dist/xterm.css"],
  ["node_modules/rioterm/wasm/librio_wasm_bg.wasm", "rioterm/dist/librio_wasm_bg.wasm"],
];
for (const [src, dst] of assets) {
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
}

console.log("examples built");
