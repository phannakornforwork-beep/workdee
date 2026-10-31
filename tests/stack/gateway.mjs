// Local/CI gateway that mimics the Supabase API layout on one port:
//   /auth/v1/*    -> GoTrue (auth server)
//   /rest/v1/*    -> PostgREST
//   /storage/v1/* -> small storage stub that stores files on disk but checks
//                    access with the real storage.objects RLS policies (via psql)
// No npm dependencies on purpose.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PORT = Number(process.env.GATEWAY_PORT || 54321);
const AUTH = process.env.AUTH_URL || 'http://127.0.0.1:9999';
const REST = process.env.REST_URL || 'http://127.0.0.1:3001';
const SECRET = process.env.JWT_SECRET;
const FILES = process.env.STORAGE_DIR || path.resolve('.stack/files');
const DB_URL = process.env.DB_URL || 'postgres://postgres:postgres@127.0.0.1:54322/postgres';

fs.mkdirSync(FILES, { recursive: true });

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, X-Total-Count');
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function verifyJwt(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(parts[0] + '.' + parts[1]).digest());
  if (sig !== parts[2]) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    if (claims.exp && claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

function claimsFrom(req) {
  const auth = req.headers['authorization'] || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  return verifyJwt(bearer) || verifyJwt(req.headers['apikey']);
}

function sqlLiteral(v) {
  return "'" + String(v).replace(/'/g, "''") + "'";
}

// Run one statement as the caller's database role so RLS applies like hosted Supabase.
function runAs(claims, statement) {
  const role = claims?.role === 'service_role' ? 'service_role' : claims?.role === 'authenticated' ? 'authenticated' : 'anon';
  const sql = [
    'begin;',
    `select set_config('request.jwt.claims', ${sqlLiteral(JSON.stringify(claims || {}))}, true);`,
    `select set_config('request.jwt.claim.sub', ${sqlLiteral(claims?.sub || '')}, true);`,
    `set local role ${role};`,
    statement,
    'commit;'
  ].join('\n');
  const r = spawnSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-qtA', '-c', sql], { encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Extract file bytes from a multipart body (supabase-js sends FormData in the browser).
function fileFromMultipart(buf, contentType) {
  const m = /boundary=(.+)$/.exec(contentType || '');
  if (!m) return buf;
  const boundary = Buffer.from('--' + m[1].replace(/^"|"$/g, ''));
  const start = buf.indexOf(boundary);
  if (start < 0) return buf;
  const headerEnd = buf.indexOf(Buffer.from('\r\n\r\n'), start);
  const next = buf.indexOf(boundary, headerEnd);
  return buf.subarray(headerEnd + 4, next - 2);
}

const signed = new Map(); // token -> {bucket, name, exp}

async function storage(req, res, rest) {
  const claims = claimsFrom(req);
  const url = new URL(rest, 'http://x');
  const seg = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  // seg[0] === 'object'
  if (seg[0] !== 'object') return json(res, 404, { error: 'not_found' });

  if (seg[1] === 'sign' && req.method === 'POST') {
    const bucket = seg[2];
    const name = seg.slice(3).join('/');
    const r = runAs(claims, `select count(*) from storage.objects where bucket_id = ${sqlLiteral(bucket)} and name = ${sqlLiteral(name)};`);
    if (!r.ok || r.out.split('\n').pop() !== '1') return json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const token = crypto.randomBytes(16).toString('hex');
    signed.set(token, { bucket, name, exp: Date.now() + (body.expiresIn || 60) * 1000 });
    return json(res, 200, { signedURL: `/object/sign/${bucket}/${name}?token=${token}` });
  }
  if (seg[1] === 'sign' && req.method === 'GET') {
    const s = signed.get(url.searchParams.get('token'));
    if (!s || s.exp < Date.now()) return json(res, 400, { error: 'invalid_token' });
    const file = path.join(FILES, s.bucket, s.name);
    if (!fs.existsSync(file)) return json(res, 404, { error: 'not_found' });
    res.writeHead(200);
    return res.end(fs.readFileSync(file));
  }

  // bucket สาธารณะ: อ่านได้โดยไม่ต้องล็อกอิน (เหมือน /object/public ของ Supabase)
  if (seg[1] === 'public' && req.method === 'GET') {
    const bucket = seg[2];
    const name = seg.slice(3).join('/');
    const pub = runAs(null, `select count(*) from storage.objects where bucket_id = ${sqlLiteral(bucket)} and name = ${sqlLiteral(name)};`);
    const file = path.join(FILES, bucket, name);
    if (!pub.ok || pub.out.split('\n').pop() !== '1' || !fs.existsSync(file)) return json(res, 404, { error: 'not_found' });
    const types = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
    res.writeHead(200, { 'Content-Type': types[path.extname(name).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' });
    return res.end(fs.readFileSync(file));
  }

  const isAuthPrefix = seg[1] === 'authenticated';
  const bucket = isAuthPrefix ? seg[2] : seg[1];
  const name = (isAuthPrefix ? seg.slice(3) : seg.slice(2)).join('/');

  if (req.method === 'POST' || req.method === 'PUT') {
    const raw = await readBody(req);
    const bytes = fileFromMultipart(raw, req.headers['content-type']);
    const upsert = req.headers['x-upsert'] === 'true';
    const statement = upsert
      ? `insert into storage.objects (bucket_id, name, owner) values (${sqlLiteral(bucket)}, ${sqlLiteral(name)}, ${claims?.sub ? sqlLiteral(claims.sub) : 'null'}) on conflict (bucket_id, name) do update set created_at = now();`
      : `insert into storage.objects (bucket_id, name, owner) values (${sqlLiteral(bucket)}, ${sqlLiteral(name)}, ${claims?.sub ? sqlLiteral(claims.sub) : 'null'});`;
    const r = runAs(claims, statement);
    if (!r.ok) {
      const dup = /duplicate key/.test(r.err);
      return json(res, 400, { statusCode: dup ? '409' : '403', error: dup ? 'Duplicate' : 'Unauthorized', message: dup ? 'The resource already exists' : 'new row violates row-level security policy' });
    }
    const file = path.join(FILES, bucket, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    return json(res, 200, { Key: `${bucket}/${name}`, Id: crypto.randomUUID() });
  }

  if (req.method === 'GET') {
    const r = runAs(claims, `select count(*) from storage.objects where bucket_id = ${sqlLiteral(bucket)} and name = ${sqlLiteral(name)};`);
    if (!r.ok || r.out.split('\n').pop() !== '1') return json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    const file = path.join(FILES, bucket, name);
    res.writeHead(200);
    return res.end(fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0));
  }

  if (req.method === 'DELETE') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const names = body.prefixes || [];
    const removed = [];
    for (const n of names) {
      const r = runAs(claims, `delete from storage.objects where bucket_id = ${sqlLiteral(seg[1])} and name = ${sqlLiteral(n)} returning name;`);
      if (r.ok && r.out) {
        removed.push({ name: n });
        fs.rmSync(path.join(FILES, seg[1], n), { force: true });
      }
    }
    return json(res, 200, removed);
  }
  return json(res, 405, { error: 'method_not_allowed' });
}

function proxy(req, res, target, rest) {
  const url = new URL(rest, target);
  const headers = { ...req.headers, host: url.host };
  const up = http.request(url, { method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode || 502, r.headers);
    r.pipe(res);
  });
  up.on('error', (e) => json(res, 502, { error: 'bad_gateway', message: e.message }));
  req.pipe(up);
}

http
  .createServer(async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    const u = req.url || '/';
    try {
      if (u.startsWith('/auth/v1')) return proxy(req, res, AUTH, u.slice('/auth/v1'.length) || '/');
      if (u.startsWith('/rest/v1')) return proxy(req, res, REST, u.slice('/rest/v1'.length) || '/');
      if (u.startsWith('/storage/v1')) return await storage(req, res, u.slice('/storage/v1'.length) || '/');
      if (u === '/health') return json(res, 200, { ok: true });
      return json(res, 404, { error: 'not_found' });
    } catch (e) {
      return json(res, 500, { error: 'gateway_error', message: String(e) });
    }
  })
  .listen(PORT, '127.0.0.1', () => console.log(`gateway on http://127.0.0.1:${PORT}`));
