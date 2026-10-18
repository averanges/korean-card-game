import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import config from '../vite.config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));

// Same two build steps on Windows and Linux; no shell-specific commands or paths.
execFileSync(process.execPath, [tsc, '--noEmit'], { cwd: root, stdio: 'inherit' });
// Load the plain ESM config directly, including in restricted managed workspaces.
await build({ ...config, root, configFile: false });
