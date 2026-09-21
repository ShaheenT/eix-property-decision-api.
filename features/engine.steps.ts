import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estimate, type Est, type CompIn, type Subject } from '../src/comps.js';

interface E { subject: Subject; items: CompIn[]; est?: Est }
Given('the subject {string}', function (this: E, j: string) { this.subject = JSON.parse(j); });
Given('the comparables:', function (this: E, doc: string) { this.items = JSON.parse(doc); });
Given('the comparables loaded from the file {string}', function (this: E, f: string) {
  this.items = JSON.parse(readFileSync(f, 'utf8')).map((c: any) => ({ value: c.price, floorSqm: c.floorAreaM2, erfSqm: c.erfM2, beds: c.bedrooms, type: c.propertyType, date: c.soldDate, kind: c.priceType }));
});
When('I estimate as at {string}', function (this: E, d: string) { this.est = estimate(this.items, this.subject, Date.parse(d)); });
Then('the strength is {string}', function (this: E, s: string) { assert.equal(this.est!.strength, s, JSON.stringify(this.est)); });
Then('{int} comparables are used', function (this: E, n: number) { assert.equal(this.est!.used, n, JSON.stringify(this.est)); });
Then('{int} comparables are excluded as dissimilar', function (this: E, n: number) { assert.equal(this.est!.excluded, n, JSON.stringify(this.est)); });
Then('{int} outliers are dropped', function (this: E, n: number) { assert.equal((this.est as any).outliers, n, JSON.stringify(this.est)); });
Then('the value is between {int} and {int}', function (this: E, a: number, b: number) { const v = (this.est as any).value; assert.ok(v >= a && v <= b, String(v)); });
Then('the dispersion is above {float}', function (this: E, x: number) { assert.ok((this.est as any).dispersion > x, String((this.est as any).dispersion)); });
