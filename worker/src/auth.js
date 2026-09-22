// 进页密码。CLOUDFLARE_ACCOUNT_PASSWORD 是 Worker secret; 未配置则不设门。
// 密码本身不限长度、不限字符, 也不做 trim。对了发一个 HttpOnly cookie。

export const AUTH_COOKIE = "wloc_auth";

export async function authToken(password) {
  const data = new TextEncoder().encode("wloc|" + String(password));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function equal(a, b) {
  const x = String(a);
  const y = String(b);
  const n = Math.max(x.length, y.length);
  let d = x.length ^ y.length;
  for (let i = 0; i < n; i++) d |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return d === 0;
}

export function sitePassword(env) {
  const p = env && env.CLOUDFLARE_ACCOUNT_PASSWORD;
  return typeof p === "string" ? p : "";
}

export function gateEnabled(env) {
  return sitePassword(env).length > 0;
}

function readCookie(header, name) {
  if (!header) return "";
  for (const part of String(header).split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

export async function isAuthed(c, password) {
  const got = readCookie(c.req.header("Cookie"), AUTH_COOKIE);
  if (!got) return false;
  return equal(got, await authToken(password));
}

export function makeAuthCookie(token, c) {
  const secure = new URL(c.req.url).protocol === "https:" ? "; Secure" : "";
  return `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`;
}

export async function readPostedPassword(c) {
  const ct = (c.req.header("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    try {
      const body = await c.req.json();
      return body && body.password != null ? String(body.password) : "";
    } catch (e) {
      return "";
    }
  }
  const text = await c.req.text();
  return new URLSearchParams(text).get("password") ?? "";
}

export function getLoginHtml(bad) {
  const err = bad ? '<p class="err">密码错误</p>' : "";
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>WLOC</title>
<style>
:root { --blue:#007aff; --bg:#f2f2f7; --red:#ff3b30; }
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,system-ui,"SF Pro","Helvetica Neue",sans-serif; background:var(--bg); min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
form { background:#fff; border-radius:16px; padding:24px; width:100%; max-width:340px; box-shadow:0 1px 3px rgba(0,0,0,.08); }
h1 { font-size:17px; font-weight:600; text-align:center; margin-bottom:16px; }
input { width:100%; padding:12px; border:1px solid #d1d1d6; border-radius:10px; font-size:16px; outline:none; }
input:focus { border-color:var(--blue); }
button { width:100%; margin-top:12px; padding:12px; border:none; border-radius:10px; background:var(--blue); color:#fff; font-size:16px; font-weight:500; }
button:active { transform:scale(.97); }
.err { color:var(--red); font-size:13px; text-align:center; margin-bottom:10px; }
</style>
</head>
<body>
<form method="post" action="/login" autocomplete="on">
  <h1>输入密码</h1>
  ${err}
  <input name="password" type="password" autofocus autocomplete="current-password">
  <button type="submit">进入</button>
</form>
</body>
</html>`;
}
