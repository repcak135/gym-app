// Builds every app icon from the owner's artwork (branding/icon-source.webp, any square raster).
// The artwork is placed centred on its own background colour, extended to the full canvas with soft edges, at a scale that
// keeps it inside each platform's safe zone:
//   - regular / iPhone icons: 80% (iOS rounds the corners)
//   - Android maskable: 70% (the launcher may crop to a circle of 80% diameter)
//   - favicon / 64 px: 92% (tiny, no cropping, so use the space)
// Run: npm run icons   (writes into public/)
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const SRC = process.argv[2] ?? 'branding/icon-source.webp';

// Background = the artwork's own corner colour (near the app's #0e1015), so the extended canvas
// has no visible edge around the artwork.
const corner = await sharp(SRC).extract({ left: 0, top: 0, width: 16, height: 16 }).removeAlpha().raw().toBuffer();
const avg = (o) => Math.round([...Array(256).keys()].reduce((t, i) => t + corner[i * 3 + o], 0) / 256);
const [r, g, b] = [avg(0), avg(1), avg(2)];
const BG = { r, g, b, alpha: 1 };

async function icon(size, scale) {
  const art = Math.round(size * scale);
  const feather = Math.max(1, Math.round(art * 0.04));
  // Alpha mask: opaque in the middle, fading out over the last ~4% so the artwork's own
  // near-black background melts into the app background without a visible seam.
  const mask = Buffer.from(
    `<svg width="${art}" height="${art}"><defs><filter id="b"><feGaussianBlur stdDeviation="${feather / 2}"/></filter></defs>` +
      `<rect x="${feather}" y="${feather}" width="${art - 2 * feather}" height="${art - 2 * feather}" fill="#fff" filter="url(#b)"/></svg>`,
  );
  const artwork = await sharp(SRC)
    .resize(art, art, { kernel: 'lanczos3' })
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  const off = Math.round((size - art) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: artwork, left: off, top: off }])
    .flatten({ background: BG })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** .ico holding one PNG image (supported by every current browser). */
function ico(png, size) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(1, 4);
  head.writeUInt8(size, 6);
  head.writeUInt8(size, 7);
  head.writeUInt16LE(1, 10);
  head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14);
  head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}

const out = {
  'pwa-64x64.png': await icon(64, 0.92),
  'pwa-192x192.png': await icon(192, 0.8),
  'pwa-512x512.png': await icon(512, 0.8),
  'maskable-icon-512x512.png': await icon(512, 0.7),
  'apple-touch-icon-180x180.png': await icon(180, 0.8),
  'favicon.ico': ico(await icon(48, 0.92), 48),
};
for (const [name, buf] of Object.entries(out)) {
  await writeFile(`public/${name}`, buf);
  console.log(`public/${name}  ${(buf.length / 1024).toFixed(0)} KB`);
}
