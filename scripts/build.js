/**
 * Build script for Watson Page Assistant
 * Copies files to dist/firefox and dist/chrome with appropriate manifests
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..');
const srcDir = path.join(projectRoot, 'src');
const distDir = path.join(projectRoot, 'dist');
const manifestsDir = path.join(projectRoot, 'manifests');
const iconsDir = path.join(projectRoot, 'icons');

// Official third-party library builds, shipped unmodified so AMO reviewers can verify checksums
const vendorFiles = [
  'node_modules/@mozilla/readability/Readability.js',
  'node_modules/dompurify/dist/purify.min.js',
  'node_modules/marked/lib/marked.umd.js'
];

/**
 * Remove directory recursively
 */
function rmdir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Copy file or directory recursively
 */
function copy(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) {
      copy(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

/**
 * Build for a specific browser
 */
function buildForBrowser(browser) {
  const browserDist = path.join(distDir, browser);

  console.log(`Building for ${browser}...`);

  // Clean dist directory
  rmdir(browserDist);
  fs.mkdirSync(browserDist, { recursive: true });

  // Copy source files
  const srcDirs = ['common', 'background', 'sidebar', 'popup', 'options', 'content'];
  for (const dir of srcDirs) {
    const srcPath = path.join(srcDir, dir);
    const destPath = path.join(browserDist, dir);
    if (fs.existsSync(srcPath)) {
      copy(srcPath, destPath);
    }
  }

  // Copy icons
  if (fs.existsSync(iconsDir)) {
    copy(iconsDir, path.join(browserDist, 'icons'));
  }

  // Copy third-party libraries
  for (const file of vendorFiles) {
    copy(path.join(projectRoot, file), path.join(browserDist, 'vendor', path.basename(file)));
  }

  // Copy manifest
  const manifestSrc = path.join(manifestsDir, browser, 'manifest.json');
  const manifestDest = path.join(browserDist, 'manifest.json');
  if (fs.existsSync(manifestSrc)) {
    fs.copyFileSync(manifestSrc, manifestDest);
  } else {
    console.error(`Manifest not found: ${manifestSrc}`);
    process.exit(1);
  }

  console.log(`${browser} build complete: ${browserDist}`);
}

// Main
console.log('Building Watson Page Assistant...\n');

// Check if third-party libraries are installed
for (const file of vendorFiles) {
  if (!fs.existsSync(path.join(projectRoot, file))) {
    console.error(`Error: ${file} not found.`);
    console.error('Please run: npm install');
    process.exit(1);
  }
}

buildForBrowser('firefox');
buildForBrowser('chrome');

console.log('\nBuild complete!');
console.log('\nTo test:');
console.log('  Firefox: Load dist/firefox as temporary add-on in about:debugging');
console.log('  Chrome:  Load dist/chrome as unpacked extension in chrome://extensions');
