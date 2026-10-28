// Prints anon/service keys (HS256 JWTs) for the local test stack.
import crypto from 'node:crypto';

const secret = process.env.JWT_SECRET || 'super-secret-jwt-token-with-at-least-32-characters-long';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

export function sign(payload) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const sig = crypto.createHmac('sha256', secret).update(head + '.' + body).digest('base64url');
  return `${head}.${body}.${sig}`;
}

const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
export const ANON_KEY = sign({ iss: 'supabase-local', role: 'anon', exp });
export const SERVICE_ROLE_KEY = sign({ iss: 'supabase-local', role: 'service_role', exp });

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`SUPABASE_ANON_KEY=${ANON_KEY}`);
  console.log(`SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}`);
}
