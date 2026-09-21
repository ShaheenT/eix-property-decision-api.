import { BeforeAll, AfterAll, Before, After, Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import Ajv2020 from 'ajv/dist/2020.js';
import { createApp } from '../src/api.js';
import { openapi } from '../src/openapi.js';
import http from 'node:http';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { httpMarketProvider } from '../src/providers.js';
import { resetScoringCache } from '../src/scoring.js';
import { parseOverpass } from '../src/osm.js';

const P = (cat: string, d: number, n = 1) => Array.from({ length: n }, () => ({ cat, d }));
/** Fixed neighbourhood fixture; a latitude of exactly -33.94 simulates an OpenStreetMap outage. */
const FIXTURE = [...P('transit', 300, 2), ...P('transit', 900), ...P('grocery', 400, 2), ...P('pharmacy', 600), ...P('eatery', 500, 6), ...P('nightlife', 700, 2), ...P('park', 400, 2), ...P('school', 700), ...P('school', 1200, 2), ...P('health', 1200)] as any;

let server: ReturnType<typeof createApp>, server2: ReturnType<typeof createApp>, mock: http.Server, base = '', base2 = '';
let validate: ((d: unknown) => boolean) & { errors?: unknown };
BeforeAll(async () => {
  process.env.LOG = 'off';
  mock = http.createServer((req, res) => {
    let b = ''; req.on('data', c => (b += c)); req.on('end', () => {
      if (req.headers.authorization !== 'Bearer mk') { res.writeHead(401); return res.end(); }
      const q = JSON.parse(b);
      if (q.suburb === 'Broken') { res.writeHead(500); return res.end('boom'); }
      res.writeHead(200, { 'content-type': 'application/json' });
      if (q.suburb === 'Nowhere') return res.end(JSON.stringify({ sales: [], rentals: [] }));
      const sales = [[3000000, 130], [3150000, 135], [3300000, 140], [3250000, 138], [3100000, 132], [3400000, 145]].map(([price, floorAreaM2]) => ({ price, floorAreaM2, bedrooms: 3, propertyType: 'house', priceType: 'sold' }));
      const rentals = [[20000, 130], [22000, 140], [21000, 135], [24000, 150]].map(([monthlyRent, floorAreaM2]) => ({ monthlyRent, floorAreaM2, bedrooms: 3, propertyType: 'house' }));
      res.end(JSON.stringify({ sales, rentals, junk: [1] }));
    });
  });
  await new Promise<void>(r => mock.listen(0, r));
  const mockUrl = `http://127.0.0.1:${(mock.address() as AddressInfo).port}/market`;
  server = createApp({ keys: 'test:sk_test,limited:sk_limited:2', rateLimitPerMin: 1000, market: httpMarketProvider(mockUrl, 'mk'), amenities: async lat => { if (lat === -33.94) throw new Error('down'); return FIXTURE; } });
  await new Promise<void>(r => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  server2 = createApp({ keys: 'test:sk_test', rateLimitPerMin: 1000 });
  await new Promise<void>(r => server2.listen(0, r));
  base2 = `http://127.0.0.1:${(server2.address() as AddressInfo).port}`;
  const Ajv = (Ajv2020 as any).default ?? Ajv2020;
  validate = new Ajv({ strict: false, allErrors: true }).compile({ $ref: '#/components/schemas/DecisionV1', components: openapi.components });
});
AfterAll(async () => { await new Promise(r => server.close(r)); await new Promise(r => server2.close(r)); await new Promise(r => mock.close(r)); });

interface A { base?: string; headers: Record<string, string>; res?: Response; json?: any; prev?: any }
Before(function (this: A) { this.headers = {}; this.base = base; });
After(function () { delete process.env.SCORING_CONFIG; resetScoringCache(); });
Given('the header {string} is {string}', function (this: A, k: string, v: string) { this.headers[k] = v; });

async function call(w: A, method: string, path: string, key: string, body?: string) {
  w.prev = w.json;
  w.res = await fetch((w.base ?? base) + path, { method, body, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(key !== '-' ? { authorization: `Bearer ${key}` } : {}), ...w.headers } });
  const t = await w.res.text(); try { w.json = JSON.parse(t); } catch { w.json = t; }
}
When('I POST {string} with key {string}:', async function (this: A, p: string, k: string, doc: string) { await call(this, 'POST', p, k, doc); });
When('I POST {string} with key {string} {int} times:', async function (this: A, p: string, k: string, n: number, doc: string) { for (let i = 0; i < n; i++) await call(this, 'POST', p, k, doc); });
When('I GET {string} with key {string}', async function (this: A, p: string, k: string) { await call(this, 'GET', p, k); });

const at = (o: any, path: string) => path.split('.').reduce((v, k) => v?.[k], o);
Then('the status is {int}', function (this: A, s: number) { assert.equal(this.res!.status, s, JSON.stringify(this.json).slice(0, 300)); });
Then('the JSON at {string} is {string}', function (this: A, p: string, v: string) { assert.equal(String(at(this.json, p)), v); });
Then('the JSON at {string} is null', function (this: A, p: string) { assert.equal(at(this.json, p), null); });
Then('the JSON at {string} is not null', function (this: A, p: string) { assert.notEqual(at(this.json, p) ?? null, null); });
Then('the JSON at {string} equals the previous response', function (this: A, p: string) { assert.equal(at(this.json, p), at(this.prev, p)); });
Then('the response header {string} is {string}', function (this: A, h: string, v: string) { assert.equal(this.res!.headers.get(h), v); });
Then('the response header {string} is present', function (this: A, h: string) { assert.ok(this.res!.headers.get(h)); });
Then('the response matches the OpenAPI schema', function (this: A) { assert.ok(validate(this.json), JSON.stringify(validate.errors)); });

Then('the JSON at {string} contains {string}', function (this: A, p: string, v: string) { assert.ok(String(at(this.json, p)).includes(v), String(at(this.json, p))); });
Then('the JSON list at {string} includes {string}', function (this: A, p: string, v: string) { assert.ok((at(this.json, p) as string[]).some(x => x.includes(v)), JSON.stringify(at(this.json, p))); });
Then('the risk codes include {string}', function (this: A, c: string) { assert.ok(this.json.risks.some((r: any) => r.code === c)); });

let pois: { cat: string; d: number }[] = [];
When('I parse this Overpass response around {float}, {float}:', function (lat: number, lng: number, doc: string) { pois = parseOverpass(JSON.parse(doc), lat, lng); });
Then('the categories are {string}', function (c: string) { assert.equal(pois.map(p => p.cat).join(','), c); });
Then('the first distance is between {int} and {int} metres', function (a: number, b: number) { assert.ok(pois[0].d >= a && pois[0].d <= b, String(pois[0].d)); });

const doc = (w: A, id: string) => (w.json.documents.items as any[]).find(i => i.id === id);
Then('the document pack includes {string} as {string}', function (this: A, id: string, pr: string) { const i = doc(this, id); assert.ok(i, `missing ${id}`); assert.equal(i.priority, pr); });
Then('the document pack does not include {string}', function (this: A, id: string) { assert.equal(doc(this, id), undefined); });
Then('the document {string} costs {string}', function (this: A, id: string, c: string) { assert.equal(doc(this, id).cost.type, c); });
Then('the document {string} has URL containing {string}', function (this: A, id: string, u: string) { assert.ok(String(doc(this, id).url).includes(u)); });
Then('the document {string} has no URL', function (this: A, id: string) { assert.equal(doc(this, id).url, null); });
Then('the document {string} resolves {string}', function (this: A, id: string, c: string) { assert.ok(doc(this, id).resolvesRisks.includes(c)); });
Then('the last document is {string}', function (this: A, id: string) { const l = this.json.documents.items; assert.equal(l[l.length - 1].id, id); });

Given('the API has no market data provider configured', function (this: A) { this.base = base2; });
Given('the scoring config {string}', function (this: A, json: string) {
  const f = join(mkdtempSync(join(tmpdir(), 'eix-')), 'scoring.json'); writeFileSync(f, json);
  process.env.SCORING_CONFIG = f; resetScoringCache();
});
When('I extract comparables from the saved listings {string} with key {string}', async function (this: A, files: string, key: string) {
  const items = files.split(',').map(f => f.trim()).map((f, i) => ({ url: `https://property.mg.co.za/fixture-${f.replace(/\W+/g, '-')}-${i}`, html: readFileSync(`features/fixtures/${f}`, 'utf8') }));
  await call(this, 'POST', '/v1/comparables/extract', key, JSON.stringify({ items }));
});
Then('the JSON list at {string} has {int} items', function (this: A, p: string, n: number) { assert.equal((at(this.json, p) as unknown[]).length, n); });
Then('the JSON list at {string} has a notice containing {string}', function (this: A, p: string, t: string) { assert.ok((at(this.json, p) as string[]).some(x => x.includes(t)), JSON.stringify(at(this.json, p))); });
Then('the JSON list at {string} has no notice containing {string}', function (this: A, p: string, t: string) { assert.ok(!(at(this.json, p) as string[]).some(x => x.includes(t))); });

When('I analyse the saved live listing {string} with key {string}', async function (this: A, f: string, key: string) {
  await call(this, 'POST', '/v1/decisions', key, JSON.stringify({ url: 'https://www.property24.com/for-sale/woodstock/cape-town/western-cape/10164/117106348', html: readFileSync(`features/fixtures/${f}`, 'utf8') }));
});
Then('the risk codes exclude {string}', function (this: A, c: string) { assert.ok(!this.json.risks.some((r: any) => r.code === c)); });
Then('the listing signal codes are {string}', function (this: A, list: string) { assert.equal(this.json.listing.signals.map((s: any) => s.code).join(','), list); });
