import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index.js';
import { AUTH_COOKIE, authToken } from '../src/auth.js';

const env = { CLOUDFLARE_ACCOUNT_PASSWORD: 'p@ss 你好' };

test('未配置密码时首页仍直接可开', async () => {
  const r = await app.request('/');
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.ok(html.includes('WLOC 虚拟定位'));
  assert.ok(!html.includes('action="/login"'));
});

test('配置密码后未登录只看到密码页', async () => {
  const r = await app.request('/', {}, env);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.ok(html.includes('输入密码'));
  assert.ok(html.includes('action="/login"'));
  assert.ok(!html.includes('储存到设备'));
});

test('错密码留在登录页', async () => {
  const r = await app.request('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'password=wrong',
  }, env);
  assert.equal(r.status, 200);
  assert.ok((await r.text()).includes('密码错误'));
});

test('对密码发 cookie 并进入首页', async () => {
  const r = await app.request('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'password=' + encodeURIComponent(env.CLOUDFLARE_ACCOUNT_PASSWORD),
  }, env);
  assert.equal(r.status, 302);
  const set = r.headers.get('set-cookie') || '';
  assert.ok(set.includes(AUTH_COOKIE + '='));
  assert.ok(set.includes('HttpOnly'));
  const token = await authToken(env.CLOUDFLARE_ACCOUNT_PASSWORD);
  const home = await app.request('/', { headers: { Cookie: AUTH_COOKIE + '=' + token } }, env);
  assert.equal(home.status, 200);
  assert.ok((await home.text()).includes('储存到设备'));
});

test('收藏接口未登录 401, 解析接口仍开放', async () => {
  const fav = await app.request('/api/favorites', {}, env);
  assert.equal(fav.status, 401);
  const parse = await app.request('/api/parse?u=31.230400,121.473700&format=json', {}, env);
  assert.equal(parse.status, 200);
});

test('短密码和任意字符都可以作为密码', async () => {
  const e = { CLOUDFLARE_ACCOUNT_PASSWORD: '1' };
  const r = await app.request('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'password=1',
  }, e);
  assert.equal(r.status, 302);
});
