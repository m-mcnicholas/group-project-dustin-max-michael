import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
  process.exitCode = code;
}

function start(name, args, cwd) {
  const child = spawn(process.execPath, args, { cwd, stdio: 'inherit' });
  children.push(child);
  child.on('error', (error) => {
    console.error(`${name} failed to start:`, error);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`${name} stopped (${signal || `exit code ${code}`}).`);
      stop(code || 1);
    }
  });
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

start('API', ['src/index.js'], path.join(root, 'server'));
start('Web app', [path.join(root, 'client/node_modules/vite/bin/vite.js')], path.join(root, 'client'));
