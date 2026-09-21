import http from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { analyze, decideFor, cleanComps, clean } from './pipeline.js';
import { toPublic, ENGINE_VERSION } from './schema.js';
import { estimateRent, type RentCtx } from './scorecard.js';
import { decide, type Decision } from './decide.js';
import { parseRequest, type Parsed } from './validate.js';
import { openapi } from './openapi.js';
import { allowedUrl } from './hosts.js';
import { assessNeighbourhood, areaFlags, NOT_REQUESTED, type Nb, type Provider } from './neighbourhood.js';
import { osmProvider } from './osm.js';
import { httpMarketProvider, coerceSales, coerceRentals, type MarketMeta, type MarketProvider } from './providers.js';
import { extractComparables } from './comparables.js';
import { loadScoring } from './scoring.js';
import type { Listing, Profile } from './types.js';


const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const DAY = 86_400_000, MAX_BODY = 2_000_000;
export interface AppConfig { keys: string; rateLimitPerMin?: number; corsOrigins?: string[]; maxRenders?: number; amenities?: Provider; market?: MarketProvider }

const send = (res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}, type = 'application/json') => {
  const s = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers });
  res.end(s); return s;
};
const readBody = (req: http.IncomingMessage) => new Promise<string>((ok, no) => {
  let n = 0; const chunks: Buffer[] = [];
  req.on('data', (b: Buffer) => { n += b.length; if (n > MAX_BODY) { no(new Error('too large')); req.destroy(); } else chunks.push(b); });
  req.on('end', () => ok(Buffer.concat(chunks).toString('utf8'))); req.on('error', no);
});

const toComp = (c: Parsed['comparables'][number]) => ({ price: c.price, floorSqm: c.floorAreaM2, erfSqm: c.erfM2, beds: c.bedrooms, propertyType: c.propertyType, kind: c.priceType, date: c.soldDate, address: c.address });

async function compute(v: Parsed, amenities: Provider, market?: MarketProvider): Promise<{ d: Decision; rc?: RentCtx; nb: Nb; md: MarketMeta }> {
  let comps = v.comparables, rentals = v.rentalComparables;
  let d = await base(v, comps);
  let md: MarketMeta = { source: comps.length || rentals.length ? 'supplied' : 'none', status: 'ok', salesReceived: comps.length, rentalsReceived: rentals.length };
  if (v.marketData === 'provider' && !comps.length && !rentals.length) {
    md = { source: 'provider', status: 'not_configured', salesReceived: 0, rentalsReceived: 0 };
    if (market) try {
      const r = await market({ city: d.L.city, suburb: d.L.suburb, propertyType: d.L.propertyType, bedrooms: d.L.beds, floorAreaM2: d.L.floorSqm, erfM2: d.L.erfSqm, lat: d.L.lat, lng: d.L.lng });
      comps = coerceSales(r.sales); rentals = coerceRentals(r.rentals);
      md = { source: 'provider', status: comps.length || rentals.length ? 'ok' : 'empty', salesReceived: comps.length, rentalsReceived: rentals.length };
      if (comps.length) d = decide(d.L, d.p, cleanComps(comps.map(toComp)).comps);
    } catch { md.status = 'unavailable'; }
  }
  let rc: RentCtx | undefined;
  if (v.buyer.expectedMonthlyRent) rc = { basis: 'supplied', count: 0 };
  else if (rentals.length) {
    const est = estimateRent(d.L, rentals.map(r => ({ monthlyRent: r.monthlyRent, floorSqm: r.floorAreaM2, beds: r.bedrooms, propertyType: r.propertyType, date: r.listedDate })));
    if ('note' in est) d.flags.push({ code: 'WEAK_RENTAL_EVIDENCE', level: 'medium', text: est.note });
    else { rc = est; d = decide(d.L, { ...d.p, monthlyRent: est.median }, cleanComps(comps.map(toComp)).comps); }
  }
  let nb: Nb = NOT_REQUESTED;
  if (v.neighbourhood) {
    const N = v.neighbourhood, listing = d.L.lat !== undefined && d.L.lng !== undefined ? { lat: d.L.lat, lng: d.L.lng } : undefined;
    nb = await assessNeighbourhood({ location: N.location ?? listing, locationSource: N.location ? 'supplied' : 'listing', priorities: N.priorities, metrics: N.metrics, useOsm: N.osm }, amenities);
    d.flags.push(...areaFlags(nb, N.metrics));   // area findings feed the risk list and risk score
  }
  return { d, rc, nb, md };
}

async function base(v: Parsed, comps: Parsed['comparables']) {
  const b = v.buyer;
  const profile: Partial<Profile> = { buyer: b.profile?.replace('_', '-') as Profile['buyer'], depositPct: b.depositPercent, rate: b.interestRate, termYears: b.termYears, grossIncome: b.grossMonthlyIncome, monthlyRent: b.expectedMonthlyRent, vatSale: b.vatSale };
  const cc = comps.map(toComp);
  if (v.property) {
    const P = v.property;
    const L: Listing = { url: 'supplied', title: P.title, suburb: P.suburb, city: P.city, propertyType: P.propertyType, titleType: P.titleType ?? 'unknown', price: P.askingPrice, beds: P.bedrooms, baths: P.bathrooms, parking: P.parking, floorSqm: P.floorAreaM2, erfSqm: P.erfM2, levy: P.levyMonthly, rates: P.ratesMonthly, features: P.features.map(f => f.toLowerCase()), src: {} };
    for (const k of ['price', 'beds', 'baths', 'parking', 'floorSqm', 'erfSqm', 'levy', 'rates']) if ((L as any)[k] !== undefined) L.src[k] = 'user';
    return decideFor(L, { profile, comps: cc }).d;
  }
  return (await analyze(v.url!, { html: v.html, allow: h => !!allowedUrl(h), profile, comps: cc })).d;
}

/** keys: "client:secret[:limitPerMin],client2:secret2" */
export function createApp(cfg: AppConfig) {
  const clients = new Map<string, { name: string; limit: number }>();
  for (const e of cfg.keys.split(',').filter(Boolean)) { const [name, secret, lim] = e.split(':'); if (name && secret) clients.set(sha(secret), { name, limit: Number(lim) || cfg.rateLimitPerMin || 60 }); }
  if (!clients.size) throw new Error('API_KEYS is required, format "client:secret,client2:secret2".');
  const windows = new Map<string, { n: number; reset: number }>();
  const replay = new Map<string, { fp: string; body: string; at: number }>();
  let renders = 0;

  const server = http.createServer(async (req, res) => {
    const t0 = Date.now(), url = new URL(req.url ?? '/', 'http://x'), rid = String(req.headers['x-request-id'] ?? '').replace(/[^\w.-]/g, '').slice(0, 64) || randomUUID();
    let client = '-';
    const H: Record<string, string> = { 'x-request-id': rid };
    const origin = req.headers.origin;
    if (origin && cfg.corsOrigins?.includes(origin)) Object.assign(H, { 'access-control-allow-origin': origin, vary: 'origin', 'access-control-allow-headers': 'authorization,content-type,idempotency-key,x-request-id', 'access-control-allow-methods': 'POST,GET,OPTIONS', 'access-control-expose-headers': 'x-request-id,ratelimit-remaining,retry-after,idempotent-replay' });
    res.on('finish', () => { if (process.env.LOG !== 'off') console.log(JSON.stringify({ ts: new Date().toISOString(), requestId: rid, method: req.method, path: url.pathname, status: res.statusCode, ms: Date.now() - t0, client })); });
    const fail = (status: number, code: string, title: string, detail: string, extra: object = {}, h: Record<string, string> = {}) =>
      send(res, status, { type: `/problems/${code.toLowerCase()}`, title, status, code, detail, requestId: rid, ...extra }, { ...H, ...h }, 'application/problem+json');
    try {
      if (req.method === 'OPTIONS') { res.writeHead(204, H); return res.end(); }
      if (url.pathname === '/v1/health' && req.method === 'GET') return send(res, 200, { status: 'ok', engineVersion: ENGINE_VERSION }, H);
      if (url.pathname === '/v1/openapi.json' && req.method === 'GET') return send(res, 200, openapi, H);
      const isExtract = url.pathname === '/v1/comparables/extract';
      if (url.pathname !== '/v1/decisions' && !isExtract) return fail(404, 'NOT_FOUND', 'Not found', 'Unknown path.');
      if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed', 'Use POST.', {}, { allow: 'POST' });

      const token = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ''))?.[1];
      const c = token ? clients.get(sha(token)) : undefined;
      if (!c) return fail(401, 'UNAUTHORIZED', 'Unauthorized', 'A valid API key is required.', {}, { 'www-authenticate': 'Bearer' });
      client = c.name;
      const now = Date.now(); let w = windows.get(c.name);
      if (!w || w.reset <= now) { w = { n: 0, reset: now + 60_000 }; windows.set(c.name, w); }
      w.n++;
      const resetIn = String(Math.ceil((w.reset - now) / 1000));
      Object.assign(H, { 'ratelimit-limit': String(c.limit), 'ratelimit-remaining': String(Math.max(0, c.limit - w.n)), 'ratelimit-reset': resetIn });
      if (w.n > c.limit) return fail(429, 'RATE_LIMITED', 'Too many requests', `Limit is ${c.limit} requests per minute.`, {}, { 'retry-after': resetIn });

      if (!/^application\/json/i.test(String(req.headers['content-type'] ?? ''))) return fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported media type', 'Content-Type must be application/json.');
      if (Number(req.headers['content-length'] ?? 0) > MAX_BODY) return fail(413, 'BODY_TOO_LARGE', 'Body too large', 'Limit is 2 MB.', {}, { connection: 'close' });
      let raw: string;
      try { raw = await readBody(req); } catch { return fail(413, 'BODY_TOO_LARGE', 'Body too large', 'Limit is 2 MB.'); }
      let body: unknown;
      try { body = JSON.parse(raw); } catch { return fail(400, 'INVALID_JSON', 'Invalid JSON', 'The request body is not valid JSON.'); }
      if (isExtract) {
        const items = (body as any)?.items;
        if (!Array.isArray(items) || !items.length || items.length > 20 || items.some((i: any) => !i || typeof i.url !== 'string' || (i.html !== undefined && typeof i.html !== 'string')))
          return fail(422, 'VALIDATION_FAILED', 'Validation failed', 'items must be 1 to 20 objects with a url and an optional html.', { errors: [{ field: 'items', message: 'must be 1 to 20 objects with a url and an optional html' }] });
        const browser = items.some((i: any) => i.html === undefined);
        if (browser && renders >= (cfg.maxRenders ?? 2)) return fail(429, 'BUSY', 'Renderer busy', 'Retry shortly.', {}, { 'retry-after': '5' });
        if (browser) renders++;
        try { return send(res, 200, await extractComparables(items), H); } finally { if (browser) renders--; }
      }
      const parsed = parseRequest(body);
      if (parsed.errors) return fail(422, 'VALIDATION_FAILED', 'Validation failed', 'One or more fields are invalid.', { errors: parsed.errors });
      const v = parsed.value!;

      const idemKey = String(req.headers['idempotency-key'] ?? '').slice(0, 128), rk = `${c.name}:${idemKey}`, fp = sha(raw);
      if (idemKey) {
        const hit = replay.get(rk);
        if (hit && Date.now() - hit.at < DAY) return hit.fp === fp ? send(res, 200, hit.body, { ...H, 'idempotent-replay': 'true' }) : fail(422, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency key reused', 'This key was already used with a different request body.');
      }
      if (v.url) {
        if (!allowedUrl(v.url)) return fail(422, 'URL_NOT_ALLOWED', 'URL not allowed', 'The listing URL host is not supported.');
        if (!v.html && renders >= (cfg.maxRenders ?? 2)) return fail(429, 'BUSY', 'Renderer busy', 'Retry shortly.', {}, { 'retry-after': '5' });
      }
      let out: { d: Decision; rc?: RentCtx; nb: Nb; md: MarketMeta };
      const browser = !!v.url && !v.html; if (browser) renders++;
      try { out = await compute(v, cfg.amenities ?? osmProvider, cfg.market); }
      catch (e) {
        if (e instanceof TypeError || e instanceof RangeError || e instanceof ReferenceError) throw e;
        const msg = (e as Error).message;
        return fail(422, /asking price/i.test(msg) ? 'INSUFFICIENT_DATA' : 'ANALYSIS_FAILED', 'Could not produce a decision', msg);
      } finally { if (browser) renders--; }
      const payload = JSON.stringify(toPublic(out.d, `dec_${randomUUID().replace(/-/g, '').slice(0, 20)}`, out.rc, out.nb, out.md));
      if (idemKey) { replay.set(rk, { fp, body: payload, at: Date.now() }); if (replay.size > 5000) replay.delete(replay.keys().next().value!); }
      return send(res, 200, payload, H);
    } catch (e) {
      if (process.env.LOG !== 'off') console.error(JSON.stringify({ requestId: rid, error: (e as Error).stack }));
      if (!res.headersSent) fail(500, 'INTERNAL_ERROR', 'Internal error', `Unexpected error. Quote request id ${rid}.`);
    }
  });
  server.headersTimeout = 20_000; server.requestTimeout = 120_000; server.keepAliveTimeout = 5_000;
  return server;
}

if (/api\.(ts|js)$/.test(process.argv[1] ?? '')) {
  try { process.loadEnvFile(); } catch { /* .env optional */ }
  loadScoring();   // fail fast on a bad SCORING_CONFIG
  const app = createApp({ market: process.env.COMPS_PROVIDER_URL ? httpMarketProvider(process.env.COMPS_PROVIDER_URL, process.env.COMPS_PROVIDER_KEY) : undefined, keys: process.env.API_KEYS ?? '', rateLimitPerMin: Number(process.env.RATE_LIMIT_PER_MIN) || 60, corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean) });
  app.listen(Number(process.env.PORT ?? 8080), () => console.log(JSON.stringify({ msg: 'listening', port: process.env.PORT ?? 8080 })));
  process.on('SIGTERM', () => app.close(() => process.exit(0)));
}
