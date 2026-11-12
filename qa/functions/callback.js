import { handleCallback } from '../src/oauth.js';

export function onRequestGet({ request, env }) {
  return handleCallback(request, env);
}
