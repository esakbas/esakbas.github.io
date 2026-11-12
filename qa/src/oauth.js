const COOKIE_NAME = '__Host-hindiba_oauth_state';
const STATE_TTL_SECONDS = 600;
const GITHUB_API = 'https://api.github.com';
const encoder = new TextEncoder();
const securityHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

function clearStateCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
function response(message, status = 400, { clearCookie = false, headers = {} } = {}) {
  return new Response(message, {
    status,
    headers: {
      ...securityHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      ...(clearCookie ? { 'Set-Cookie': clearStateCookie() } : {}),
      ...headers,
    },
  });
}
function configuration(env) {
  const { GITHUB_CLIENT_ID: clientId, GITHUB_CLIENT_SECRET: clientSecret, GITHUB_REPOSITORY: repository, GITHUB_ALLOWED_USER: allowedUser, CMS_ORIGIN: configuredOrigin } = env || {};
  if (![clientId, clientSecret, repository, allowedUser, configuredOrigin].every(value => typeof value === 'string' && value.trim())) return null;
  if (!/^[a-zA-Z0-9_.-]+$/.test(clientId) || !/^[a-zA-Z0-9-]+$/.test(allowedUser)) return null;
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) return null;
  const [owner, name] = repository.split('/');
  if (['.', '..'].includes(name) || owner.toLowerCase() !== allowedUser.toLowerCase()) return null;
  let origin;
  try {
    const url = new URL(configuredOrigin);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return null;
    origin = url.origin;
  } catch { return null; }
  return { clientId, clientSecret, repository, allowedUser, origin, callbackUrl: `${origin}/callback` };
}
function allowedRequest(request, config) {
  const url = new URL(request.url);
  const suppliedOrigin = request.headers.get('Origin');
  return url.origin === config.origin && (!suppliedOrigin || suppliedOrigin === config.origin);
}
function randomHex(length) {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), byte => byte.toString(16).padStart(2, '0')).join('');
}
function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeBase64url(value) {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
  } catch { return null; }
}
async function stateKey(config) {
  return crypto.subtle.importKey('raw', encoder.encode(config.clientSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
function signedMessage(value, config) {
  return encoder.encode(`hindiba-cms-oauth-state\0${config.origin}\0${config.repository}\0${config.allowedUser}\0${value}`);
}
async function signedStateCookie(state, config, now) {
  const value = `v1.${Math.floor(now / 1000)}.${state}`;
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await stateKey(config), signedMessage(value, config)));
  return `${value}.${base64url(signature)}`;
}
function getStateCookie(request) {
  const values = (request.headers.get('Cookie') || '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${COOKIE_NAME}=`));
  return values.length === 1 ? values[0].slice(COOKIE_NAME.length + 1) : null;
}
function equalState(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left || '') || !/^[a-f0-9]{64}$/.test(right || '')) return false;
  let difference = 0;
  for (let index = 0; index < 64; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
async function validState(request, state, config, now) {
  const cookie = getStateCookie(request);
  if (!cookie) return false;
  const parts = cookie.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1' || !/^\d{10,13}$/.test(parts[1]) || !/^[a-zA-Z0-9_-]{43}$/.test(parts[3])) return false;
  if (!equalState(parts[2], state)) return false;
  const issuedAt = Number(parts[1]);
  const current = Math.floor(now / 1000);
  if (issuedAt > current + 30 || current - issuedAt >= STATE_TTL_SECONDS) return false;
  const signature = decodeBase64url(parts[3]);
  return Boolean(signature && await crypto.subtle.verify('HMAC', await stateKey(config), signature, signedMessage(parts.slice(0, 3).join('.'), config)));
}
function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
function callbackResponse(token, config) {
  const nonce = randomHex(24);
  const payload = `authorization:github:success:${JSON.stringify({ token, provider: 'github' })}`;
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Hindiba — Yönetici girişi</title></head><body><main><h1>Hindiba yönetici girişi</h1><p id="status">Giriş yönetim paneline aktarılıyor…</p><a href="/admin/">Yönetim paneline dön</a></main><script nonce="${nonce}">(() => {
  const origin = ${scriptJson(config.origin)};
  const opener = window.opener;
  const status = document.getElementById('status');
  if (!opener) {
    status.textContent = 'Bu pencere yönetim panelinden açılmalı. Yönetim paneline dönüp yeniden giriş yapın.';
    return;
  }
  let finished = false;
  const receiveMessage = event => {
    if (finished || event.origin !== origin || event.source !== opener || event.data !== 'authorizing:github') return;
    finished = true;
    window.removeEventListener('message', receiveMessage);
    opener.postMessage(${scriptJson(payload)}, origin);
    status.textContent = 'Giriş tamamlandı. Yönetim paneline dönebilirsiniz.';
  };
  window.addEventListener('message', receiveMessage);
  opener.postMessage('authorizing:github', origin);
  setTimeout(() => {
    if (!finished) {
      window.removeEventListener('message', receiveMessage);
      status.textContent = 'Yönetim paneliyle bağlantı kurulamadı. Panele dönüp yeniden giriş yapın.';
    }
  }, 60000);
})();</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      ...securityHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Set-Cookie': clearStateCookie(),
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
    },
  });
}

/** Cloudflare Pages GET /auth. No token or client secret is sent to this URL. */
export async function handleAuth(request, env, dependencies = {}) {
  if (request.method !== 'GET') return response('Yalnızca GET isteği desteklenir.', 405, { headers: { Allow: 'GET' } });
  const config = configuration(env);
  if (!config) return response('Yönetici girişi henüz yapılandırılmadı. Site ayarlarını kontrol edin.', 503);
  if (!allowedRequest(request, config)) return response('Giriş yalnızca asıl site adresinden başlatılabilir.', 403);
  const url = new URL(request.url);
  if (url.searchParams.get('provider') !== 'github') return response('Desteklenmeyen giriş sağlayıcısı.', 400);
  const state = randomHex(32);
  const now = (dependencies.now || Date.now)();
  const cookie = await signedStateCookie(state, config, now);
  const authorization = new URL('https://github.com/login/oauth/authorize');
  authorization.searchParams.set('client_id', config.clientId);
  authorization.searchParams.set('redirect_uri', config.callbackUrl);
  authorization.searchParams.set('scope', 'repo');
  authorization.searchParams.set('state', state);
  authorization.searchParams.set('allow_signup', 'false');
  return response('', 302, { headers: {
    Location: authorization.href,
    'Set-Cookie': `${COOKIE_NAME}=${cookie}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${STATE_TTL_SECONDS}`,
  } });
}

/** Cloudflare Pages GET /callback. fetch/now are injectable solely for offline tests. */
export async function handleCallback(request, env, dependencies = {}) {
  if (request.method !== 'GET') return response('Yalnızca GET isteği desteklenir.', 405, { clearCookie: true, headers: { Allow: 'GET' } });
  const config = configuration(env);
  if (!config) return response('Yönetici girişi henüz yapılandırılmadı. Site ayarlarını kontrol edin.', 503, { clearCookie: true });
  if (!allowedRequest(request, config)) return response('Giriş yalnızca asıl site adresinde tamamlanabilir.', 403, { clearCookie: true });
  const url = new URL(request.url);
  const states = url.searchParams.getAll('state');
  const now = (dependencies.now || Date.now)();
  if (states.length !== 1 || !await validState(request, states[0], config, now)) return response('Giriş doğrulaması geçersiz veya süresi dolmuş. Yönetim panelinden yeniden giriş yapın.', 400, { clearCookie: true });
  if (url.searchParams.has('error')) return response('GitHub girişi onaylanmadı. Yönetim panelinden yeniden deneyebilirsiniz.', 401, { clearCookie: true });
  const codes = url.searchParams.getAll('code');
  if (codes.length !== 1 || !codes[0] || codes[0].length > 512 || /[\u0000-\u0020\u007f]/.test(codes[0])) return response('GitHub giriş kodu eksik veya geçersiz.', 400, { clearCookie: true });
  const requestFetch = dependencies.fetch || globalThis.fetch;
  try {
    const tokenResponse = await requestFetch('https://github.com/login/oauth/access_token', {
      method: 'POST', redirect: 'error',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Hindiba-CMS-OAuth' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code: codes[0], redirect_uri: config.callbackUrl }),
    });
    if (!tokenResponse.ok) return response('GitHub girişi tamamlanamadı. Lütfen yeniden deneyin.', 502, { clearCookie: true });
    const tokenData = await tokenResponse.json();
    const token = tokenData.access_token;
    if (tokenData.error || typeof token !== 'string' || !token || token.length > 8192 || /[\u0000-\u0020\u007f]/.test(token) || (tokenData.token_type && tokenData.token_type.toLowerCase() !== 'bearer')) return response('GitHub giriş kodu kullanılamadı. Yönetim panelinden yeniden giriş yapın.', 401, { clearCookie: true });
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Hindiba-CMS-OAuth' };
    const userResponse = await requestFetch(`${GITHUB_API}/user`, { headers, redirect: 'error' });
    if (!userResponse.ok) return response('GitHub hesabı doğrulanamadı.', 401, { clearCookie: true });
    const user = await userResponse.json();
    if (typeof user.login !== 'string' || user.login.toLowerCase() !== config.allowedUser.toLowerCase()) return response('Bu yönetim paneline giriş yetkiniz yok.', 403, { clearCookie: true });
    const repoResponse = await requestFetch(`${GITHUB_API}/repos/${config.repository}`, { headers, redirect: 'error' });
    if (!repoResponse.ok) return response('İçerik deposuna erişim yetkisi doğrulanamadı.', 403, { clearCookie: true });
    const repository = await repoResponse.json();
    if (repository.private !== true || repository.permissions?.push !== true || typeof repository.full_name !== 'string' || repository.full_name.toLowerCase() !== config.repository.toLowerCase() || repository.owner?.login?.toLowerCase() !== config.allowedUser.toLowerCase()) return response('Özel içerik deposu ve yazma yetkisi doğrulanamadı. Depo ayarlarını kontrol edin.', 403, { clearCookie: true });
    return callbackResponse(token, config);
  } catch {
    // Never log OAuth response bodies, authorization codes, tokens, or secrets.
    return response('Giriş hizmetine ulaşılamadı. Yönetim panelinden yeniden deneyin.', 502, { clearCookie: true });
  }
}
