# Category Performance Cockpit

Strategic and operational dashboard for category managers and their assistants: sales vs target and forecast, stock cover by item and hub, aging and expiry, customer pace, margin leakage and a ranked alert list. Runs on generated sample data only.

- `db/` – schema, sample-data generators and the reporting views (all KPIs are computed in SQL).
- `datasets.json` – the query behind each dataset the page reads.
- `public/index.html` – the dashboard page; `public/shell.html` – the standalone wrapper (theme tokens, d3, data loader).
- `server.js` – Express server: `/` serves the page, `/api/data/<id>` runs a dataset query (cached 5 minutes).

## Run

```
npm install
DATABASE_URL=postgresql://... npm start
```

## Deploy on Render

Web service, runtime Node, build `npm install`, start `npm start`, environment variable `DATABASE_URL` = the Neon connection string.
