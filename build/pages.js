  // ---------- pages: sidebar links ----------
  const PAGES = ['overview', 'summary', 'sales', 'brandtrack', 'dailytrack', 'margin', 'customers', 'stock', 'aging', 'alerts'];
  const TITLES = { overview: 'Category Overview', summary: 'Sales Summary', sales: 'Sales vs Target', brandtrack: 'Brand Monthly Tracking', dailytrack: 'Daily Tracking', margin: 'Margin Tracker', customers: 'Customers & Leakage', stock: 'Stock & Cover', aging: 'Aging & Expiry', alerts: 'Alerts' };
  function showPage(p) {
    if (!PAGES.includes(p)) p = 'overview';
    local.page = p;
    PAGES.forEach((id) => { $('#' + id).hidden = id !== p; });
    document.querySelectorAll('.nav-link[data-page]').forEach((a) => { if (a.dataset.page === p) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $('#cc-page-title').textContent = TITLES[p];
    document.title = TITLES[p] + ' · Category Insights & Performance';
    dash.setLink(p);
    redraw();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.nav-link[data-page]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); showPage(a.dataset.page); }));
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.goto)));

  // theme and print
  const setTheme = (t) => {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('cp-theme', t); } catch (e) {}
    document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === t)));
    dash.notify();
  };
  document.querySelectorAll('[data-theme-set]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeSet)));
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  $('#cc-print').addEventListener('click', () => window.print());
  $('#nav-user').textContent = USER.name; $('#nav-role').textContent = USER.role;

  function redraw() {
    drawScope(); drawHeader();
    const n = alertsInScope().filter((r) => r.severity_label === 'Critical').length;
    const nc = $('#nav-alerts'); nc.hidden = !n; nc.textContent = n; nc.title = n + ' critical alerts';
    const p = local.page;
    if (p === 'overview') { drawTiles(); drawScorecard(); drawTopAlerts(); }
    if (p === 'sales') { drawCum(); drawMonthly(); drawBrands(); drawSegments(); }
    if (p === 'stock') { drawStatusFilters(); drawSku(); }
    if (p === 'aging') { drawAgingChart('#ch-life', 'Shelf life left', ['0-30 days']); drawAgingChart('#ch-age', 'Days in stock', ['91-180 days', 'Over 180 days']); drawExpiry(); }
    if (p === 'customers') { drawCustomers(); drawLeak(); }
    if (p === 'alerts') drawAlerts();
    if (p === 'summary') drawSummary();
    if (p === 'brandtrack') drawBrandTrack();
    if (p === 'dailytrack') drawDailyTrack();
    if (p === 'margin') drawMargin();
  }

