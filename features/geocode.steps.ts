import { BeforeAll, AfterAll, Before, Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { nominatimGeocoder, type Geocoder, type GeoOutcome } from '../src/geocode.js';

interface Call { q: string; ua: string; params: URLSearchParams; at: number }
let server: http.Server, url = '', calls: Call[] = [], mode = 'exact';
const row = (over: any = {}, a: any = {}) => ({ lat: '-33.93', lon: '18.45', display_name: 'Somewhere, Woodstock, Cape Town, Western Cape, South Africa', address: { suburb: 'Woodstock', city: 'Cape Town', state: 'Western Cape', ...a }, ...over });
BeforeAll(async () => {
  server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x'), q = u.searchParams.get('q') ?? '';
    calls.push({ q, ua: String(req.headers['user-agent']), params: u.searchParams, at: Date.now() });
    const out = (v: unknown, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };
    const numbered = /^\d/.test(q), suburbOnly = q.startsWith('Woodstock');
    if (mode === 'down') return out({ error: 'x' }, 500);
    if (mode === 'wrong-place') return out([row({ display_name: 'Chamberlain Street, Observatory, Johannesburg, Gauteng, South Africa' }, { suburb: 'Observatory', city: 'Johannesburg', state: 'Gauteng', road: 'Chamberlain Street' })]);
    if (mode === 'outside-sa') return out([row({ lat: '51.5', lon: '-0.12' }, { road: 'Chamberlain Street', house_number: '101' })]);
    if (mode === 'exact') return out(numbered ? [row({ display_name: '101, Chamberlain Street, Woodstock, Cape Town, South Africa' }, { house_number: '101', road: 'Chamberlain Street' })] : []);
    if (mode === 'street-only') return out(!numbered && !suburbOnly ? [row({ display_name: 'Chamberlain Street, Woodstock, Cape Town, South Africa' }, { road: 'Chamberlain Street' })] : []);
    if (mode === 'suburb-only') return out(suburbOnly ? [row({ display_name: 'Woodstock, Cape Town, Western Cape, South Africa' })] : []);
    return out([]);
  });
  await new Promise<void>(r => server.listen(0, r)); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/search`;
});
AfterAll(async () => { await new Promise(r => server.close(r)); });

interface G { geo?: Geocoder; out?: GeoOutcome }
Before(function () { calls = []; mode = 'exact'; });
Given('the geocoding service answers in {string} mode', function (m: string) { mode = m; });
Given('a geocoder with a {int} ms minimum interval', function (this: G, ms: number) { this.geo = nominatimGeocoder({ baseUrl: url, userAgent: 'eix-test/1.0 (test@example.com)', minIntervalMs: ms }); });
When('I geocode {string} in {string}, {string}', async function (this: G, address: string, suburb: string, city: string) { this.out = await this.geo!({ address: address || undefined, suburb, city }); });
When('I geocode with nothing to search for', async function (this: G) { this.out = await this.geo!({}); });
Then('the geocoding status is {string} with precision {string} after {int} request(s)', function (this: G, s: string, p: string, n: number) { assert.equal(this.out!.status, s); assert.equal(this.out!.result?.precision ?? 'none', p); assert.equal(calls.length, n); });
Then('the geocoding status is {string} after {int} request(s)', function (this: G, s: string, n: number) { assert.equal(this.out!.status, s); assert.equal(calls.length, n); assert.equal(this.out!.result, undefined); });
Then('the service saw a user agent of {string} and asked for {string} in country {string}', function (ua: string, fmt: string, cc: string) { const c = calls[0]; assert.equal(c.ua, ua); assert.equal(c.params.get('format'), fmt); assert.equal(c.params.get('countrycodes'), cc); assert.equal(c.params.get('addressdetails'), '1'); });
Then('the service was called {int} times', function (n: number) { assert.equal(calls.length, n); });
Then('the two requests were at least {int} ms apart', function (ms: number) { assert.ok(calls[1].at - calls[0].at >= ms, String(calls[1].at - calls[0].at)); });
