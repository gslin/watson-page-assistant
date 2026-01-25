import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bundle() {
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'dompurify-entry.js')],
    bundle: true,
    outfile: path.join(__dirname, '..', 'src', 'common', 'dompurify.min.js'),
    format: 'iife',
    globalName: 'DOMPurifyModule',
    minify: true,
    target: ['chrome90', 'firefox90']
  });
  console.log('DOMPurify bundled successfully');
}

bundle();
