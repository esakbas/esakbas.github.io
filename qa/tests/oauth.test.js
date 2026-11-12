import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { handleAuth, handleCallback } from '../src/oauth.js';
import { onRequestGet as authFunction } from '../functions/auth.js';
import { onRequestGet as callbackFunction } from '../functions/callback.js';

// These are deliberately fake values; no live OAuth service is contacted.
const env = {
  GITHUB_CLIENT_ID: 'test-client-id',
  GITHUB_CLIENT_SECRET: 'offline-test-client-secret-do-not-use',
  GITHUB_REPOSITORY: 'esakbas/hindiba-blog',
  GITHUB_ALLOWED_USER: 'esakbas',
  CMS_ORIGIN: 'https://hindiba-test.pages.dev',
};
const NOW = 1_794_420_000_000;
const token = 'gho_offline_test_access_token_not_a_credential';
const validRepo = { full_name: env.GITHUB_REPOSITORY, private: true, permissions: { push: true }, owner: { login: 'esakbas' } };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

async function begin(now = NOW, customEnv = env) {
  const result = await handleAuth(new Request(`${env.CMS_ORIGIN}/auth?provider=github`), customEnv, { now: () => now });
  assert.equal(result.status, 302);
  const cookie = result.headers.get('set-cookie').split(';')[0];
  const state = new URL(result.headers.get('location')).searchParams.get('state');
  return { cookie, state, result };
}
function callbackRequest(flow, { origin = env.CMS_ORIGIN, headers = {}, code = 'offline-code', state = flow.state, extraQuery = '' } = {}) {
  return new Request(`${origin}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}${extraQuery}`, { headers: { Cookie: flow.cookie, ...headers } });
}
function mockGitHub({ user = { login: 'esakbas' }, repository = validRepo, tokenData = { access_token: token, token_type: 'bearer', scope: 'repo' }, tokenStatus = 200, userStatus = 200, repoStatus = 200 } = {}) {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (url === 'https://github.com/login/oauth/access_token') return json(tokenData, tokenStatus);
    if (url === 'https://api.github.com/user') return json(user, userStatus);
    if (url === `https://api.github.com/repos/${env.GITHUB_REPOSITORY}`) return json(repository, repoStatus);
    throw new Error('Unexpected URL in offline OAuth test');
  };
  return { calls, fetch, now: () => NOW };
}
async function assertPrivateError(result, status) {
  assert.equal(result.status, status);
  const body = await result.text();
  assert.ok(!body.includes(env.GITHUB_CLIENT_SECRET));
  assert.ok(!body.includes(token));
  assert.match(result.headers.get('cache-control'), /no-store/);
  assert.match(result.headers.get('set-cookie') || '', /Max-Age=0/);
  return body;
}

test('auth uses a signed 32-byte state cookie, fixed private-repo scope and fixed callback', async () => {
  const request = new Request(`${env.CMS_ORIGIN}/auth?provider=github&scope=public_repo&redirect_uri=https://evil.example/callback&site_id=evil.example&repository=attacker/repo`);
  const result = await handleAuth(request, env, { now: () => NOW });
  assert.equal(result.status, 302);
  const target = new URL(result.headers.get('location'));
  assert.equal(target.origin, 'https://github.com');
  assert.equal(target.pathname, '/login/oauth/authorize');
  assert.equal(target.searchParams.get('scope'), 'repo');
  assert.equal(target.searchParams.get('redirect_uri'), `${env.CMS_ORIGIN}/callback`);
  assert.equal(target.searchParams.get('client_id'), env.GITHUB_CLIENT_ID);
  assert.equal(target.searchParams.get('allow_signup'), 'false');
  assert.match(target.searchParams.get('state'), /^[a-f0-9]{64}$/);
  assert.ok(!target.href.includes(env.GITHUB_CLIENT_SECRET));
  const cookie = result.headers.get('set-cookie');
  assert.match(cookie, /^__Host-hindiba_oauth_state=v1\.\d{10}\.([a-f0-9]{64})\.[\w-]{43};/);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=600']) assert.ok(cookie.includes(flag), flag);
  assert.match(result.headers.get('cache-control'), /no-store/);
  assert.equal(result.headers.get('referrer-policy'), 'no-referrer');
});

test('configuration and canonical origin checks disable auth on preview/foreign hosts', async () => {
  for (const missing of Object.keys(env)) {
    const incomplete = { ...env }; delete incomplete[missing];
    assert.equal((await handleAuth(new Request(`${env.CMS_ORIGIN}/auth?provider=github`), incomplete)).status, 503);
  }
  for (const CMS_ORIGIN of ['http://hindiba-test.pages.dev', `${env.CMS_ORIGIN}/admin`, `${env.CMS_ORIGIN}?x=1`, 'https://name:password@hindiba-test.pages.dev']) {
    assert.equal((await handleAuth(new Request(`${env.CMS_ORIGIN}/auth?provider=github`), { ...env, CMS_ORIGIN })).status, 503);
  }
  assert.equal((await handleAuth(new Request('https://preview.hindiba-test.pages.dev/auth?provider=github'), env)).status, 403);
  assert.equal((await handleAuth(new Request(`${env.CMS_ORIGIN}/auth?provider=github`, { headers: { Origin: 'https://evil.example' } }), env)).status, 403);
  assert.equal((await handleAuth(new Request(`${env.CMS_ORIGIN}/auth?provider=gitlab`), env)).status, 400);
  assert.equal((await handleAuth(new Request(`${env.CMS_ORIGIN}/auth?provider=github`, { method: 'POST' }), env)).status, 405);
});

test('successful callback exchanges the code server-side and checks account and private repository permissions', async () => {
  const flow = await begin();
  const github = mockGitHub();
  const result = await handleCallback(callbackRequest(flow), env, github);
  assert.equal(result.status, 200);
  assert.equal(github.calls.length, 3);
  const exchange = github.calls[0];
  assert.equal(exchange.options.method, 'POST');
  assert.equal(exchange.options.body.get('client_secret'), env.GITHUB_CLIENT_SECRET);
  assert.equal(exchange.options.body.get('redirect_uri'), `${env.CMS_ORIGIN}/callback`);
  assert.equal(exchange.options.body.get('code'), 'offline-code');
  assert.equal(exchange.options.redirect, 'manual');
  for (const call of github.calls.slice(1)) {
    assert.equal(call.options.headers.Authorization, `Bearer ${token}`);
    assert.equal(call.options.redirect, 'manual');
  }
  const html = await result.text();
  assert.ok(html.includes('authorization:github:success:'));
  assert.ok(html.includes(token)); // Runtime OAuth response, never a built/static file.
  assert.ok(!html.includes(env.GITHUB_CLIENT_SECRET));
  assert.ok(!html.includes('offline-code'));
  assert.match(result.headers.get('set-cookie'), /Max-Age=0/);
  assert.match(result.headers.get('cache-control'), /no-store/);
  assert.equal(result.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  const nonce = html.match(/<script nonce="([a-f0-9]+)">/)[1];
  assert.ok(result.headers.get('content-security-policy').includes(`script-src 'nonce-${nonce}'`));
  assert.ok(!html.includes('postMessage("*"'));
});

test('callback succeeds with Cloudflare-compatible fetch that rejects unsupported redirect modes', async () => {
  const flow = await begin(), github = mockGitHub();
  const cloudflareFetch = async (url, options = {}) => {
    if (options.redirect !== undefined && !['follow', 'manual'].includes(options.redirect)) {
      throw new TypeError('Unsupported redirect mode in Cloudflare fetch');
    }
    return github.fetch(url, options);
  };
  const result = await handleCallback(callbackRequest(flow), env, { now: () => NOW, fetch: cloudflareFetch });
  assert.equal(result.status, 200);
  assert.equal(github.calls.length, 3);
  assert.ok(github.calls.every(call => call.options.redirect === 'manual'));
  const html = await result.text();
  assert.ok(html.includes('authorization:github:success:'));
  assert.ok(!html.includes(env.GITHUB_CLIENT_SECRET));
  assert.ok(!html.includes('offline-code'));
});

test('302 and 307 redirects at token, account or repository checks are rejected without following or leaking upstream data', async () => {
  const stages = [
    { url: 'https://github.com/login/oauth/access_token', status: 502 },
    { url: 'https://api.github.com/user', status: 401 },
    { url: `https://api.github.com/repos/${env.GITHUB_REPOSITORY}`, status: 403 }
  ];
  for (const upstreamStatus of [302, 307]) for (const [index, stage] of stages.entries()) {
    const flow = await begin(), github = mockGitHub(), calls = [];
    const code = 'offline-redirect-code', marker = 'UNTRUSTED-REDIRECT-RESPONSE';
    const location = `https://external.invalid/capture?client_secret=${encodeURIComponent(env.GITHUB_CLIENT_SECRET)}&code=${code}&token=${token}`;
    const fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      assert.ok(stages.some(candidate => candidate.url === String(url)), 'credentials must never be sent to an external redirect location');
      assert.equal(options.redirect, 'manual');
      if (String(url) === stage.url) {
        return new Response(`${marker} ${env.GITHUB_CLIENT_SECRET} ${code} ${token}`, {
          status: upstreamStatus,
          headers: { Location: location, 'Content-Type': 'text/plain', 'X-Upstream-Secret': env.GITHUB_CLIENT_SECRET }
        });
      }
      return github.fetch(url, options);
    };
    const result = await handleCallback(callbackRequest(flow, { code }), env, { now: () => NOW, fetch });
    const body = await assertPrivateError(result, stage.status);
    assert.equal(result.headers.get('location'), null);
    const publicResponse = body + '\n' + [...result.headers].map(([name, value]) => `${name}: ${value}`).join('\n');
    for (const privateValue of [env.GITHUB_CLIENT_SECRET, token, code, marker, location, flow.state]) {
      assert.ok(!publicResponse.includes(privateValue), 'redirect failure must not echo upstream credentials, body, location or callback state');
    }
    assert.ok(!body.includes(String(upstreamStatus)), 'the public error must not echo the upstream redirect status');
    assert.equal(calls.length, index + 1, 'no later identity or repository check may run after a redirect');
    assert.deepEqual(calls.map(call => call.url), stages.slice(0, index + 1).map(candidate => candidate.url));
  }
});

test('callback rejects missing, mismatched, duplicate and forged CSRF state before contacting GitHub', async () => {
  const flow = await begin();
  // Alter meaningful signature bits, not the final base64url padding bits.
  const signatureStart = flow.cookie.lastIndexOf('.') + 1;
  const forgedCookie = flow.cookie.slice(0, signatureStart) + (flow.cookie[signatureStart] === 'A' ? 'B' : 'A') + flow.cookie.slice(signatureStart + 1);
  const requests = [
    callbackRequest(flow, { headers: { Cookie: '' } }),
    callbackRequest(flow, { state: '0'.repeat(64) }),
    callbackRequest(flow, { extraQuery: `&state=${flow.state}` }),
    callbackRequest(flow, { headers: { Cookie: `${flow.cookie}; ${flow.cookie}` } }),
    callbackRequest(flow, { headers: { Cookie: forgedCookie } }),
  ];
  for (const request of requests) {
    const github = mockGitHub();
    await assertPrivateError(await handleCallback(request, env, github), 400);
    assert.equal(github.calls.length, 0);
  }
});

test('signed timestamps reject expired and future cookies even if browser sends them', async () => {
  for (const time of [NOW - 600_000, NOW + 31_000]) {
    const flow = await begin(time);
    const github = mockGitHub();
    await assertPrivateError(await handleCallback(callbackRequest(flow), env, github), 400);
    assert.equal(github.calls.length, 0);
  }
  const flow = await begin(NOW - 1_000_000);
  const segments = flow.cookie.split('.');
  segments[1] = String(Math.floor(NOW / 1000));
  const github = mockGitHub();
  await assertPrivateError(await handleCallback(callbackRequest({ ...flow, cookie: segments.join('.') }), env, github), 400);
  assert.equal(github.calls.length, 0);
});

test('foreign callback origin and unauthorized/public repositories never return the token', async () => {
  const flow = await begin();
  for (const options of [{ origin: 'https://preview.hindiba-test.pages.dev' }, { headers: { Origin: 'https://evil.example' } }]) {
    const github = mockGitHub();
    await assertPrivateError(await handleCallback(callbackRequest(flow, options), env, github), 403);
    assert.equal(github.calls.length, 0);
  }
  for (const fixture of [
    { user: { login: 'someone-else' } },
    { repository: { ...validRepo, private: false } },
    { repository: { ...validRepo, permissions: { push: false } } },
    { repository: { ...validRepo, full_name: 'esakbas/another-repo' } },
    { repository: { ...validRepo, owner: { login: 'someone-else' } } },
    { repoStatus: 404 },
  ]) {
    const github = mockGitHub(fixture);
    await assertPrivateError(await handleCallback(callbackRequest(flow), env, github), 403);
    if (fixture.user) assert.equal(github.calls.length, 2);
  }
});

test('provider errors and upstream failures clear state and disclose no upstream details or credentials', async () => {
  const flow = await begin();
  const denied = new Request(`${env.CMS_ORIGIN}/callback?state=${flow.state}&error=access_denied&error_description=${env.GITHUB_CLIENT_SECRET}`, { headers: { Cookie: flow.cookie } });
  const unused = mockGitHub();
  await assertPrivateError(await handleCallback(denied, env, unused), 401);
  assert.equal(unused.calls.length, 0);
  for (const fixture of [
    { tokenData: { error: 'bad_verification_code', error_description: env.GITHUB_CLIENT_SECRET } },
    { tokenData: { access_token: token, token_type: 'not-bearer' } },
    { tokenData: { access_token: `bad\n${token}` } },
  ]) await assertPrivateError(await handleCallback(callbackRequest(flow), env, mockGitHub(fixture)), 401);
  await assertPrivateError(await handleCallback(callbackRequest(flow), env, mockGitHub({ tokenStatus: 500 })), 502);
  await assertPrivateError(await handleCallback(callbackRequest(flow), env, { now: () => NOW, fetch: async () => { throw new Error(env.GITHUB_CLIENT_SECRET); } }), 502);
  await assertPrivateError(await handleCallback(new Request(`${env.CMS_ORIGIN}/callback`), {}), 503);
});

test('state cookie is consumed in the browser; replay without it fails before token exchange', async () => {
  const flow = await begin();
  const first = await handleCallback(callbackRequest(flow), env, mockGitHub());
  assert.equal(first.status, 200);
  assert.match(first.headers.get('set-cookie'), /Max-Age=0/);
  const github = mockGitHub();
  await assertPrivateError(await handleCallback(callbackRequest(flow, { headers: { Cookie: '' } }), env, github), 400);
  assert.equal(github.calls.length, 0);
  // GitHub also enforces one-use authorization codes. An explicitly resent
  // captured cookie does not bypass that upstream protection.
  await assertPrivateError(await handleCallback(callbackRequest(flow), env, mockGitHub({ tokenData: { error: 'bad_verification_code' } })), 401);
});

test('popup sends the token only after an exact origin, source and handshake check', async () => {
  const flow = await begin();
  const html = await (await handleCallback(callbackRequest(flow), env, mockGitHub())).text();
  const script = html.match(/<script nonce="[a-f0-9]+">([\s\S]*?)<\/script>/)[1];
  const messages = [];
  const opener = { postMessage: (message, origin) => messages.push({ message, origin }) };
  let receiver;
  const status = { textContent: '' };
  const window = { opener, addEventListener: (_type, listener) => { receiver = listener; }, removeEventListener: () => {} };
  vm.runInNewContext(script, { window, document: { getElementById: () => status }, setTimeout: () => 1 });
  assert.deepEqual(messages, [{ message: 'authorizing:github', origin: env.CMS_ORIGIN }]);
  receiver({ origin: 'https://evil.example', source: opener, data: 'authorizing:github' });
  receiver({ origin: env.CMS_ORIGIN, source: {}, data: 'authorizing:github' });
  receiver({ origin: env.CMS_ORIGIN, source: opener, data: 'wrong-message' });
  assert.equal(messages.length, 1);
  receiver({ origin: env.CMS_ORIGIN, source: opener, data: 'authorizing:github' });
  assert.equal(messages.length, 2);
  assert.equal(messages[1].origin, env.CMS_ORIGIN);
  assert.equal(messages[1].message, `authorization:github:success:${JSON.stringify({ token, provider: 'github' })}`);
  receiver({ origin: env.CMS_ORIGIN, source: opener, data: 'authorizing:github' });
  assert.equal(messages.length, 2);
  const noOpenerStatus = { textContent: '' };
  vm.runInNewContext(script, { window: { opener: null }, document: { getElementById: () => noOpenerStatus }, setTimeout: () => 1 });
  assert.match(noOpenerStatus.textContent, /yönetim panelinden açılmalı/);
  assert.ok(!noOpenerStatus.textContent.includes(token));
});

test('Pages Functions expose the shared handlers without requiring any dependency', async () => {
  const deniedAuth = await authFunction({ request: new Request(`${env.CMS_ORIGIN}/auth?provider=github`), env: {} });
  const deniedCallback = await callbackFunction({ request: new Request(`${env.CMS_ORIGIN}/callback`), env: {} });
  assert.equal(deniedAuth.status, 503);
  assert.equal(deniedCallback.status, 503);
});
