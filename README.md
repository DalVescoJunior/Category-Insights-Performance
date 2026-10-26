# Category Pulse

Strategic and operational dashboard for category managers and their assistants: sales vs target and forecast, stock cover by item and hub, aging and expiry, customer pace, margin leakage and a ranked alert list. Runs on generated sample data only.

- `db/` – schema, sample-data generators and the reporting views (all KPIs are computed in SQL). Each hub (`org`) has a 3-letter country code; the rolled-up views carry a `country` column (null = all countries) that the Country filter picks from. On an existing database run `db/migrations/2026-10-26_org_country.sql`, then `db/views.sql`.
- `datasets.json` – the query behind each dataset the page reads.
- `public/pulse.html` – the deployed page in the Executive Pulse style (sidebar, filter bar, KPI cards, navy tables). It is generated: edit `public/index.html` (content and charts) or the pieces in `build/` and `public/pulse-*.html`, then run `python3 build/make_pulse.py`.
- `public/index.html` + `public/shell.html` – the original page and wrapper, also used by the claude.ai dashboard version.
- `public/signin.html`, `public/brand/` – demo sign-in and the Aramtec logo.
- `server.js` – Express server: `/signin` demo users (admin, each category manager and assistant; managers and assistants see only their categories), `/` the page, `/api/data/<id>` a dataset query (cached 5 minutes).

## Run

```
npm install
DATABASE_URL=postgresql://... npm start
```

## Deploy on Render

Web service, runtime Node, build `npm install`, start `npm start`, environment variable `DATABASE_URL` = the Neon connection string. Optional: `DEMO_ACCESS_CODE` (asked on the sign-in page) and `SESSION_SECRET`.
