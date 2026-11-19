import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('.', import.meta.url));

await build({
  entryPoints: ['ui/main.jsx'],
  outfile: join(root, 'static', 'app.js'),
  bundle: true,
  minify: true,
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'eof',
  plugins: [{
    name: 'node-module-resolution',
    setup(context) {
      context.onResolve({ filter: /.*/ }, ({ path, importer, kind }) => ({
        path: kind === 'entry-point' ? join(root, path) : createRequire(importer).resolve(path),
        namespace: 'source'
      }));
      context.onLoad({ filter: /.*/, namespace: 'source' }, async ({ path }) => ({
        contents: await readFile(path, 'utf8'),
        loader: extname(path) === '.jsx' ? 'jsx' : 'js'
      }));
    }
  }]
});
