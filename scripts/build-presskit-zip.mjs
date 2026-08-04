// Rebuilds assets/press/underroot-press-kit.zip from source assets.
// Run after any press asset changes:  node scripts/build-presskit-zip.mjs
// Zero dependencies — writes a standard ZIP using Node's built-in zlib.
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateRawSync, crc32 } from 'node:zlib';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);

// [source path relative to repo root, name inside the zip]
const ENTRIES = [
  ['assets/images/Underroot_title.png', 'Underroot_title.png'],
  ['assets/images/Underroot_website_background.png', 'key-art.png'],
  ['assets/images/shots/new_shot_intro.jpg', 'screenshots/intro.jpg'],
  ['assets/images/shots/new_shot_maw.jpg', 'screenshots/maw.jpg'],
  ['assets/images/shots/shot_graveyard.jpg', 'screenshots/graveyard.jpg'],
  ['assets/images/shots/new_shot_rain.jpg', 'screenshots/rain.jpg'],
  ['assets/images/shots/new_shot_storm.jpg', 'screenshots/storm.jpg'],
  ['assets/images/shots/new_shot_aurora.jpg', 'screenshots/aurora.jpg'],
  ['assets/images/shots/new_shot_trade.jpg', 'screenshots/trade.jpg'],
  ['assets/images/shots/new_shot_tasks.jpg', 'screenshots/tasks.jpg'],
  ['assets/images/shots/new_shot_gold.jpg', 'screenshots/gold.jpg'],
  ['assets/images/shots/new_shot_craft.jpg', 'screenshots/craft.jpg'],
  ['assets/images/shots/new_shot_ledger.jpg', 'screenshots/ledger.jpg'],
  ['assets/images/shots/new_shot_fallen.jpg', 'screenshots/fallen.jpg'],
  ['assets/video/underroot_trailer.mp4', 'underroot_trailer.mp4'],
  ['assets/press/fact-sheet.txt', 'fact-sheet.txt'],
  ['assets/press/boilerplate.txt', 'boilerplate.txt'],
];

const enc = new TextEncoder();
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n >>> 0); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };

const locals = [];
const centrals = [];
let offset = 0;

for (const [src, name] of ENTRIES) {
  const data = readFileSync(p(src));
  const comp = deflateRawSync(data);
  const crc = crc32(data) >>> 0;
  const nameBuf = Buffer.from(enc.encode(name));

  const localHeader = Buffer.concat([
    u32(0x04034b50), u16(20), u16(0), u16(8),      // sig, ver, flags, method=deflate
    u16(0), u16(0x21),                              // mod time, mod date (fixed, not "now")
    u32(crc), u32(comp.length), u32(data.length),
    u16(nameBuf.length), u16(0), nameBuf,
  ]);
  locals.push(localHeader, comp);

  centrals.push(Buffer.concat([
    u32(0x02014b50), u16(20), u16(20), u16(0), u16(8),
    u16(0), u16(0x21),
    u32(crc), u32(comp.length), u32(data.length),
    u16(nameBuf.length), u16(0), u16(0), u16(0), u16(0), u32(0),
    u32(offset), nameBuf,
  ]));
  offset += localHeader.length + comp.length;
}

const centralBuf = Buffer.concat(centrals);
const localBuf = Buffer.concat(locals);
const eocd = Buffer.concat([
  u32(0x06054b50), u16(0), u16(0),
  u16(ENTRIES.length), u16(ENTRIES.length),
  u32(centralBuf.length), u32(localBuf.length), u16(0),
]);

writeFileSync(p('assets/press/underroot-press-kit.zip'), Buffer.concat([localBuf, centralBuf, eocd]));
console.log(`Wrote assets/press/underroot-press-kit.zip (${ENTRIES.length} entries)`);
