/**
 * Generate icons for the extension from SVG source
 * Uses sharp to convert SVG to PNG in various sizes
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconsDir = path.join(__dirname, '..', 'icons');
const svgPath = path.join(iconsDir, 'watson.svg');

const sizes = [16, 32, 48, 128];

async function generateIcons() {
  console.log('Generating icons from SVG...');

  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  if (!fs.existsSync(svgPath)) {
    console.error(`Error: SVG source not found at ${svgPath}`);
    process.exit(1);
  }

  for (const size of sizes) {
    const outputPath = path.join(iconsDir, `icon-${size}.png`);

    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(outputPath);

    console.log(`Created: ${outputPath}`);
  }

  console.log('Icons generated!');
}

generateIcons().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
