import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const environment = { ...process.env, PORT: process.env.PORT || '8080' };
const requestedAiPort = Number(environment.PORT);
const aiPort = Number.isInteger(requestedAiPort) && requestedAiPort > 0 ? requestedAiPort : 8080;
const children = [];
let shuttingDown = false;

function stop(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(exitCode), 300);
}

function start(command, args, label, childEnvironment = environment) {
  const child = spawn(command, args, {
    cwd: projectDirectory,
    env: childEnvironment,
    stdio: 'inherit',
  });
  children.push(child);
  child.once('error', (error) => {
    console.error(`[${label}] ${error.message}`);
    stop(1);
  });
  child.once('exit', (code, signal) => {
    if (!shuttingDown && code !== 0) {
      console.error(`[${label}] exited with ${signal || `code ${code}`}`);
      stop(code || 1);
    }
  });
  return child;
}

async function hasRunningAiServer(port = aiPort) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 800);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) return false;
    const health = await response.json();
    return health?.ok === true
      && health?.records === true
      && Number.isInteger(health.providers)
      && Number.isInteger(health.models);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForAiServer(port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await hasRunningAiServer(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    const available = await new Promise((resolve) => {
      const probe = net.createServer();
      probe.once('error', () => resolve(false));
      probe.listen({ port, host: '0.0.0.0', exclusive: true }, () => probe.close(() => resolve(true)));
    });
    if (available) return port;
  }
  return null;
}

async function main() {
  if (await hasRunningAiServer()) {
    console.warn(`[AI server] reusing existing service on :${aiPort}`);
    start(process.execPath, [path.join(projectDirectory, 'node_modules', 'vite', 'bin', 'vite.js')], 'Vite', { ...environment, AI_PROXY_PORT: String(aiPort) });
    return;
  }
  const selectedAiPort = await findAvailablePort(aiPort);
  if (selectedAiPort === null) {
    console.error(`[AI server] no available port found near :${aiPort}`);
    stop(1);
    return;
  }
  if (selectedAiPort !== aiPort) {
    console.warn(`[AI server] :${aiPort} is occupied by an incompatible service; using :${selectedAiPort}`);
  }
  start(process.execPath, [path.join(projectDirectory, 'server', 'index.mjs')], 'AI server', { ...environment, PORT: String(selectedAiPort) });
  if (!await waitForAiServer(selectedAiPort)) {
    console.error(`[AI server] health check timed out on :${selectedAiPort}`);
    stop(1);
  } else {
    start(process.execPath, [path.join(projectDirectory, 'node_modules', 'vite', 'bin', 'vite.js')], 'Vite', { ...environment, AI_PROXY_PORT: String(selectedAiPort) });
  }
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
void main();
