import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bundle() {
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'marked-entry.js')],
    bundle: true,
    outfile: path.join(__dirname, '..', 'src', 'common', 'marked.min.js'),
    format: 'iife',
    globalName: 'MarkedModule',
    minify: true,
    target: ['chrome90', 'firefox90']
  });
  console.log('Marked bundled successfully');
}

bundle();
