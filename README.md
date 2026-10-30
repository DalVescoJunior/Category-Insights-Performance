# Category Insights & Performance

*Measure results. Find opportunities. Improve performance.*

Dashboard for category managers and their assistants, in the Executive Pulse look (navy sidebar, light and dark mode). Runs on generated sample data only.

Pages:
- **Category Overview**: KPIs, category scorecard and the alerts to act on first.
- **Sales Summary**: sales, last year, change, cost, profit, margin, % contribution and growth contribution by sales organisation and division and by brand, for month to date, year to date or any month. The change against last year (like-for-like days) is split into volume, price, new lines and lost lines, with the brands that drove it.
- **Sales vs Target**: cumulative month, year by month, brands and customer segments.
- **Brand Monthly Tracking**: brands month by month this year (sales, quantity, profit or margin), shaded by change against the same month last year; opens by division and item; filters for sales organisation and division.
- **Daily Tracking**: this month day by day by salesperson, customer group, brand, item, customer, division or sales organisation (two levels), with the previous month and the same days last year.
- **Margin Tracker**: margin by item, brand, customer or salesperson for any month, against the category margin floor and last year, with a margin map and drill-down.
- **Customers & Leakage**, **Stock & Cover**, **Aging & Expiry**, **Alerts**.

- `db/` – schema, sample-data generators and the reporting views (all KPIs are computed in SQL). Each brand has a country of origin (`country` table: 3-letter code and name); the rolled-up views carry a `country` column (null = all countries) that the Country filter picks from. On an existing database run `db/migrations/2026-10-26_country.sql`, then `db/views.sql`.
- `datasets.json` – the query behind each dataset the page reads.
- `public/pulse.html` – the deployed page in the Executive Pulse style (sidebar, filter bar, KPI cards, navy tables). It is generated: edit `public/index.html` (content and charts) or the pieces in `build/` (`perf.html` and `perf.js` hold the Sales Summary, Brand Monthly Tracking, Daily Tracking and Margin Tracker pages) and `public/pulse-*.html`, then run `python3 build/make_pulse.py`.
- `public/index.html` + `public/shell.html` – the original page and wrapper, also used by the claude.ai dashboard version.
- `public/signin.html`, `public/brand/` – demo sign-in and the Aramtec logo.
- `server.js` – Express server: `/signin` demo users (admin, each category manager and assistant; managers and assistants see only their categories), `/` the page, `/api/data/<id>` a dataset query (cached 5 minutes; a dataset may declare `params`, passed as `$1`, `$2`…, e.g. `/api/data/margin_detail?month=2026-09`).

## Run

```
npm install
DATABASE_URL=postgresql://... npm start
```

After pulling a version with new views, re-run `db/views.sql` on the database.

## Deploy on Render

Web service, runtime Node, build `npm install`, start `npm start`, environment variable `DATABASE_URL` = the Neon connection string. Optional: `DEMO_ACCESS_CODE` (asked on the sign-in page) and `SESSION_SECRET`.
