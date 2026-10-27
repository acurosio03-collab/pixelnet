import test from 'node:test';
import assert from 'node:assert/strict';
import { checkTargetUrl, ValidationError } from '../src/lib/security/url.ts';
import { cleanText, findBlockedTerm, isValidEmail } from '../src/lib/security/sanitize.ts';
import { sniffImage } from '../src/lib/security/image.ts';

const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return e instanceof ValidationError ? e.code : 'OTHER'; }
  return 'OK';
};

test('target URL: only public https links pass', () => {
  assert.equal(code(() => checkTargetUrl('https://example.com/page')), 'OK');
  assert.equal(code(() => checkTargetUrl('http://example.com')), 'URL_NOT_HTTPS');
  assert.equal(code(() => checkTargetUrl('javascript:alert(1)')), 'URL_NOT_HTTPS');
  assert.equal(code(() => checkTargetUrl('https://user:pw@example.com')), 'URL_CREDENTIALS');
  assert.equal(code(() => checkTargetUrl('https://127.0.0.1/')), 'URL_HOST');
  assert.equal(code(() => checkTargetUrl('https://localhost/')), 'URL_HOST');
  assert.equal(code(() => checkTargetUrl('https://192.168.0.1/')), 'URL_HOST');
  assert.equal(code(() => checkTargetUrl('https://bit.ly/abc')), 'URL_SHORTENER');
  assert.equal(code(() => checkTargetUrl('https://example.com:8443/')), 'URL_PORT');
  assert.equal(code(() => checkTargetUrl('https://xn--pple-43d.com/')), 'URL_IDN');
  assert.equal(code(() => checkTargetUrl('https://bad.example.com/', ['example.com'])), 'URL_BLOCKED');
  assert.equal(code(() => checkTargetUrl('not a url')), 'URL_INVALID');
});

test('target URL: fragment is stripped', () => {
  assert.equal(checkTargetUrl('https://example.com/a#x').toString(), 'https://example.com/a');
});

test('text sanitising removes markup and invisible characters', () => {
  assert.equal(cleanText('<script>alert(1)</script> Hi​  there', 100), 'alert(1) Hi there');
  assert.equal(cleanText('x'.repeat(500), 10).length, 10);
});

test('blocked terms are matched as whole words only', () => {
  assert.equal(findBlockedTerm('Slot Gacor hari ini'), 'slot gacor');
  assert.equal(findBlockedTerm('Toko Kue Manis'), null);
  assert.equal(findBlockedTerm('Cirebon Printing'), null);
});

test('email validation', () => {
  assert.equal(isValidEmail('a@b.co'), true);
  assert.equal(isValidEmail('a@b'), false);
  assert.equal(isValidEmail('a b@c.com'), false);
});

test('image type comes from magic bytes, not the file name', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');
  assert.equal(sniffImage(png)?.mime, 'image/png');
  assert.equal(sniffImage(jpg)?.mime, 'image/jpeg');
  assert.equal(sniffImage(webp)?.mime, 'image/webp');
  assert.equal(sniffImage(svg), null);
  assert.equal(sniffImage(html), null);
});
