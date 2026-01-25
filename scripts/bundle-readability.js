/**
 * Bundle @mozilla/readability for use in content scripts
 */

import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bundle() {
  try {
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'readability-entry.js')],
      bundle: true,
      outfile: path.join(__dirname, '..', 'src', 'common', 'readability.min.js'),
      format: 'iife',
      globalName: 'ReadabilityModule',
      minify: true,
      target: ['chrome90', 'firefox90']
    });
    console.log('Readability bundled successfully');
  } catch (error) {
    console.error('Failed to bundle Readability:', error);
    process.exit(1);
  }
}

bundle();
