/**
 * Bundles the API with esbuild. The '@/…' alias points at ../frontend/src so the
 * backend runs the exact same scheduler, seed and date code as the browser.
 *
 *   node build.mjs           → dist/server.mjs
 *   node build.mjs --watch   → rebuild on change and (re)start the server
 */
import { build, context } from 'esbuild';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [path.join(here, 'src/server.ts')],
  outfile: path.join(here, 'dist/server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: true,
  packages: 'external',
  alias: { '@': path.join(here, '../frontend/src') },
  logLevel: 'info',
};

if (!watch) {
  await build(options);
} else {
  let child;
  const restart = () => {
    child?.kill();
    child = spawn(process.execPath, ['--enable-source-maps', options.outfile], { stdio: 'inherit' });
  };
  const ctx = await context({
    ...options,
    plugins: [{ name: 'restart', setup: (b) => b.onEnd((r) => r.errors.length === 0 && restart()) }],
  });
  await ctx.watch();
}
