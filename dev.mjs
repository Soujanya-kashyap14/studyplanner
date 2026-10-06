// Starts the API (backend) and the app (frontend) together. Ctrl+C stops both.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (name, dir, color) => {
  const child = spawn(npm, ['run', 'dev'], { cwd: new URL(`./${dir}/`, import.meta.url), shell: true });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => stream.on('data', (d) => out.write(d.toString().split('\n').filter(Boolean).map((l) => tag + l).join('\n') + '\n'));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  return child;
};

const children = [run('api', 'backend', 36), run('web', 'frontend', 35)];
const stop = () => {
  children.forEach((c) => c.kill());
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
