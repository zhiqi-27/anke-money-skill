import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createClient, buildPlan, httpsTransport, checkHTTP, main, ORIGIN, OPERATIONS } from '../scripts/anke-money.mjs';
import { createVault, promptKey } from '../scripts/credentials.mjs';

const KEY = 'ank_AAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const ID = '00000000-0000-4000-8000-000000000001';
const ID2 = '00000000-0000-4000-8000-000000000002';
const body = () => ({ id: ID, idempotencyKey: ID2, amountInFen: 3200, channelId: null, note: 'Lunch' });
const validCheck = () => ({ status: 422, body: { detail: 'Request validation failed', errors: [{ location: 'query.limit', type: 'greater_than_equal' }] } });
function fixture({ saved = null, response = { status: 200, body: { items: [], hasMore: false, nextCursor: null } }, env = {} } = {}) {
  const calls = [], stores = [];
  const vault = { name: 'test vault', read: () => saved, write: value => { stores.push(value); saved = value; }, remove: () => { saved = null; } };
  return { calls, stores, vault, client: createClient({ vault, env, prompt: async () => KEY,
    transport: async (plan, key) => { calls.push({ plan, key }); return typeof response === 'function' ? response(plan) : response; } }) };
}

test('first setup validates auth and Pro without reading data, then saves once; later processes reuse it', async () => {
  const f = fixture({ response: validCheck() });
  const result = await f.client.setup();
  assert.equal(result.configured, true);
  assert.equal(result.scopesVerified, false);
  assert.equal(result.financialDataRead, false);
  assert.deepEqual(f.stores, [KEY]);
  assert.equal(f.calls[0].plan.path, '/agent/v1/categories?limit=0');
  const later = createClient({ vault: f.vault, env: {}, transport: async () => validCheck(), prompt: () => assert.fail('no second prompt') });
  assert.equal((await later.setup()).reused, true);
  assert.equal(f.stores.length, 1);
  assert.ok(!JSON.stringify(result).includes(KEY));
});

test('failed validation and cancellation never save or replace an existing Key', async () => {
  for (const status of [401, 402, 403, 429, 500, 302]) {
    const f = fixture({ saved: 'original-existing-key', response: { status, body: {} } });
    await assert.rejects(() => f.client.setup({ replace: true }));
    assert.deepEqual(f.stores, []);
    assert.equal(f.vault.read(), 'original-existing-key');
    assert.equal(f.calls.length, 1);
  }
  const f = fixture();
  const client = createClient({ vault: f.vault, env: {}, prompt: async () => { throw new Error('cancel'); } });
  await assert.rejects(() => client.setup());
  assert.equal(f.stores.length, 0);
});

test('host secret wins without fallback; setup cannot silently save a shadowed Key', async () => {
  const f = fixture({ saved: KEY, env: { ANKE_MONEY_API_KEY: 'different-env-key-value' }, response: { status: 401, body: {} } });
  assert.deepEqual(f.client.status(), { configured: true, source: 'environment', verified: false });
  await assert.rejects(() => f.client.setup(), { code: 'HOST_SECRET_PRESENT' });
  await assert.rejects(() => f.client.request(buildPlan('categories_read')), { code: 'HTTP_ERROR' });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].key, 'different-env-key-value');
  const empty = fixture({ saved: KEY, env: { ANKE_MONEY_API_KEY: '' } });
  await assert.rejects(() => empty.client.check(), { code: 'INVALID_KEY' });
  assert.equal(empty.calls.length, 0);
});

test('write preview requires no credential or network; matching confirmation preserves IDs and body', async () => {
  const f = fixture();
  const plan = buildPlan('ledger_create', { body: body() });
  const preview = await f.client.request(plan);
  assert.equal(preview.sent, false);
  assert.deepEqual(preview.body, body());
  assert.equal(f.calls.length, 0);
  await assert.rejects(() => f.client.request(plan, preview.confirmation), { code: 'SETUP_REQUIRED' });
  const configured = fixture({ saved: KEY, response: { status: 200, body: { replayed: true } } });
  assert.deepEqual(await configured.client.request(plan, preview.confirmation), { replayed: true });
  assert.deepEqual(configured.calls[0].plan.body, body());
  assert.equal(configured.calls.length, 1);
});

test('changing money, IDs, revisions, operation, account, or batch membership invalidates confirmation', async () => {
  const f = fixture({ saved: KEY });
  const original = buildPlan('ledger_create', { body: body() });
  for (const delta of [{ amountInFen: 3300 }, { id: ID2 }, { idempotencyKey: ID }, { note: 'changed' }]) {
    await assert.rejects(() => f.client.request(buildPlan('ledger_create', { body: { ...body(), ...delta } }), original.confirmation), { code: 'CONFIRMATION_MISMATCH' });
  }
  const update = buildPlan('assets_update', { accountId: ID, body: { ...body(), expectedRevision: 3 } });
  for (const other of [buildPlan('assets_update', { accountId: ID2, body: update.body }), buildPlan('assets_update', { accountId: ID, body: { ...update.body, expectedRevision: 4 } })]) {
    await assert.rejects(() => f.client.request(other, update.confirmation), { code: 'CONFIRMATION_MISMATCH' });
  }
  await assert.rejects(() => f.client.request(buildPlan('assets_create', { body: body() }), original.confirmation), { code: 'CONFIRMATION_MISMATCH' });
  const batch = buildPlan('ledger_create_batch', { body: { entries: [body()] } });
  await assert.rejects(() => f.client.request(buildPlan('ledger_create_batch', { body: { entries: [body(), { ...body(), id: ID2, idempotencyKey: ID }] } }), batch.confirmation), { code: 'CONFIRMATION_MISMATCH' });
  assert.equal(f.calls.length, 0);
  const reordered = Object.fromEntries(Object.entries(body()).reverse());
  assert.equal(buildPlan('ledger_create', { body: reordered }).confirmation, original.confirmation);
});

test('all nine routes stay on the trusted origin; update IDs, forbidden operations and inputs are checked', () => {
  assert.equal(Object.keys(OPERATIONS).length, 9);
  for (const operation of Object.keys(OPERATIONS)) {
    const options = operation.endsWith('_read') ? {} : operation.endsWith('_batch')
      ? { body: { [operation === 'ledger_create_batch' ? 'entries' : 'accounts']: [body()] } }
      : { body: { ...body(), expectedRevision: 1 }, ...(operation === 'assets_update' ? { accountId: ID } : {}) };
    const plan = buildPlan(operation, options);
    assert.equal(new URL(plan.path, ORIGIN).origin, ORIGIN);
    assert.ok(plan.path.startsWith('/agent/v1/'));
  }
  for (const op of ['delete', 'toString', 'https://evil.example', '/api/v1/sync/push']) assert.throws(() => buildPlan(op));
  assert.throws(() => buildPlan('assets_update', { accountId: '../other', body: body() }));
  assert.throws(() => buildPlan('assets_update', { accountId: ID, body: body() }), { code: 'REVISION' });
  assert.throws(() => buildPlan('ledger_create', { body: { id: ID } }), { code: 'IDEMPOTENCY' });
  assert.throws(() => buildPlan('ledger_create_batch', { body: { entries: Array(26).fill(body()) } }), { code: 'BATCH' });
  assert.throws(() => buildPlan('categories_read', { query: { householdId: ID } }));
  assert.throws(() => buildPlan('categories_read', { query: { limit: '0' } }));
  const cursor = 'opaque/+?=&value';
  assert.equal(new URL(buildPlan('ledger_read', { query: { cursor, limit: '1' } }).path, ORIGIN).searchParams.get('cursor'), cursor);
});

test('network failures and server errors never retry or generate new idempotency keys', async () => {
  let calls = 0;
  const client = createClient({ env: { ANKE_MONEY_API_KEY: KEY }, transport: async () => { calls++; throw new Error('network'); } });
  const plan = buildPlan('ledger_create', { body: body() });
  await assert.rejects(() => client.request(plan, plan.confirmation));
  assert.equal(calls, 1);
  for (const status of [401, 402, 403, 409, 429, 503]) {
    const f = fixture({ saved: KEY, response: { status, body: { detail: KEY }, retryAfter: '12' } });
    await assert.rejects(() => f.client.request(plan, plan.confirmation), error => {
      assert.ok(!JSON.stringify(error).includes(KEY));
      if (status === 503) assert.equal(error.extra.outcomeUncertain, true);
      if (status === 429) assert.equal(error.extra.retryAfterSeconds, 12);
      return true;
    });
    assert.equal(f.calls.length, 1);
  }
});

test('native HTTPS verifies TLS, sends Key only in header and refuses credential-bearing redirects', async () => {
  const calls = [];
  const fake = (url, options, callback) => {
    calls.push({ url, options });
    const req = new EventEmitter();
    req.end = data => {
      calls[0].data = data;
      const res = new EventEmitter();res.statusCode = 302;res.headers = { location: 'https://evil.example' };
      callback(res);
      queueMicrotask(() => { res.emit('data', Buffer.from('{}'));res.emit('end'); });
    };
    req.destroy = () => req.emit('error', new Error(KEY));
    return req;
  };
  const result = await httpsTransport(buildPlan('categories_read'), KEY, fake);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.origin, ORIGIN);
  assert.equal(calls[0].options.rejectUnauthorized, true);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + KEY);
  assert.ok(!calls[0].url.href.includes(KEY));
  assert.throws(() => checkHTTP(result), { code: 'HTTP_ERROR' });
  for (const path of ['https://evil.example/agent/v1/categories', '/api/v1/me', '//evil.example/agent/v1/categories']) {
    await assert.rejects(() => httpsTransport({ method: 'GET', path }, KEY, () => assert.fail('no credential leak')), { code: 'HTTP_ORIGIN' });
  }
});

test('accidental secret reflection is removed from successful responses', async () => {
  const f = fixture({ saved: KEY, response: { status: 200, body: { note: 'reflected ' + KEY } } });
  assert.deepEqual(await f.client.request(buildPlan('categories_read')), { note: 'reflected [REDACTED]' });
});

test('CLI accepts file-based write proposals, rejects duplicate options and never treats generic consent as confirmation', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'anke-skill-test-'));
  try {
    const path = join(folder, 'proposal with spaces.json');writeFileSync(path, '\uFEFF' + JSON.stringify(body()));
    const f = fixture();
    const preview = await main(['request', 'ledger_create', '--body-file', path], f.client);
    assert.equal(preview.sent, false);
    await assert.rejects(() => main(['request', 'ledger_create', '--body-file', path, '--confirm', 'yes'], f.client), { code: 'CONFIRMATION_MISMATCH' });
    await assert.rejects(() => main(['request', 'categories_read', '--limit', '1', '--limit', '2'], f.client), { code: 'ARGUMENTS' });
    await assert.rejects(() => main(['request', 'categories_read', '--url', 'https://evil.example'], f.client), { code: 'ARGUMENTS' });
    assert.equal(f.calls.length, 0);
  } finally { rmSync(folder, { recursive: true }); }
});

for (const platform of ['darwin', 'linux', 'win32']) test(`${platform} vault passes secrets through stdin, never argv; native failures are redacted`, () => {
  const calls = [];
  const vault = createVault({ platform, run: (command, args, input) => {
    calls.push({ command, args, input });
    return { status: 0, stdout: calls.length === 2 ? KEY : '', failed: false };
  } });
  vault.write(KEY);
  assert.ok(!JSON.stringify(calls.map(({ command, args }) => ({ command, args }))).includes(KEY));
  assert.ok(calls[0].input.includes(KEY));
  if (platform === 'win32') {
    const script = Buffer.from(calls[0].args.at(-1), 'base64').toString('utf16le');
    assert.ok(script.includes('CredWriteW'));
    assert.ok(!script.includes(KEY));
  }
  const broken = createVault({ platform, run: () => ({ status: 7, stdout: KEY, hadStderr: true }) });
  assert.throws(() => broken.read(), error => !error.message.includes(KEY) && error.code === 'VAULT_UNAVAILABLE');
});

test('missing vault and failed macOS inner write fail closed', () => {
  assert.throws(() => createVault({ platform: 'unsupported' }).read(), { code: 'VAULT_UNAVAILABLE' });
  assert.throws(() => createVault({ platform: 'linux', run: () => ({ status: 1, stdout: '', hadStderr: true }) }).read(), { code: 'VAULT_UNAVAILABLE' });
  const vault = createVault({ platform: 'darwin', run: (_cmd, args) => ({ status: args[0] === '-i' ? 0 : 44, stdout: '' }) });
  assert.throws(() => vault.write(KEY), { code: 'VAULT_SAVE_FAILED' });
});

test('hidden input never echoes secrets, restores raw mode and handles cancellation/non-TTY', async () => {
  const input = new EventEmitter();input.isTTY = true;input.isRaw = false;
  const modes = [];input.setRawMode = v => modes.push(v);input.pause = () => {};input.resume = () => {};
  let printed = '';const output = { isTTY: true, write: s => { printed += s; } };
  const promise = promptKey(input, output);input.emit('data', Buffer.from(KEY + '\r'));
  assert.equal(await promise, KEY);assert.ok(!printed.includes(KEY));assert.deepEqual(modes, [true, false]);
  const cancelled = promptKey(input, output);input.emit('data', Buffer.from('partial\u0003'));
  await assert.rejects(() => cancelled, { code: 'CANCELLED' });
  assert.equal(input.listenerCount('data'), 0);
  await assert.rejects(() => promptKey({ isTTY: false }, output), { code: 'TERMINAL_REQUIRED' });
});

test('local credential removal requires explicit option and never revokes App credentials', () => {
  const f = fixture({ saved: KEY });
  assert.throws(() => f.client.forget(), { code: 'CONFIRMATION_REQUIRED' });
  assert.equal(f.vault.read(), KEY);
  assert.deepEqual(f.client.forget(true), { localCredentialRemoved: true, appKeyRevoked: false, hostEnvironmentChanged: false });
  assert.equal(f.vault.read(), null);
  assert.equal(f.calls.length, 0);
});

test('actual native vault roundtrip with a unique synthetic credential', { skip: process.env.ANKE_MONEY_TEST_NATIVE_VAULT !== '1' }, () => {
  const target = 'com.anke.money.skill.test.' + process.pid + '.' + Date.now();
  const vault = createVault({ target });
  try {
    assert.equal(vault.read(), null);
    vault.write(KEY);
    assert.equal(vault.read(), KEY);
    // A separate process can read the saved credential without an env var.
    const moduleURL = new URL('../scripts/credentials.mjs', import.meta.url).href;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import {createVault} from ${JSON.stringify(moduleURL)}; let input='';for await(const c of process.stdin)input+=c;console.log(createVault({target:${JSON.stringify(target)}}).read()===input);`],
      { input: KEY, encoding: 'utf8', env: { ...process.env, ANKE_MONEY_API_KEY: '' } });
    assert.equal(child.status, 0);
    assert.equal(child.stdout.trim(), 'true');
    assert.ok(!child.stderr.includes(KEY));
    vault.write('replacement-synthetic-key-value');
    assert.equal(vault.read(), 'replacement-synthetic-key-value');
  } finally { vault.remove(); }
  assert.equal(vault.read(), null);
});

test('HTTP debug tracing cannot leak credentials through Node internal logs', async () => {
  const original = process.env.NODE_DEBUG;
  try {
    process.env.NODE_DEBUG = 'http,https';
    await assert.rejects(() => httpsTransport(buildPlan('categories_read'), KEY, () => assert.fail('no HTTP call')), { code: 'DEBUG_DISABLED' });
  } finally {
    if (original === undefined) delete process.env.NODE_DEBUG;
    else process.env.NODE_DEBUG = original;
  }
});

test('CLI does not echo unexpected argument contents or attempt to accept a Key argument', () => {
  const result = spawnSync(process.execPath, ['scripts/anke-money.mjs', 'setup', '--key', KEY], { encoding: 'utf8', cwd: new URL('..', import.meta.url), env: { ...process.env, ANKE_MONEY_API_KEY: '' } });
  assert.equal(result.status, 1);
  assert.ok(!result.stdout.includes(KEY) && !result.stderr.includes(KEY));
});
