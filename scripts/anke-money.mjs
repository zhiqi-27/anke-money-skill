#!/usr/bin/env node
import https from 'node:https';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SkillError, createVault, promptKey, validateKey } from './credentials.mjs';

export const ORIGIN = 'https://azfzepi6zekanwh2.azurewebsites.net';
export const OPERATIONS = Object.freeze({
  ledger_read: ['GET', '/agent/v1/ledger/entries'],
  ledger_create: ['POST', '/agent/v1/ledger/entries'],
  ledger_create_batch: ['POST', '/agent/v1/ledger/entries/batch'],
  assets_read: ['GET', '/agent/v1/assets'],
  assets_create: ['POST', '/agent/v1/assets'],
  assets_create_batch: ['POST', '/agent/v1/assets/batch'],
  assets_update: ['PATCH', '/agent/v1/assets/'],
  categories_read: ['GET', '/agent/v1/categories'],
  channels_read: ['GET', '/agent/v1/channels'],
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 2 * 1024 * 1024;

export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}

export function buildPlan(operation, { body, accountId, query = {} } = {}) {
  if (!Object.hasOwn(OPERATIONS, operation)) throw new SkillError('OPERATION', 'Choose one of the nine documented Agent operations.');
  const [method, route] = OPERATIONS[operation];
  const write = method !== 'GET';
  let path = route;
  if (operation === 'assets_update') {
    if (!UUID.test(accountId || '')) throw new SkillError('ACCOUNT_ID', 'assets_update requires the UUID returned by assets_read.');
    path += accountId;
  } else if (accountId !== undefined) throw new SkillError('ACCOUNT_ID', 'Only assets_update accepts --account-id.');
  if (write) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SkillError('BODY', 'Supply a JSON object with HTTP camelCase fields using --body-file.');
    if (Object.keys(query).length) throw new SkillError('QUERY', 'Writes do not accept query parameters.');
    const items = operation.endsWith('_batch') ? body[operation === 'ledger_create_batch' ? 'entries' : 'accounts'] : [body];
    if (!Array.isArray(items) || items.length < 1 || items.length > 25) throw new SkillError('BATCH', 'A batch contains 1–25 items from the confirmed complete proposal.');
    for (const item of items) {
      if (!item || typeof item !== 'object' || !UUID.test(item.idempotencyKey || '')) throw new SkillError('IDEMPOTENCY', 'Every write needs its existing proposal idempotencyKey UUID; retries must keep it unchanged.');
    }
    if (operation === 'assets_update' && (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1)) {
      throw new SkillError('REVISION', 'Use the latest assets_read revision as expectedRevision before proposing the update.');
    }
  } else if (body !== undefined) throw new SkillError('BODY', 'Reads do not accept a request body.');
  const allowed = ['ledger_read', 'assets_read'].includes(operation) ? ['limit', 'cursor', 'start_date', 'end_date'] : ['limit'];
  const params = new URLSearchParams();
  for (const name of Object.keys(query).sort()) {
    const value = query[name];
    if (!allowed.includes(name) || typeof value !== 'string') throw new SkillError('QUERY', 'Only documented query fields are accepted.');
    if (name === 'limit' && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 500)) throw new SkillError('QUERY', 'limit must be 1–500.');
    if (name === 'cursor' && value.length > 16384) throw new SkillError('QUERY', 'Cursor is too long.');
    if (name.endsWith('_date') && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)))) throw new SkillError('QUERY', 'Dates must be YYYY-MM-DD.');
    params.set(name, value);
  }
  if (params.size) path += '?' + params.toString();
  const plan = { operation, method, path, ...(write ? { body } : {}) };
  return { ...plan, write, confirmation: write ? createHash('sha256').update(canonical(plan)).digest('hex') : undefined };
}

export function httpsTransport(plan, key, request = https.request) {
  return new Promise((resolve, reject) => {
    if (/(?:\*|http|https|tls)/i.test(process.env.NODE_DEBUG || '')) {
      reject(new SkillError('DEBUG_DISABLED', 'Disable NODE_DEBUG HTTP/TLS tracing before using credentials.'));
      return;
    }
    const url = new URL(plan.path, ORIGIN);
    const allowedRoute = Object.values(OPERATIONS).some(([method, path]) => method === plan.method &&
      (path.endsWith('/') ? url.pathname.startsWith(path) && UUID.test(url.pathname.slice(path.length)) : url.pathname === path));
    if (url.origin !== ORIGIN || url.username || url.password || url.hash || !allowedRoute) {
      reject(new SkillError('HTTP_ORIGIN', 'Only the documented Agent routes on the fixed Production HTTPS origin may receive credentials.'));
      return;
    }
    const data = plan.body === undefined ? undefined : JSON.stringify(plan.body);
    let timer;
    const fail = () => { clearTimeout(timer); reject(new SkillError('NETWORK', plan.write
      ? 'Request outcome is uncertain. Keep the exact body, IDs and idempotency keys; read back before a bounded unchanged retry.'
      : 'HTTPS request failed. Check network access and try again.', { outcomeUncertain: Boolean(plan.write) })); };
    const req = request(url, {
      method: plan.method, rejectUnauthorized: true,
      headers: { Accept: 'application/json', Authorization: `Bearer ${validateKey(key)}`,
        ...(data === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }) },
    }, res => {
      // Native https does not follow redirects. Never forward a bearer credential.
      let size = 0;
      const chunks = [];
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 32 * 1024 * 1024) req.destroy();
        else chunks.push(chunk);
      });
      res.on('error', fail);
      res.on('end', () => {
        clearTimeout(timer);
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { body = null; }
        resolve({ status: res.statusCode, body, retryAfter: res.headers['retry-after'] });
      });
    });
    timer = setTimeout(() => req.destroy(), 30000);
    req.on('error', () => { clearTimeout(timer); fail(); });
    req.end(data);
  });
}

const HTTP_ACTIONS = {
  401: 'Invalid or revoked Key. Check configuration or reset it in Anke Money.',
  402: 'Active Anke Money Pro is required.',
  403: 'API Key scope denied. Do not switch credentials or transports to bypass it.',
  409: 'Conflict. Read back; never change IDs or keys to force a retry. A revised proposal needs fresh confirmation.',
  429: 'Rate limited. Honor Retry-After; do not switch transports.',
};

export function checkHTTP(response, write = false) {
  if (response.status >= 200 && response.status < 300 && response.body !== null) return response.body;
  const extra = { status: response.status };
  if (response.status === 429 && /^\d{1,8}$/.test(String(response.retryAfter))) extra.retryAfterSeconds = Number(response.retryAfter);
  if (write && (response.status >= 500 || (response.status >= 200 && response.status < 300))) extra.outcomeUncertain = true;
  throw new SkillError('HTTP_ERROR', HTTP_ACTIONS[response.status] ||
    (response.status >= 300 && response.status < 400 ? 'Redirect refused; credentials stay on the fixed Production origin.' :
      write && response.status >= 500 ? 'Server failure; the write may have committed. Keep the exact proposal and read back before retrying.' :
        'Request rejected or invalid JSON. Check the documented HTTP fields; changed financial proposals need fresh confirmation.'), extra);
}

export function createClient({ vault = createVault(), env = process.env, transport = httpsTransport, prompt = promptKey } = {}) {
  function credential() {
    // Explicit host secret settings take precedence. Never fall back after failure.
    if (Object.hasOwn(env, 'ANKE_MONEY_API_KEY')) return { key: validateKey(env.ANKE_MONEY_API_KEY), source: 'environment' };
    const key = vault.read();
    if (!key) throw new SkillError('SETUP_REQUIRED', 'Run the Skill setup command in a real terminal, or use the host secret setting ANKE_MONEY_API_KEY.');
    return { key, source: vault.name };
  }
  async function verify(key) {
    // FastAPI resolves current_agent (Key + Pro) before validating limit. The
    // deliberate invalid limit stops before any financial business handler.
    const res = await transport({ method: 'GET', path: '/agent/v1/categories?limit=0', write: false }, key);
    if (res.status !== 422 || res.body?.detail !== 'Request validation failed' ||
        !res.body?.errors?.some(e => e.location === 'query.limit' && e.type === 'greater_than_equal')) checkHTTP(res);
    if (res.status !== 422) throw new SkillError('CHECK_FAILED', 'Unexpected connection-check response; no Key was saved.');
    return { connected: true, authAndProVerified: true, scopesVerified: false, financialDataRead: false };
  }
  return {
    async setup({ replace = false } = {}) {
      // Refuse before prompting if the user's environment would shadow this store.
      if (Object.hasOwn(env, 'ANKE_MONEY_API_KEY')) {
        throw new SkillError('HOST_SECRET_PRESENT', 'A host ANKE_MONEY_API_KEY setting already takes precedence. Use check with it, or remove that setting before configuring the system vault.');
      }
      const existing = vault.read();
      if (existing && !replace) return { ...(await verify(existing)), configured: true, source: vault.name, reused: true };
      const key = validateKey(await prompt());
      const receipt = await verify(key);
      vault.write(key);
      return { ...receipt, configured: true, source: vault.name, replaced: Boolean(existing) };
    },
    status() {
      try { return { configured: true, source: credential().source, verified: false }; }
      catch (e) { if (e.code === 'SETUP_REQUIRED') return { configured: false, verified: false }; throw e; }
    },
    async check() { const { key, source } = credential(); return { ...(await verify(key)), source }; },
    forget(yes = false) {
      if (!yes) throw new SkillError('CONFIRMATION_REQUIRED', 'Use forget --yes only after the user asks to remove this Skill’s saved credential. This does not revoke the App Key.');
      vault.remove();
      return { localCredentialRemoved: true, appKeyRevoked: false, hostEnvironmentChanged: false };
    },
    async request(plan, confirmation) {
      // Rebuild to reject altered/injected plans even for imported callers.
      const verified = buildPlan(plan.operation, { body: plan.body,
        accountId: plan.operation === 'assets_update' ? plan.path.slice(OPERATIONS.assets_update[1].length) : undefined,
        query: Object.fromEntries(new URL(plan.path, ORIGIN).searchParams) });
      if (verified.write && confirmation !== verified.confirmation) {
        if (confirmation !== undefined) throw new SkillError('CONFIRMATION_MISMATCH', 'The request differs from the confirmed preview. Show the new complete proposal and obtain fresh confirmation.');
        return { confirmationRequired: true, confirmation: verified.confirmation, operation: verified.operation,
          method: verified.method, path: verified.path, body: verified.body, sent: false };
      }
      const { key } = credential();
      const response = await transport(verified, key);
      // Also remove an accidental server reflection of this exact credential.
      return JSON.parse(JSON.stringify(checkHTTP(response, verified.write)).replaceAll(key, '[REDACTED]'));
    },
  };
}

export async function main(argv = process.argv.slice(2), client = createClient()) {
  const [command, ...args] = argv;
  if (!command || ['help', '--help', '-h'].includes(command)) return { usage: [
    'node <skill>/scripts/anke-money.mjs setup [--replace]',
    'node <skill>/scripts/anke-money.mjs status | check',
    'node <skill>/scripts/anke-money.mjs request OPERATION [--limit N] [--cursor VALUE] [--start-date YYYY-MM-DD] [--end-date YYYY-MM-DD]',
    'node <skill>/scripts/anke-money.mjs request WRITE --body-file PATH [--account-id UUID] [--confirm PREVIEW_SHA256]',
    'node <skill>/scripts/anke-money.mjs forget --yes',
  ], operations: Object.keys(OPERATIONS) };
  if (command === 'setup' && (args.length === 0 || (args.length === 1 && args[0] === '--replace'))) return client.setup({ replace: args.length === 1 });
  if (command === 'status' && !args.length) return client.status();
  if (command === 'check' && !args.length) return client.check();
  if (command === 'forget' && args.length === 1 && args[0] === '--yes') return client.forget(true);
  if (command !== 'request') throw new SkillError('ARGUMENTS', 'Unknown command or flags. Run --help. Keys must never be supplied in command arguments.');
  const [operation, ...flags] = args;
  const options = {}, query = {}, allowed = new Set(['--body-file', '--account-id', '--confirm', '--limit', '--cursor', '--start-date', '--end-date']);
  for (let i = 0; i < flags.length; i += 2) {
    const name = flags[i], value = flags[i + 1];
    if (!allowed.has(name) || value === undefined || value.startsWith('--') || Object.hasOwn(options, name)) throw new SkillError('ARGUMENTS', 'Unknown, duplicate or incomplete option; run --help.');
    options[name] = value;
  }
  for (const name of ['limit', 'cursor', 'start-date', 'end-date']) if (options['--' + name] !== undefined) query[name.replace('-', '_')] = options['--' + name];
  let body;
  if (options['--body-file']) {
    try {
      const raw = readFileSync(options['--body-file']);
      if (raw.length > MAX_BYTES) throw new Error();
      body = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''));
    } catch { throw new SkillError('BODY_FILE', 'Cannot read a JSON object file of at most 2 MiB. No request sent.'); }
  }
  const plan = buildPlan(operation, { body, accountId: options['--account-id'], query });
  if (!plan.write && options['--confirm'] !== undefined) throw new SkillError('ARGUMENTS', 'Read operations do not accept --confirm.');
  return client.request(plan, options['--confirm']);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (Number(process.versions.node.split('.')[0]) < 20) throw new SkillError('NODE_VERSION', 'Use Node.js 20 or later. No npm packages are required.');
    console.log(JSON.stringify(await main(), null, 2));
  } catch (error) {
    const known = error instanceof SkillError;
    console.error(JSON.stringify({ error: known ? error.code : 'FAILED',
      message: known ? error.message : 'Operation failed. No secret or raw diagnostic is printed.', ...(known ? error.extra : {}) }));
    process.exitCode = 1;
  }
}
