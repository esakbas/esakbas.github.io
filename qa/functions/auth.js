import { handleAuth } from '../src/oauth.js';

export function onRequestGet({ request, env }) {
  return handleAuth(request, env);
}
