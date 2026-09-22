import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index.js';
import { isFavId, normalizeFavs, MAX_FAVORITES } from '../src/favorites.js';

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

const ID = '0123456789abcdef';
const env = () => ({ FAVORITES: memoryKv() });

test('同步码格式', () => {
  assert.equal(isFavId(ID), true);
  assert.equal(isFavId(ID.toUpperCase()), true);
  assert.equal(isFavId('short'), false);
  assert.equal(isFavId('0123456789abcdef0'), false);
  assert.equal(isFavId(''), false);
});

test('未绑定 KV 时收藏接口返回 501', async () => {
  const r = await app.request('/api/favorites?id=' + ID);
  assert.equal(r.status, 501);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
});

test('无效同步码返回 422', async () => {
  const r = await app.request('/api/favorites?id=nope', {}, env());
  assert.equal(r.status, 422);
});

test('收藏读写走 KV 且带 CORS / no-store', async () => {
  const e = env();
  const empty = await app.request('/api/favorites?id=' + ID, {}, e);
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { id: ID, favs: [] });

  const item = { name: '公司', lat: 22.544577, lon: 113.94114, time: '2026-09-22T00:00:00.000Z' };
  const saved = await app.request('/api/favorites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: ID, favs: [item] }),
  }, e);
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get('cache-control'), 'no-store');
  assert.equal(saved.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await saved.json(), { id: ID, favs: [item] });

  const got = await app.request('/api/favorites?id=' + ID, {}, e);
  assert.deepEqual(await got.json(), { id: ID, favs: [item] });
});

test('空列表删除 KV 键', async () => {
  const map = new Map();
  const e = { FAVORITES: memoryKv(map) };
  await app.request('/api/favorites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: ID, favs: [{ name: '家', lat: 22.5, lon: 114.0 }] }),
  }, e);
  assert.equal(map.size, 1);
  const cleared = await app.request('/api/favorites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: ID, favs: [] }),
  }, e);
  assert.equal(cleared.status, 200);
  assert.equal(map.size, 0);
});

test('越界坐标和超长列表拒绝写入', () => {
  assert.throws(() => normalizeFavs([{ name: 'x', lat: 91, lon: 0 }]));
  assert.throws(() => normalizeFavs([{ name: '', lat: 22, lon: 113 }]));
  const tooMany = Array.from({ length: MAX_FAVORITES + 1 }, (_, i) => ({
    name: 'p' + i,
    lat: 22.5,
    lon: 113.9,
  }));
  assert.throws(() => normalizeFavs(tooMany));
});

test('POST 越界坐标返回 422', async () => {
  const r = await app.request('/api/favorites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: ID, favs: [{ name: '坏点', lat: 91, lon: 0 }] }),
  }, env());
  assert.equal(r.status, 422);
});
