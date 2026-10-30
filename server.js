// Serves Category Insights & Performance: a demo sign-in, the cockpit page and one JSON endpoint per dataset. All figures come from SQL views in Neon.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const compression = require('compression');
const { Pool, types } = require('pg');
types.setTypeParser(1082, (v) => v); // keep dates as YYYY-MM-DD

const datasets = JSON.parse(fs.readFileSync(path.join(__dirname, 'datasets.json'), 'utf8'));
const page = fs.readFileSync(path.join(__dirname, 'public', 'pulse.html'), 'utf8');
const signinPage = fs.readFileSync(path.join(__dirname, 'public', 'signin.html'), 'utf8');

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: local ? false : { rejectUnauthorized: false }, max: 4 });
const cache = new Map();
const TTL_MS = Number(process.env.CACHE_SECONDS || 300) * 1000;
const ACCESS_CODE = process.env.DEMO_ACCESS_CODE || '';
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('cp:' + (process.env.DATABASE_URL || 'local')).digest('hex');

// ---------- demo users: one admin, then each category manager and assistant from the category table ----------
let usersCache = null;
async function demoUsers() {
  if (usersCache && Date.now() - usersCache.at < TTL_MS) return usersCache.list;
  const list = [{ id: 'admin', name: 'Demo Admin', role: 'All categories', manager: null }];
  try {
    const { rows } = await pool.query('select manager, min(assistant) as assistant, string_agg(name, \', \' order by name) as cats from category group by manager order by manager');
    rows.forEach((r, i) => {
      list.push({ id: 'm' + i, name: r.manager, role: 'Category manager · ' + r.cats, manager: r.manager });
      list.push({ id: 'a' + i, name: r.assistant, role: 'Assistant to ' + r.manager, manager: r.manager });
    });
    usersCache = { at: Date.now(), list };
  } catch (err) {
    console.error('users', err.message);
  }
  return list;
}

// ---------- signed session cookie ----------
const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
function readSession(req) {
  const m = /(?:^|;\s*)cp_session=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const [body, sig] = m[1].split('.');
  if (!body || !sig || sig.length !== sign(body).length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(body)))) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
}
function writeSession(res, user) {
  const body = Buffer.from(JSON.stringify(user)).toString('base64url');
  res.setHeader('Set-Cookie', `cp_session=${body}.${sign(body)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 12}${process.env.RENDER ? '; Secure' : ''}`);
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const app = express();
app.disable('x-powered-by');
app.use(compression());
app.use('/brand', express.static(path.join(__dirname, 'public', 'brand'), { maxAge: '7d' }));
app.get('/healthz', (req, res) => res.send('ok'));

app.get('/signin', async (req, res) => {
  const users = await demoUsers();
  const error = { code: 'That access code is not right.', user: 'Choose a demo user.' }[req.query.error];
  const html = signinPage
    .replace('<!--ERROR-->', error ? `<p class="error" role="alert">${esc(error)}</p>` : '')
    .replace('<!--CODE-->', ACCESS_CODE ? '<label>Access code<input type="password" name="code" required autocomplete="current-password"></label>' : '')
    .replace('<!--USERS-->', users.map((u) => `<li><button type="submit" name="user" value="${esc(u.id)}" class="btn"><span>${esc(u.name)}</span><small>${esc(u.role.split(' · ')[0])}</small></button></li>`).join('\n        '));
  res.type('html').send(html);
});

app.post('/api/auth/demo', express.urlencoded({ extended: false }), async (req, res) => {
  if (ACCESS_CODE && req.body.code !== ACCESS_CODE) return res.redirect(303, '/signin?error=code');
  const user = (await demoUsers()).find((u) => u.id === req.body.user);
  if (!user) return res.redirect(303, '/signin?error=user');
  writeSession(res, { name: user.name, role: user.role, manager: user.manager });
  res.redirect(303, '/');
});

app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'cp_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.redirect(303, '/signin');
});

app.get('/', (req, res) => {
  const user = readSession(req);
  if (!user) return res.redirect(303, '/signin');
  res.type('html').send(page.replace('/*USER*/null', () => JSON.stringify(user).replace(/</g, '\\u003c')));
});

app.get('/api/data/:id', async (req, res) => {
  if (!readSession(req)) return res.status(401).json({ error: 'Sign in first' });
  const ds = datasets[req.params.id];
  if (!ds) return res.status(404).json({ error: 'Unknown dataset' });
  // a dataset may take named parameters (datasets.json "params": {name: regex}); each is passed in order as $1, $2…
  const names = Object.keys(ds.params || {});
  const values = names.map((n) => (typeof req.query[n] === 'string' && req.query[n] !== '' ? req.query[n] : null));
  if (values.some((v, i) => v !== null && !new RegExp(ds.params[names[i]]).test(v))) return res.status(400).json({ error: 'Bad parameter' });
  const key = req.params.id + JSON.stringify(values);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS && req.query.refresh !== '1') return res.json(hit.body);
  try {
    const result = await pool.query(ds.sql, values);
    const body = { title: ds.title, description: ds.description, columns: result.fields.map((f) => f.name), rows: result.rows, at: new Date().toISOString() };
    cache.set(key, { at: Date.now(), body });
    res.json(body);
  } catch (err) {
    console.error(req.params.id, err.message);
    res.status(500).json({ error: 'The database query failed' });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Category Insights & Performance listening on', process.env.PORT || 3000));
