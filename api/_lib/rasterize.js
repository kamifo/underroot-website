// resvg-wasm wrapper: init the wasm once per instance, register our bundled
// fonts (resvg ships none), rasterize an SVG string to a PNG Buffer.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { initWasm, Resvg } from '@resvg/resvg-wasm';

const require = createRequire(import.meta.url);
let wasmReady;
let fontsPromise;

function ensureWasm() {
  if (!wasmReady) {
    // require.resolve makes the .wasm a traced dependency on Vercel.
    const wasmPath = require.resolve('@resvg/resvg-wasm/index_bg.wasm');
    wasmReady = readFile(wasmPath).then((buf) => initWasm(buf));
  }
  return wasmReady;
}

function loadFonts() {
  if (!fontsPromise) {
    const dir = fileURLToPath(new URL('./fonts/', import.meta.url));
    fontsPromise = Promise.all([
      readFile(dir + 'PressStart2P-Regular.ttf'),
      readFile(dir + 'PTSerif-Italic.ttf'),
    ]);
  }
  return fontsPromise;
}

export async function renderPng(svg) {
  await ensureWasm();
  const fontBuffers = await loadFonts();
  const resvg = new Resvg(svg, {
    font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: 'Press Start 2P' },
    fitTo: { mode: 'width', value: 1200 },
  });
  return Buffer.from(resvg.render().asPng());
}
