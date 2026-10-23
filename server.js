// Serves the cockpit page and one JSON endpoint per dataset. All figures come from SQL views in Neon.
const path = require('path');
const fs = require('fs');
const express = require('express');
const { Pool, types } = require('pg');
types.setTypeParser(1082, (v) => v); // keep dates as YYYY-MM-DD

const datasets = JSON.parse(fs.readFileSync(path.join(__dirname, 'datasets.json'), 'utf8'));
const page = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const shell = fs.readFileSync(path.join(__dirname, 'public', 'shell.html'), 'utf8');
const html = shell.replace('<!--PAGE-->', () => page);

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
const cache = new Map();
const TTL_MS = Number(process.env.CACHE_SECONDS || 300) * 1000;

const app = express();
app.disable('x-powered-by');

app.get('/', (req, res) => res.type('html').send(html));
app.get('/healthz', (req, res) => res.send('ok'));

app.get('/api/data/:id', async (req, res) => {
  const ds = datasets[req.params.id];
  if (!ds) return res.status(404).json({ error: 'Unknown dataset' });
  const hit = cache.get(req.params.id);
  if (hit && Date.now() - hit.at < TTL_MS && req.query.refresh !== '1') return res.json(hit.body);
  try {
    const result = await pool.query(ds.sql);
    const body = { title: ds.title, description: ds.description, columns: result.fields.map((f) => f.name), rows: result.rows, at: new Date().toISOString() };
    cache.set(req.params.id, { at: Date.now(), body });
    res.json(body);
  } catch (err) {
    console.error(req.params.id, err.message);
    res.status(500).json({ error: 'The database query failed' });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Cockpit listening on', process.env.PORT || 3000));
