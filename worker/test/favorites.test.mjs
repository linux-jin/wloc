import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index.js';
import { normalizeFavs } from '../src/favorites.js';

function memoryKv(map = new Map()) {
  return {
    async get(k) {
      return map.has(k) ? map.get(k) : null;
    },
    async put(k, v) {
      map.set(k, v);
    },
    async delete(k) {
      map.delete(k);
    },
  };
}

const env = () => ({ FAVORITES: memoryKv() });

test('未绑定 KV 时收藏接口返回 501', async () => {
  const r = await app.request('/api/favorites');
  assert.equal(r.status, 501);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
});

test('收藏读写走 KV 且带 CORS / no-store', async () => {
  const e = env();
  const empty = await app.request('/api/favorites', {}, e);
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { favs: [] });

  const item = { name: '公司', lat: 22.544577, lon: 113.94114, time: '2026-09-22T00:00:00.000Z' };
  const saved = await app.request('/api/favorites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ favs: [item] }),
  }, e);
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get('cache-control'), 'no-store');
  assert.equal(saved.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await saved.json(), { favs: [item] });

  const got = await app.request('/api/favorites', {}, e);
  assert.deepEqual(await got.json(), { favs: [item] });
});

test('空列表删除 KV 键', async () => {
  const map = new Map();
  const e = { FAVORITES: memoryKv(map) };
  await app.request('/api/favorites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ favs: [{ name: '家', lat: 22.5, lon: 114.0 }] }),
  }, e);
  assert.equal(map.size, 1);
  const cleared = await app.request('/api/favorites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ favs: [] }),
  }, e);
  assert.equal(cleared.status, 200);
  assert.equal(map.size, 0);
});

test('空名称记为未命名, 越界坐标拒绝写入', () => {
  assert.deepEqual(normalizeFavs([{ name: '  ', lat: 22.5, lon: 113.9 }]), [
    { name: '未命名', lat: 22.5, lon: 113.9, time: '' },
  ]);
  assert.throws(() => normalizeFavs([{ name: 'x', lat: 91, lon: 0 }]));
});

test('POST 越界坐标返回 422', async () => {
  const r = await app.request('/api/favorites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ favs: [{ name: '坏点', lat: 91, lon: 0 }] }),
  }, env());
  assert.equal(r.status, 422);
});
