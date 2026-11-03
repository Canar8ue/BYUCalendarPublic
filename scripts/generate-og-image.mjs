// The path-only SVG is the editable source of truth: no installed fonts needed.
// Run: node scripts/generate-og-image.mjs
import sharp from 'sharp';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export async function generateOgImage() {
  const source = fileURLToPath(new URL('../logos/svg/69-banner-og-campus.svg', import.meta.url));
  const output = fileURLToPath(new URL('../public/og-image.png', import.meta.url));
  await sharp(source, { density: 144 }).resize(1200, 630).png().toFile(output);
  console.log('wrote public/og-image.png 1200x630');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await generateOgImage();
}
