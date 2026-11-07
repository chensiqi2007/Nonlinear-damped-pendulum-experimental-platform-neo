import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(serverDirectory, '..');
const inheritedEnvironmentKeys = new Set(Object.keys(process.env));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || inheritedEnvironmentKeys.has(match[1])) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    process.env[match[1]] = value;
  }
}

loadEnvFile(path.join(projectDirectory, '.env'));
loadEnvFile(path.join(projectDirectory, '.env.local'));

const port = Number(process.env.PORT || 8080);
const apiKey = process.env.URLTIME_API_KEY || '';
const defaultProviders = ['https://api.urltime.cn'];
const defaultModels = ['deepseek-v4.1-flash'];

function parseList(value, fallback, { validate } = {}) {
  const items = String(value || '').split(/[\r\n,]+/).map((item) => item.trim()).filter(Boolean);
  const validItems = validate ? items.filter(validate) : items;
  return [...new Set(validItems)].length ? [...new Set(validItems)] : fallback;
}

function parseProviders(value, fallback) {
  const candidates = String(value || '').match(/https?:\/\/[^\s,]*?(?=https?:\/\/|[\s,]|$)/gi) || [];
  const providers = candidates.map((candidate) => {
    try {
      const url = new URL(candidate);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
      url.hash = '';
      url.search = '';
      return url.toString().replace(/\/$/, '');
    } catch {
      return null;
    }
  }).filter(Boolean);
  return [...new Set(providers)].length ? [...new Set(providers)] : fallback;
}

const providers = parseProviders(process.env.URLTIME_BASE_URLS || process.env.URLTIME_BASE_URL, defaultProviders);
const models = parseList(process.env.URLTIME_MODELS, defaultModels);
let roundRobinOffset = 0;
const experimentRecordsByClient = new Map();
const RECORD_TTL_MS = 60 * 60 * 1000;
const recordIpSalt = process.env.RECORD_IP_SALT || crypto.randomBytes(16).toString('hex');
const UPSTREAM_TIMEOUT_MS = 20_000;
const CHAT_TOTAL_TIMEOUT_MS = 60_000;
const PROVIDER_PROBE_TIMEOUT_MS = 5_000;
const providerReachability = new Map();
let providerProbePromise = Promise.resolve();

function writeSseError(response, status, message) {
  if (response.destroyed || response.writableEnded) return;
  try {
    if (!response.headersSent) {
      response.writeHead(status, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      });
    }
    response.end(`data: ${JSON.stringify({ error: { message } })}\n\ndata: [DONE]\n\n`);
  } catch {
  }
}

function extractUpstreamError(status, body) {
  if (status === 401) return '中转站 API Key 无效或已过期。';
  if (status === 403) return '当前 API Key 没有权限访问所选模型。';
  if (status === 404) return '中转站接口或模型不存在，请检查地址和模型名。';
  if (status === 429) return '中转站请求频率受限，请稍后再试。';
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.error?.message || parsed?.message;
    if (typeof message === 'string' && message.trim()) return message.trim().slice(0, 240);
  } catch {
  }
  return status ? `中转站返回 HTTP ${status}。` : '无法连接中转站。';
}

async function probeProviders() {
  const probes = providers.map(async (provider) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_PROBE_TIMEOUT_MS);
    try {
      const endpoint = provider.replace(/\/$/, '').endsWith('/v1') ? `${provider.replace(/\/$/, '')}/models` : `${provider.replace(/\/$/, '')}/v1/models`;
      const response = await fetch(endpoint, { signal: controller.signal, headers: { Accept: 'application/json' } });
      await response.body?.cancel();
      providerReachability.set(provider, true);
    } catch {
      providerReachability.set(provider, false);
    } finally {
      clearTimeout(timer);
    }
  });
  await Promise.all(probes);
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 120_000) throw new Error('Request body is too large.');
  }
  return JSON.parse(body || '{}');
}

function normalizeIp(value) {
  const ip = String(value || '').trim().replace(/^::ffff:/i, '');
  return ip || 'unknown';
}

function getClientIp(request) {
  const socketIp = normalizeIp(request.socket.remoteAddress);
  const isLoopbackProxy = socketIp === '127.0.0.1' || socketIp === '::1';
  const trustProxy = process.env.TRUST_PROXY === '1' && isLoopbackProxy;
  if (trustProxy) {
    const forwarded = request.headers['x-forwarded-for'];
    const realIp = request.headers['x-real-ip'];
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '').split(',')[0];
    return normalizeIp(realIp || forwardedIp || socketIp);
  }
  return socketIp;
}

function getClientRecordKey(request) {
  return crypto.createHash('sha256').update(`${recordIpSalt}:${getClientIp(request)}`).digest('hex');
}

function pruneExperimentRecords(now = Date.now()) {
  for (const [key, entry] of experimentRecordsByClient) {
    if (entry.expiresAt <= now) experimentRecordsByClient.delete(key);
  }
}

function writeJson(response, status, payload) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function parseExperimentRecords(value) {
  if (!Array.isArray(value)) return null;
  const records = value.slice(-120).filter((record) => record && typeof record === 'object').map((record) => ({
    t: Number(record.t),
    theta: Number(record.theta),
    omega: Number(record.omega),
    energy: Number(record.energy),
    id: Number(record.id),
    cycle: Number(record.cycle),
  })).filter((record) => Object.values(record).every((item) => Number.isFinite(item)) && Number.isInteger(record.id) && record.id > 0 && Number.isInteger(record.cycle) && record.cycle >= 0);
  return records;
}

async function handleExperimentRecords(request, response) {
  pruneExperimentRecords();
  const key = getClientRecordKey(request);
  if (request.method === 'GET') {
    const entry = experimentRecordsByClient.get(key);
    return writeJson(response, 200, { records: entry?.records || [], expiresAt: entry?.expiresAt || null });
  }
  if (request.method === 'DELETE') {
    experimentRecordsByClient.delete(key);
    return writeJson(response, 200, { records: [], expiresAt: null });
  }
  if (request.method !== 'POST') return writeJson(response, 405, { error: 'Only GET, POST and DELETE are supported.' });
  let input;
  try { input = await readJson(request); } catch { return writeJson(response, 400, { error: 'Invalid JSON request.' }); }
  const records = parseExperimentRecords(input.records);
  if (!records) return writeJson(response, 400, { error: 'A records array is required.' });
  const expiresAt = Date.now() + RECORD_TTL_MS;
  experimentRecordsByClient.set(key, { records, expiresAt });
  return writeJson(response, 200, { records, expiresAt });
}

async function handleChat(request, response) {
  let clientDisconnected = false;
  const markClientDisconnected = () => { clientDisconnected = true; };
  request.once('aborted', markClientDisconnected);
  response.once('close', markClientDisconnected);
  response.once('error', markClientDisconnected);
  if (!apiKey) return writeSseError(response, 503, '服务器未读取到 URLTIME_API_KEY，请在项目根目录 .env 或 .env.local 中配置。');
  let input;
  try { input = await readJson(request); } catch { return writeSseError(response, 400, 'Invalid JSON request.'); }
  if (!Array.isArray(input.messages)) return writeSseError(response, 400, 'A messages array is required.');
  const messages = input.messages.slice(-14).filter((message) => message && ['system', 'user', 'assistant'].includes(message.role) && typeof message.content === 'string' && message.content.trim()).map((message) => ({ role: message.role, content: message.content.trim().slice(0, 6000) }));
  if (!messages.length) return writeSseError(response, 400, 'No valid chat messages were supplied.');
  await providerProbePromise;
  const reachableProviders = providers.filter((provider) => providerReachability.get(provider) !== false);
  const candidateProviders = reachableProviders.length ? reachableProviders : providers;
  const candidateCount = candidateProviders.length * models.length;
  const start = roundRobinOffset++ % candidateCount;
  let lastStatus = 0;
  let lastError = '所有 AI 中转站暂时不可用。';
  let activeController = null;
  let totalTimedOut = false;
  const totalTimer = setTimeout(() => {
    totalTimedOut = true;
    activeController?.abort();
  }, CHAT_TOTAL_TIMEOUT_MS);
  if (clientDisconnected || response.destroyed) {
    clearTimeout(totalTimer);
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.flushHeaders?.();
  response.write(': URL Time API stream connected\n\n');
  for (let attempt = 0; attempt < candidateCount; attempt += 1) {
    const index = (start + attempt) % candidateCount;
    const provider = candidateProviders[index % candidateProviders.length];
    const model = models[Math.floor(index / candidateProviders.length)];
    const controller = new AbortController();
    activeController = controller;
    let timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    };
    const abortIfClientClosed = () => controller.abort();
    request.once('aborted', abortIfClientClosed);
    response.once('close', abortIfClientClosed);
    try {
      const endpoint = provider.replace(/\/$/, '').endsWith('/v1') ? `${provider.replace(/\/$/, '')}/chat/completions` : `${provider.replace(/\/$/, '')}/v1/chat/completions`;
      const upstream = await fetch(endpoint, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, Accept: 'text/event-stream' }, body: JSON.stringify({ model, messages, stream: true, stream_options: { include_usage: true }, temperature: 0.6, top_p: 0.8 }) });
      lastStatus = upstream.status;
      if (!upstream.ok || !upstream.body) {
        lastError = extractUpstreamError(upstream.status, (await upstream.text()).slice(0, 2000));
        continue;
      }
      for await (const chunk of upstream.body) {
        resetTimer();
        if (clientDisconnected || response.destroyed || response.writableEnded) {
          controller.abort();
          clearTimeout(totalTimer);
          return;
        }
        response.write(chunk);
      }
      clearTimeout(totalTimer);
      return response.end();
    } catch (error) {
      if (clientDisconnected || response.destroyed || response.writableEnded) {
        clearTimeout(totalTimer);
        return;
      }
      if (totalTimedOut) {
        lastError = '中转站响应超时，请稍后重试。';
        break;
      }
      lastError = error?.name === 'AbortError' ? '中转站连接超时。' : '无法连接中转站。';
    } finally {
      clearTimeout(timer);
      if (activeController === controller) activeController = null;
      request.off('aborted', abortIfClientClosed);
      response.off('close', abortIfClientClosed);
    }
  }
  clearTimeout(totalTimer);
  return writeSseError(response, lastStatus === 401 || lastStatus === 403 ? 502 : 503, lastError);
}

const server = http.createServer((request, response) => {
  const requestPath = request.url?.split('?', 1)[0];
  if (request.method === 'GET' && (requestPath === '/health' || requestPath === '/api/health' || requestPath === '/api/health.php')) {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return response.end(JSON.stringify({ ok: true, configured: Boolean(apiKey), records: true, providers: providers.length, models: models.length }));
  }
  if (request.method === 'POST' && (requestPath === '/api/chat' || requestPath === '/api/chat.php')) return handleChat(request, response);
  if (requestPath === '/api/records' || requestPath === '/api/records.php') return handleExperimentRecords(request, response);
  response.writeHead(404, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ error: 'Not found' }));
});
setInterval(() => pruneExperimentRecords(), 60_000).unref();
providerProbePromise = probeProviders();
setInterval(() => { providerProbePromise = probeProviders(); }, 60_000).unref();
server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`AI proxy port ${port} is already in use. Stop the existing service or set PORT to another free port.`);
  } else {
    console.error('AI proxy failed to start:', error);
  }
  process.exitCode = 1;
});
server.listen(port, '0.0.0.0', () => console.log(`AI proxy listening on :${port} (${apiKey ? 'configured' : 'missing URLTIME_API_KEY'})`));
