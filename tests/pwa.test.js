// Guards the things that break offline mode silently: a file missing from the
// service worker's cache list, or a version/name changed in one place but not another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { APP } from '../src/config.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const sw = read('sw.js');
const shell = JSON.parse(sw.match(/const APP_SHELL = (\[[\s\S]*?\]);/)[1]);
const swVersion = sw.match(/const VERSION = '([^']+)'/)[1];
const manifest = JSON.parse(read('manifest.webmanifest'));
const html = read('index.html');

test('sw.js VERSION matches APP.version in src/config.js', () => {
  assert.equal(swVersion, APP.version);
});

test('every app file is in the service worker cache list', () => {
  const required = [
    'index.html', 'styles.css', 'manifest.webmanifest',
    ...readdirSync(new URL('src/', root)).filter((f) => f.endsWith('.js')).map((f) => `src/${f}`),
    ...readdirSync(new URL('icons/', root)).filter((f) => f.endsWith('.png')).map((f) => `icons/${f}`),
  ];
  for (const file of required) assert.ok(shell.includes(file), `${file} is missing from APP_SHELL in sw.js`);
});

test('every cached path exists on disk', () => {
  for (const path of shell) {
    if (path === './') continue;
    assert.ok(existsSync(new URL(path, root)), `APP_SHELL lists ${path}, which doesn't exist`);
  }
});

test('manifest makes it a standalone app with icons that exist', () => {
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  for (const icon of manifest.icons) assert.ok(existsSync(new URL(icon.src, root)), icon.src);
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512'));
});

test('app name is the same in config.js, the manifest and index.html', () => {
  assert.equal(manifest.name, APP.name, 'manifest.webmanifest "name"');
  assert.equal(manifest.short_name, APP.name, 'manifest.webmanifest "short_name"');
  assert.match(html, new RegExp(`<title>${APP.name}</title>`), 'index.html <title>');
  assert.match(html, new RegExp(`apple-mobile-web-app-title" content="${APP.name}"`), 'index.html apple-mobile-web-app-title');
});

test('index.html links the manifest and the apple-touch-icon', () => {
  assert.match(html, /<link rel="manifest" href="manifest.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/icon-180.png">/);
  assert.match(html, /viewport-fit=cover/);
});
