  // ---------- performance pages: sales summary, brand by month, daily tracking, margin tracker ----------
  // The server sends lean rows keyed by codes. They are joined here to the item, customer, organisation and
  // salesperson lookups, kept to the view chosen in the filter bar (manager, category, brand, country), then grouped
  // whichever way a table needs, so one dataset serves every breakdown.
  const memo = new Map();
  const memoBy = (key, deps, fn) => {
    const m = memo.get(key);
    if (m && m.deps.length === deps.length && m.deps.every((d, i) => d === deps[i])) return m.val;
    const val = fn(); memo.set(key, { deps, val }); return val;
  };
  const lookup = (id, keyField) => memoBy('lk:' + id, [rowsOf(id)], () => new Map(rowsOf(id).map((r) => [String(r[keyField]), r])));
  const ITEMS = () => lookup('items', 'item');
  const CUSTS = () => lookup('custs', 'cu');
  const ORGS = () => lookup('orgs', 'org');
  const REPS = () => lookup('reps', 'sp');
  const orgName = (c) => (ORGS().get(String(c)) || {}).name || c;
  const repName = (c) => (c === null || c === undefined ? 'No salesperson' : (REPS().get(String(c)) || {}).name || 'Salesperson ' + c);
  const custOf = (c) => CUSTS().get(String(c)) || {};
  const filterKey = () => { const p = params(); return [scopeInfo().scope, p.brand, p.country].join('|'); };
  function itemFilter() {
    const s = scopeInfo(); const brand = params().brand; const country = params().country;
    return (it) => !!it && (s.level === 'total' || (s.level === 'manager' ? it.manager === s.scope : it.category === s.scope))
      && (!brand || it.brand === brand) && (!country || it.country === country);
  }
  // rows of a dataset joined to their item and kept to the current view
  function viewRows(id, itemField) {
    return memoBy('vr:' + id, [rowsOf(id), rowsOf('items'), filterKey()], () => {
      const items = ITEMS(); const keep = itemFilter(); const out = [];
      rowsOf(id).forEach((r) => { const it = items.get(String(r[itemField])); if (keep(it)) out.push(Object.assign({ _it: it }, r)); });
      return out;
    });
  }
  // a page shows a skeleton until its datasets arrive and a failure note if one did not
  function pfWait(boxes, ids) {
    const bad = ids.some((id) => failed(id));
    const ready = ids.every((id) => dash.data(id).status === 'ok');
    if (ready) return true;
    boxes.forEach((b) => {
      const msg = el('div', bad ? 'cc-fail' : 'pf-loading', bad ? 'The figures did not load.' : 'Loading…');
      if (b.tagName === 'TABLE') { const tb = el('tbody'); const tr = el('tr'); const td = el('td'); td.append(msg); tr.append(td); tb.append(tr); b.replaceChildren(tb); }
      else { b.querySelectorAll('svg').forEach((n) => n.remove()); b.replaceChildren(msg); }
    });
    return false;
  }
  const clearBox = (box) => { box.querySelectorAll('svg, .pf-loading, .cc-fail, .pf-empty').forEach((n) => n.remove()); };

  // dates of the data: as-of day, current month, days in it
  function asOfInfo() {
    const r = rowsOf('kpi')[0]; if (!r) return null;
    const asOf = new Date(String(r.as_of).slice(0, 10) + 'T00:00:00Z');
    return { asOf, day: N(r.days_elapsed), dim: N(r.days_in_month), cur: d3.utcFormat('%Y-%m')(asOf), year: asOf.getUTCFullYear() };
  }
  const monDate = (m) => new Date(m + '-01T00:00:00Z');
  const monShort = (m) => d3.utcFormat('%b')(monDate(m));
  const monLong = (m) => d3.utcFormat('%b %Y')(monDate(m));
  const lyMon = (m) => (Number(m.slice(0, 4)) - 1) + m.slice(4);
  const yearMonths = (a) => d3.range(1, a.asOf.getUTCMonth() + 2).map((i) => a.year + '-' + String(i).padStart(2, '0'));

  // ---------- formats ----------
  const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
  const fmtSignedInt = (v) => (N(v) === null ? '—' : sgn(N(v)) + d3.format(',')(Math.abs(Math.round(N(v)))));
  const fmtPP = (v) => (N(v) === null ? '—' : sgn(Math.round(N(v) * 1000)) + Math.abs(N(v) * 100).toFixed(1) + ' pp');
  const toneSpan = (v, text, flat = 0) => {
    const x = N(v);
    const s = el('span', x === null || Math.abs(x) <= flat ? 'cc-muted' : x > 0 ? 'pf-up' : 'pf-down', text);
    return s;
  };
  const arrowPct = (v) => toneSpan(v, N(v) === null ? '—' : (N(v) > 0 ? '▲ ' : N(v) < 0 ? '▼ ' : '') + fmtDelta(v));
  const heatPct = (p) => { const x = N(p); if (x === null || !isFinite(x)) return null; const a = Math.abs(x); return Math.sign(x) * (a < 0.03 ? 0 : a < 0.1 ? 1 : a < 0.25 ? 2 : 3); };
  const heatPP = (p) => { const x = N(p); if (x === null) return null; const a = Math.abs(x); return Math.sign(x) * (a < 0.005 ? 0 : a < 0.02 ? 1 : a < 0.04 ? 2 : 3); };

  // ---------- measures ----------
  const PF_SUM = ['sales', 'cost', 'qty', 'ly_sales', 'ly_cost', 'ly_qty', 'vol', 'price', 'new', 'lost'];
  function pfSum(rows) {
    const v = {}; PF_SUM.forEach((f) => (v[f] = 0));
    rows.forEach((r) => { for (const f of PF_SUM) v[f] += N(r[f]) || 0; });
    return v;
  }
  function pfFinish(v, tot) {
    v.profit = v.sales - v.cost; v.ly_profit = v.ly_sales - v.ly_cost;
    v.gm = v.sales > 0 ? v.profit / v.sales : null; v.ly_gm = v.ly_sales > 0 ? v.ly_profit / v.ly_sales : null;
    v.gm_pp = v.gm !== null && v.ly_gm !== null ? v.gm - v.ly_gm : null;
    v.delta = v.sales - v.ly_sales; v.delta_pct = v.ly_sales > 0 ? v.sales / v.ly_sales - 1 : null;
    if (tot) { v.share = tot.sales ? v.sales / tot.sales : null; v.gcontr = tot.ly_sales ? v.delta / tot.ly_sales : null; }
    return v;
  }
  const groupBy = (rows, fn) => { const m = new Map(); rows.forEach((r) => { const k = fn(r); let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(r); }); return m; };

  // ---------- grouped tables: a row opens in place to show the next level; a total row closes the table ----------
  local.tree = {};
  function drawTree(table, cols, roots, opts = {}) {
    const key = table.id;
    const open = local.tree[key] || (local.tree[key] = new Set());
    const sort = local.sorts[key] || opts.sort || null;
    const ordered = (list) => {
      if (!sort) return list;
      const col = cols.find((c) => c.field === sort.field);
      const get = col && col.sort ? col.sort : (n) => (sort.field === 'label' ? n.label : n.v[sort.field]);
      return list.slice().sort((a, b) => {
        let x = get(a), y = get(b);
        if (col && col.num) { x = N(x); y = N(y); if (x === null && y === null) return 0; if (x === null) return 1; if (y === null) return -1; return sort.dir * (x - y); }
        return sort.dir * String(x ?? '').localeCompare(String(y ?? ''));
      });
    };
    const thead = el('thead'); const hr = el('tr');
    cols.forEach((c) => {
      const th = el('th', c.thCls || ''); if (c.num) th.classList.add('cc-num');
      if (sort && sort.field === c.field) th.setAttribute('aria-sort', sort.dir > 0 ? 'ascending' : 'descending');
      const b = el('button', '', c.label); b.type = 'button'; if (c.title) b.title = c.title;
      if (c.sub) b.append(el('small', '', c.sub));
      b.addEventListener('click', () => {
        const cur = local.sorts[key] || opts.sort || {};
        local.sorts[key] = { field: c.field, dir: cur.field === c.field ? -cur.dir : (c.num ? -1 : 1) };
        redraw();
      });
      th.append(b); hr.append(th);
    });
    thead.append(hr);
    const cell = (tr, c, n) => {
      const td = el('td', c.cls || ''); if (c.num) td.classList.add('cc-num');
      const v = c.fmt ? c.fmt(n.v[c.field], n) : (n.v[c.field] ?? '—');
      if (v instanceof Node) td.append(v); else td.textContent = v;
      if (c.heat) { const h = c.heat(n); if (h !== null && h !== undefined) td.dataset.h = h; }
      if (c.tip) { const t = c.tip(n); if (t) td.title = t; }
      tr.append(td);
    };
    const kidsOf = (n) => (typeof n.kids === 'function' ? (n._k || (n._k = n.kids())) : n.kids || []);
    const tbody = el('tbody');
    const add = (n, depth, path) => {
      const id = path + '/' + n.id;
      const tr = el('tr', 'pf-l' + Math.min(depth, 3));
      const td = el('td', 'pf-label'); td.style.paddingLeft = (8 + depth * 20) + 'px';
      if (n.kids) {
        const isOpen = open.has(id);
        const b = el('button', 'cc-exp', '▸'); b.type = 'button';
        b.setAttribute('aria-expanded', String(isOpen)); b.setAttribute('aria-label', (isOpen ? 'Hide' : 'Show') + ' detail for ' + n.label);
        b.addEventListener('click', (e) => { e.stopPropagation(); if (open.has(id)) open.delete(id); else open.add(id); redraw(); });
        td.append(b);
      } else td.append(el('span', 'pf-exp-gap'));
      td.append(el('span', depth ? 'pf-kid' : 'pf-name', n.label));
      if (n.sub) td.append(el('span', 'pf-sub', n.sub));
      tr.append(td);
      cols.slice(1).forEach((c) => cell(tr, c, n));
      tbody.append(tr);
      if (n.kids && open.has(id)) ordered(kidsOf(n)).forEach((k) => add(k, depth + 1, id));
    };
    if (!roots.length) { const tr = el('tr'); const td = el('td', 'cc-empty', opts.empty || 'Nothing to show for this view.'); td.colSpan = cols.length; tr.append(td); tbody.append(tr); }
    ordered(roots).forEach((n) => add(n, 0, ''));
    const parts = [thead, tbody];
    if (opts.total && roots.length) {
      const tf = el('tfoot'); const tr = el('tr', 'pf-total');
      const td = el('td', 'pf-label'); td.append(el('span', 'pf-exp-gap'), el('span', 'pf-name', opts.total.label || 'Total')); tr.append(td);
      cols.slice(1).forEach((c) => cell(tr, c, opts.total));
      tf.append(tr); parts.push(tf);
    }
    table.replaceChildren(...parts);
    table._roots = roots;
    if (opts.toggle) {
      const t = opts.toggle; const ids = roots.filter((n) => n.kids).map((n) => '/' + n.id);
      t.hidden = !ids.length; t.textContent = ids.length && ids.every((i) => open.has(i)) ? 'Collapse all' : 'Expand all';
    }
  }
  function bindToggle(btn, table) {
    btn.addEventListener('click', () => {
      const open = local.tree[table.id] || (local.tree[table.id] = new Set());
      const ids = (table._roots || []).filter((n) => n.kids).map((n) => '/' + n.id);
      const all = ids.every((i) => open.has(i));
      if (all) open.clear(); else ids.forEach((i) => open.add(i));
      redraw();
    });
  }
  // nodes from rows: levels = [{key(r), label(k, rows), sub(k, rows)}], measure(rows) -> v
  function buildNodes(rows, levels, measureFn, filterTop) {
    const [lv, ...rest] = levels;
    const out = [];
    groupBy(rows, lv.key).forEach((rs, k) => {
      const n = { id: String(k), label: lv.label ? lv.label(k, rs) : String(k), sub: lv.sub ? lv.sub(k, rs) : '', v: measureFn(rs), rows: rs };
      if (rest.length) n.kids = () => buildNodes(rs, rest, measureFn);
      out.push(n);
    });
    return filterTop ? out.filter(filterTop) : out;
  }
  // segmented buttons
  function segTabs(box, options, current, onPick) {
    box.replaceChildren(...options.map(([value, label]) => {
      const b = el('button', 'cc-pill', label); b.type = 'button'; b.setAttribute('aria-pressed', String(value === current));
      b.addEventListener('click', () => onPick(value)); return b;
    }));
  }
  // KPI cards in the same style as the overview
  function pfCards(box, cards) {
    box.replaceChildren(...cards.map(([label, value, tone, lines]) => {
      const t = TONE[tone] || 'actual';
      const k = el('div', 'kpi kpi-' + t); const v = el('div', 'kpi-value');
      const i = el('span', 'kpi-icon', ICON[t]); i.setAttribute('aria-hidden', 'true'); v.append(i, document.createTextNode(value));
      if (ICON_LABEL[t]) v.title = ICON_LABEL[t];
      k.append(el('div', 'kpi-label', label), v, ...lines.map((l) => el('div', 'kpi-sub', l)));
      return k;
    }));
  }
  const fillSelect = (sel, options, value) => {
    const cur = value ?? sel.value;
    sel.replaceChildren(...options.map(([v, l]) => new Option(l, v)));
    sel.value = options.some(([v]) => v === cur) ? cur : (options[0] ? options[0][0] : '');
    return sel.value;
  };

  // ---------- charts ----------
  // horizontal bars either side of zero, for gains and losses
  function divBars(box, data, opts = {}) {
    clearBox(box);
    if (!data.length) { box.append(el('div', 'pf-empty cc-empty', opts.empty || 'Nothing to show for this view.')); box.style.minHeight = ''; return; }
    const W = box.clientWidth || 400, rowH = 30, H = data.length * rowH + 8;
    box.style.minHeight = H + 'px';
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    const fmt = opts.fmt || ((v) => fmtGap(v));
    const ml = Math.min(W * 0.4, measure(svg, data.map((d) => d.label)) + 12);
    const lw = measure(svg, data.map((d) => fmt(d.v))) + 10;
    const ext = d3.max(data, (d) => Math.abs(d.v)) || 1;
    const x = d3.scaleLinear([-ext, ext], [ml + lw, W - lw]);
    const y = d3.scaleBand(data.map((d, i) => i), [4, H - 4]).padding(0.28);
    const g = svg.append('g').selectAll('g').data(data).join('g');
    g.filter((d) => d.bold).append('line').attr('x1', 0).attr('x2', W).attr('y1', (d, i) => y(data.indexOf(d)) - (y.step() - y.bandwidth()) / 2).attr('y2', (d) => y(data.indexOf(d)) - (y.step() - y.bandwidth()) / 2).attr('stroke', 'var(--cds-chart-grid)');
    g.append('text').attr('x', ml - 8).attr('y', (d, i) => y(i) + y.bandwidth() / 2).attr('dy', '0.32em').attr('text-anchor', 'end')
      .attr('style', (d) => (d.bold ? 'fill: var(--color-fg); font-weight: 650' : null))
      .text((d) => (d.label.length > 34 ? d.label.slice(0, 33) + '…' : d.label)).append('title').text((d) => d.label);
    g.append('rect').attr('x', (d) => x(Math.min(0, d.v))).attr('width', (d) => Math.max(1, Math.abs(x(d.v) - x(0)))).attr('y', (d, i) => y(i)).attr('height', y.bandwidth()).attr('rx', 3)
      .attr('fill', (d) => (d.v >= 0 ? 'var(--bridge-up)' : 'var(--bridge-down)')).attr('opacity', (d) => (d.bold ? 1 : 0.85));
    g.append('text').attr('x', (d) => (d.v >= 0 ? x(d.v) + 6 : x(d.v) - 6)).attr('text-anchor', (d) => (d.v >= 0 ? 'start' : 'end')).attr('y', (d, i) => y(i) + y.bandwidth() / 2).attr('dy', '0.32em')
      .attr('style', (d) => 'fill: var(--color-fg)' + (d.bold ? '; font-weight: 650' : '')).text((d) => fmt(d.v));
    svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', H).attr('stroke', 'var(--cds-chart-axis)');
    if (opts.onClick) g.attr('cursor', 'pointer').on('click', (ev, d) => opts.onClick(d));
  }

  // ======================= Sales Summary =======================
  local.sm = { period: 'mtd', moversBy: 'brand', order: 'org' };
  const smPeriodSel = $('#sm-period');
  smPeriodSel.addEventListener('change', () => { local.sm.period = smPeriodSel.value; redraw(); });
  bindToggle($('#sm-brand-toggle'), $('#tbl-sm-brand'));
  function smPeriod(a) {
    const p = local.sm.period;
    const months = p === 'ytd' ? yearMonths(a) : [p === 'mtd' ? a.cur : p];
    const lyTxt = p === 'mtd' ? 'vs the same days last year (1–' + a.day + ' ' + d3.utcFormat('%b %Y')(new Date(Date.UTC(a.year - 1, a.asOf.getUTCMonth(), 1))) + ')'
      : p === 'ytd' ? 'vs the same days last year (1 Jan – ' + a.day + ' ' + d3.utcFormat('%b %Y')(new Date(Date.UTC(a.year - 1, a.asOf.getUTCMonth(), 1))) + ')'
      : 'vs ' + monLong(lyMon(p));
    return { months, lyTxt };
  }
  // targets in view for the chosen months, phased to date in the current month
  function targetFor(months, a, keep) {
    const brands = new Set(Array.from(ITEMS().values()).filter(itemFilter()).map((it) => it.brand));
    let t = 0, any = false;
    rowsOf('perf_target').forEach((r) => {
      if (!months.includes(r.month) || !brands.has(r.brand) || (keep && !keep(r))) return;
      any = true; t += (N(r.target) || 0) * (r.month === a.cur ? a.day / a.dim : 1);
    });
    return any ? t : null;
  }
  function drawSummary() {
    const ids = ['kpi', 'items', 'orgs', 'perf', 'perf_target'];
    const kp = $('#sm-kpis');
    if (!pfWait([$('#ch-bridge'), $('#ch-movers'), $('#tbl-orgdiv'), $('#tbl-sm-brand')], ids)) return;
    const a = asOfInfo();
    const opts = [['mtd', 'Month to date · ' + d3.utcFormat('%b %Y')(a.asOf)], ['ytd', 'Year to date · ' + a.year], ...yearMonths(a).filter((m) => m !== a.cur).reverse().map((m) => [m, d3.utcFormat('%B %Y')(monDate(m))])];
    local.sm.period = fillSelect(smPeriodSel, opts, local.sm.period);
    const { months, lyTxt } = smPeriod(a);
    $('#sm-compare').textContent = lyTxt + ' · AED';
    const rows = viewRows('perf', 'item').filter((r) => months.includes(r.month));
    const tot = pfFinish(pfSum(rows));
    const target = targetFor(months, a);
    // KPI cards
    const brandTot = buildNodes(rows, [{ key: (r) => r._it.brand }], (rs) => pfFinish(pfSum(rs)));
    const up = brandTot.filter((n) => n.v.delta > 0).length, down = brandTot.filter((n) => n.v.delta < 0).length;
    const ach = target ? tot.sales / target : null;
    pfCards(kp, [
      ['Net Sales', money(tot.sales), '', ['vs LY: ' + fmtDelta(tot.delta_pct) + ' (' + money(tot.ly_sales) + ')']],
      ['Growth vs last year', fmtGap(tot.delta) + ' AED', tot.delta >= 0 ? 'ok' : 'bad', ['Volume ' + fmtGap(tot.vol) + ' · Price ' + fmtGap(tot.price), 'New lines ' + fmtGap(tot.new) + ' · Lost ' + fmtGap(tot.lost)]],
      ['Gross Profit', money(tot.profit), tot.profit >= tot.ly_profit ? 'ok' : 'bad', ['vs LY: ' + fmtDelta(tot.ly_profit ? tot.profit / tot.ly_profit - 1 : null) + ' (' + money(tot.ly_profit) + ')']],
      ['Gross Margin %', fmtPct(tot.gm), N(tot.gm_pp) === null ? '' : tot.gm_pp >= 0 ? 'ok' : tot.gm_pp > -0.01 ? 'warn' : 'bad', ['LY ' + fmtPct(tot.ly_gm), fmtPP(tot.gm_pp) + ' vs LY']],
      ['Achieved vs target', fmtPct(ach), paceTone(ach), ['Target ' + (months.includes(a.cur) ? 'to date ' : '') + money(target), 'Gap ' + fmtGap(target === null ? null : tot.sales - target) + ' AED']],
      ['Brands growing', up + ' of ' + brandTot.length, up >= down ? 'ok' : 'warn', [down + ' below last year']],
    ]);
    // bridge from last year to this year
    divBars($('#ch-bridge'), [
      { label: 'Volume', v: tot.vol }, { label: 'Price & discount', v: tot.price },
      { label: 'New lines', v: tot.new }, { label: 'Lost lines', v: tot.lost },
      { label: 'Change ' + fmtMoney(tot.ly_sales) + ' → ' + fmtMoney(tot.sales), v: tot.delta, bold: true },
    ]);
    // movers
    const MOVERS = [['brand', 'Brand'], ['org', 'Sales organisation'], ['division', 'Division'], ['category', 'Category']];
    segTabs($('#sm-movers-by'), MOVERS, local.sm.moversBy, (v) => { local.sm.moversBy = v; redraw(); });
    const mk = { brand: (r) => r._it.brand, org: (r) => orgName(r.org), division: (r) => r.division, category: (r) => r._it.category }[local.sm.moversBy];
    const mv = Array.from(groupBy(rows, mk), ([k, rs]) => ({ label: k, v: pfSum(rs) })).map((d) => ({ label: d.label, v: d.v.sales - d.v.ly_sales, brand: d.label })).filter((d) => Math.round(d.v) !== 0).sort((x, y) => y.v - x.v);
    const top = mv.length > 12 ? [...mv.slice(0, 6), ...mv.slice(-6)] : mv;
    divBars($('#ch-movers'), top, { onClick: local.sm.moversBy === 'brand' ? (d) => dash.setParams({ brand: d.brand }) : null });
    // tables
    const cols = (withTarget) => [
      { field: 'label', label: '' },
      { field: 'sales', label: 'Sales', num: true, fmt: fmtInt },
      { field: 'ly_sales', label: 'Last year', num: true, fmt: fmtInt },
      { field: 'delta', label: 'Change', num: true, fmt: (v) => toneSpan(v, fmtSignedInt(v)) },
      { field: 'delta_pct', label: 'Change %', num: true, fmt: arrowPct, heat: (n) => heatPct(n.v.delta_pct) },
      { field: 'cost', label: 'Cost', num: true, fmt: fmtInt },
      { field: 'profit', label: 'Profit', num: true, fmt: fmtInt },
      { field: 'gm', label: 'Margin', num: true, fmt: (v) => fmtPct(v) },
      { field: 'gm_pp', label: 'Margin vs LY', num: true, fmt: (v) => toneSpan(v, fmtPP(v), 0.0005) },
      { field: 'share', label: '% Contr.', num: true, fmt: (v) => fmtPct(v), title: 'Share of total sales' },
      { field: 'gcontr', label: 'Growth contr.', num: true, fmt: (v) => toneSpan(v, fmtPP(v), 0.0005), title: 'Points of total growth against last year that this row adds' },
      ...(withTarget ? [
        { field: 'target', label: 'Target', num: true, fmt: fmtInt },
        { field: 'ach', label: 'Achieved', num: true, fmt: (v) => (N(v) === null ? '—' : paceBar(v)) },
      ] : []),
    ];
    const meas = (rs) => pfFinish(pfSum(rs), tot);
    const withT = (keep) => (v) => { v.target = targetFor(months, a, keep); v.ach = v.target ? v.sales / v.target : null; return v; };
    const orgLv = { key: (r) => r.org, label: (k) => orgName(k), sub: (k) => k };
    const divLv = { key: (r) => r.division };
    // rows by organisation, then division (or the other way round); targets exist by organisation only
    segTabs($('#sm-orgdiv-order'), [['org', 'Organisation → Division'], ['div', 'Division → Organisation']], local.sm.order, (v) => { local.sm.order = v; local.tree['tbl-orgdiv'] = null; redraw(); });
    const levels = local.sm.order === 'org' ? [orgLv, divLv] : [divLv, orgLv];
    const od = buildNodes(rows, levels, meas);
    if (local.sm.order === 'org') od.forEach((n) => withT((r) => r.org === n.id)(n.v));
    if (!local.tree['tbl-orgdiv']) local.tree['tbl-orgdiv'] = new Set(od.map((n) => '/' + n.id));
    const totNode = { label: 'Total', v: withT(null)(Object.assign({}, tot, { share: 1, gcontr: tot.ly_sales ? tot.delta / tot.ly_sales : null })) };
    drawTree($('#tbl-orgdiv'), cols(true), od, { sort: { field: 'sales', dir: -1 }, total: totNode });
    // rows by brand, opening by organisation then division
    const br = buildNodes(rows, [{ key: (r) => r._it.brand, sub: (k, rs) => rs[0]._it.category }, orgLv, divLv], meas);
    br.forEach((n) => {
      withT((r) => r.brand === n.id)(n.v);
      n.kids = () => buildNodes(n.rows, [orgLv, divLv], meas).map((o) => { withT((r) => r.brand === n.id && r.org === o.id)(o.v); return o; });
    });
    drawTree($('#tbl-sm-brand'), cols(true), br, { sort: { field: 'sales', dir: -1 }, total: totNode, toggle: $('#sm-brand-toggle') });
  }

  // ======================= Brand Monthly Tracking =======================
  local.bt = { measure: 'sales', show: 'value', org: '', div: '' };
  ['measure', 'show', 'org', 'div'].forEach((k) => { const s = $('#bt-' + k); s.addEventListener('change', () => { local.bt[k] = s.value; redraw(); }); });
  bindToggle($('#bt-toggle'), $('#tbl-bt'));
  function btValue(v, m) { return m === 'gm' ? v.gm : m === 'qty' ? v.qty : m === 'profit' ? v.profit : v.sales; }
  function btLy(v, m) { return m === 'gm' ? v.ly_gm : m === 'qty' ? v.ly_qty : m === 'profit' ? v.ly_profit : v.ly_sales; }
  function drawBrandTrack() {
    const ids = ['kpi', 'items', 'orgs', 'perf', 'perf_target'];
    if (!pfWait([$('#ch-bt'), $('#tbl-bt')], ids)) return;
    const a = asOfInfo(); const months = yearMonths(a);
    const all = viewRows('perf', 'item');
    local.bt.org = fillSelect($('#bt-org'), [['', 'All organisations'], ...Array.from(ORGS().values()).map((o) => [o.org, o.name])], local.bt.org);
    local.bt.div = fillSelect($('#bt-div'), [['', 'All divisions'], ...Array.from(new Set(rowsOf('perf').map((r) => r.division))).sort().map((d) => [d, d])], local.bt.div);
    const rows = all.filter((r) => (!local.bt.org || r.org === local.bt.org) && (!local.bt.div || r.division === local.bt.div));
    const m = local.bt.measure, delta = local.bt.show === 'delta';
    // measures: one set per month plus the year to date
    const meas = (rs) => {
      const v = pfFinish(pfSum(rs)); v.byM = {};
      groupBy(rs, (r) => r.month).forEach((g, k) => { v.byM[k] = pfFinish(pfSum(g)); });
      months.forEach((mm) => {
        const x = v.byM[mm]; const cur = x ? btValue(x, m) : null; const ly = x ? btLy(x, m) : null;
        v[mm] = delta ? (cur === null || ly === null ? null : cur - ly) : cur;
        v['h' + mm] = x ? (m === 'gm' ? heatPP(x.gm_pp) : heatPct(ly ? cur / ly - 1 : null)) : null;
      });
      v.ytd = btValue(v, m); v.ly_ytd = btLy(v, m);
      v.chg = m === 'gm' ? v.gm_pp : v.ly_ytd ? v.ytd / v.ly_ytd - 1 : null;
      return v;
    };
    const fmtCell = (x) => (N(x) === null ? '' : m === 'gm' ? (delta ? fmtPP(x) : fmtPct(x)) : delta ? fmtGap(x) : fmtMoney(x));
    const fmtTot = (x) => (N(x) === null ? '—' : m === 'gm' ? fmtPct(x) : fmtMoney(x));
    const cols = [
      { field: 'label', label: 'Brand' },
      ...months.map((mm) => ({
        field: mm, label: monShort(mm), sub: mm === a.cur ? '1–' + a.day : '', num: true, fmt: fmtCell, heat: (n) => n.v['h' + mm],
        tip: (n) => { const x = n.v.byM[mm]; if (!x) return ''; const c = btValue(x, m), l = btLy(x, m); return monLong(mm) + ': ' + fmtTot(c) + ' · last year ' + fmtTot(l) + (m === 'gm' ? ' · ' + fmtPP(x.gm_pp) : ' · ' + fmtDelta(l ? c / l - 1 : null)); },
      })),
      { field: 'ytd', label: 'YTD', num: true, fmt: fmtTot, cls: 'pf-strong', thCls: 'pf-sep' },
      { field: 'ly_ytd', label: 'LY YTD', num: true, fmt: fmtTot },
      { field: 'chg', label: 'vs LY', num: true, fmt: (v) => (m === 'gm' ? toneSpan(v, fmtPP(v), 0.0005) : arrowPct(v)), heat: (n) => (m === 'gm' ? heatPP(n.v.chg) : heatPct(n.v.chg)) },
    ];
    const nodes = buildNodes(rows, [
      { key: (r) => r._it.brand, sub: (k, rs) => rs[0]._it.category },
      { key: (r) => r.division },
      { key: (r) => r.item, label: (k, rs) => rs[0]._it.description, sub: (k) => k },
    ], meas);
    const tot = Object.assign({ label: 'Total' }, { v: meas(rows) });
    drawTree($('#tbl-bt'), cols, nodes, { sort: { field: 'ytd', dir: -1 }, total: tot, toggle: $('#bt-toggle') });
    // chart: this year and last year by month, with target when it applies
    const label = { sales: 'Sales', qty: 'Quantity', profit: 'Gross profit', gm: 'Gross margin %' }[m];
    const brand = params().brand;
    $('#bt-chart-title').textContent = label + ' by month · ' + (brand || (scopeInfo().scope === ALL ? 'all brands' : scopeInfo().scope));
    $('#bt-chart-note').textContent = 'Current month: 1–' + a.day + ' against the same days last year' + (m === 'sales' && local.bt.div ? ' · no target by division' : '');
    const data = months.map((mm) => {
      const x = tot.v.byM[mm];
      let t = null;
      if (m === 'sales' && !local.bt.div) t = targetFor([mm], a, (r) => !local.bt.org || r.org === local.bt.org);
      return { m: mm, s: x ? btValue(x, m) : null, ly: x ? btLy(x, m) : null, t };
    });
    groupedBars($('#ch-bt'), data, m === 'gm' ? (v) => fmtPct(v, 0) : (v) => compact.format(v), m === 'gm' ? fmtPct : (v) => compact.format(v), m === 'gm');
  }
  // this year and last year side by side per month, optional target tick
  function groupedBars(box, data, axisFmt, tipFmt, pct) {
    clearBox(box);
    const W = box.clientWidth || 400, H = 240;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    const vals = data.flatMap((r) => [r.s, r.ly, r.t]).filter((v) => v !== null && isFinite(v));
    const lo = Math.min(0, d3.min(vals) || 0), hi = Math.max(0, d3.max(vals) || 1) * 1.12;
    const y = d3.scaleLinear([lo, hi], [H - 24, 16]).nice();
    const ticks = y.ticks(4);
    const ml = measure(svg, ticks.map(axisFmt)) + 10;
    const x = d3.scaleBand(data.map((r) => r.m), [ml, W - 4]).padding(0.25);
    const xi = d3.scaleBand(['s', 'ly'], [0, x.bandwidth()]).padding(0.08);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', ml).attr('x2', W - 4).attr('y1', (v) => y(v)).attr('y2', (v) => y(v)).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', ml - 8).attr('y', (v) => y(v)).attr('dy', '0.32em').attr('text-anchor', 'end').text(axisFmt);
    svg.append('g').selectAll('text').data(data).join('text').attr('x', (r) => x(r.m) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').text((r) => monShort(r.m));
    const bar = (k, color) => svg.append('g').selectAll('rect').data(data.filter((r) => r[k] !== null)).join('rect')
      .attr('x', (r) => x(r.m) + xi(k)).attr('width', xi.bandwidth()).attr('y', (r) => Math.min(y(r[k]), y(0))).attr('height', (r) => Math.abs(y(0) - y(r[k]))).attr('rx', 3).attr('fill', color);
    bar('ly', 'var(--cds-chart-muted)'); bar('s', 'var(--cds-series-1)');
    // value on top of each bar (below it when negative), with a halo so it stays readable across the target line;
    // when the bars are narrow only this year's value is shown
    const short = pct ? axisFmt : (v) => { const a = Math.abs(v); return a >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : a >= 1e4 ? Math.round(v / 1e3) + 'K' : a >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : String(Math.round(v)); };
    const labels = (k, style) => svg.append('g').selectAll('text').data(data.filter((r) => r[k] !== null && r[k] !== 0)).join('text')
      .attr('x', (r) => x(r.m) + xi(k) + xi.bandwidth() / 2).attr('y', (r) => (r[k] < 0 ? y(r[k]) + 12 : y(r[k]) - 4)).attr('text-anchor', 'middle')
      .attr('style', 'paint-order: stroke; stroke: var(--surface); stroke-width: 3px; stroke-linejoin: round; ' + style).text((r) => short(r[k]));
    svg.append('g').selectAll('line').data(data.filter((r) => r.t !== null)).join('line').attr('x1', (r) => x(r.m) - 2).attr('x2', (r) => x(r.m) + x.bandwidth() + 2).attr('y1', (r) => y(r.t)).attr('y2', (r) => y(r.t)).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-width', 2);
    svg.append('line').attr('x1', ml).attr('x2', W - 4).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--cds-chart-axis)');
    if (xi.bandwidth() >= 30) labels('ly', 'fill: var(--text-muted); font-size: 10.5px');
    if (xi.bandwidth() >= 16) labels('s', 'fill: var(--color-fg); font-size: 11px; font-weight: 600');
    const tip = tipFor(box);
    svg.append('g').selectAll('rect').data(data).join('rect').attr('x', (r) => x(r.m) - (x.step() - x.bandwidth()) / 2).attr('width', x.step()).attr('y', 0).attr('height', H).attr('fill', 'transparent')
      .on('pointermove', (ev, r) => {
        const chg = r.s !== null && r.ly ? (pct ? fmtPP(r.s - r.ly) : fmtDelta(r.s / r.ly - 1)) : '—';
        tipRows(tip, monLong(r.m) + ' · ' + chg + ' vs LY', [['var(--cds-series-1)', 'This year', r.s === null ? '—' : tipFmt(r.s)], ['var(--cds-chart-muted)', 'Last year', r.ly === null ? '—' : tipFmt(r.ly)], ...(r.t !== null ? [['var(--cds-chart-reference)', 'Target', tipFmt(r.t)]] : [])]);
        const [px, py] = d3.pointer(ev, box); placeTip(box, tip, px, py);
      })
      .on('pointerleave', () => { tip.hidden = true; });
  }

  // ======================= Daily Tracking =======================
  const DT_DIMS = {
    sp: { label: 'Salesperson', plural: 'salespeople', key: (r) => r.sp ?? '', name: (k) => repName(k === '' ? null : k) },
    seg: { label: 'Customer group', plural: 'customer groups', key: (r) => custOf(r.cu).segment || '—', name: (k) => k },
    brand: { label: 'Brand', plural: 'brands', key: (r) => r._it.brand, name: (k) => k },
    it: { label: 'Item', plural: 'items', key: (r) => r.it, name: (k, rs) => rs[0]._it.description, sub: (k) => String(k) },
    cu: { label: 'Customer', plural: 'customers', key: (r) => r.cu, name: (k) => custOf(k).name || String(k), sub: (k) => String(k) },
    div: { label: 'Division', plural: 'divisions', key: (r) => custOf(r.cu).division || '—', name: (k) => k },
    org: { label: 'Sales organisation', plural: 'sales organisations', key: (r) => custOf(r.cu).org || '—', name: (k) => orgName(k) },
  };
  local.dt = { by1: 'sp', by2: 'cu', by3: '', by4: '', measure: 's', search: '' };
  ['by1', 'by2', 'by3', 'by4', 'measure'].forEach((k) => { const s = $('#dt-' + k); s.addEventListener('change', () => { local.dt[k] = s.value; local.tree['tbl-dt'] = null; redraw(); }); });
  $('#dt-search').addEventListener('input', (e) => { local.dt.search = e.target.value.trim().toLowerCase(); redraw(); });
  bindToggle($('#dt-toggle'), $('#tbl-dt'));
  function drawDailyTrack() {
    const ids = ['kpi', 'items', 'custs', 'orgs', 'reps', 'daily_detail'];
    if (!pfWait([$('#ch-dt'), $('#tbl-dt')], ids)) return;
    const a = asOfInfo();
    const dimOpts = Object.entries(DT_DIMS).map(([k, d]) => [k, d.label]);
    local.dt.by1 = fillSelect($('#dt-by1'), dimOpts, local.dt.by1);
    // each "Then by" offers the dimensions not used above it; after a "Nothing" the rest switch off
    const used = [local.dt.by1];
    ['by2', 'by3', 'by4'].forEach((k) => {
      const sel = $('#dt-' + k), on = used.length === Number(k.slice(2)) - 1;
      sel.disabled = !on;
      local.dt[k] = fillSelect(sel, [['', 'Nothing'], ...(on ? dimOpts.filter(([d]) => !used.includes(d)) : [])], on ? local.dt[k] : '');
      if (local.dt[k]) used.push(local.dt[k]);
    });
    const q = local.dt.measure; const dims = used.map((k) => DT_DIMS[k]); const d1 = dims[0];
    let rows = viewRows('daily_detail', 'it');
    if (local.dt.search) {
      const s = local.dt.search;
      const hit = (d, r) => { const k = d.key(r); return String(d.name(k, [r])).toLowerCase().includes(s) || String(k).toLowerCase().includes(s); };
      rows = rows.filter((r) => dims.some((d) => hit(d, r)));
    }
    const days = d3.range(1, a.day + 1);
    const meas = (rs) => {
      const v = { pm: 0, ly: 0, mtd: 0 }; days.forEach((d) => (v['d' + d] = 0));
      rs.forEach((r) => { const x = N(r[q]) || 0; if (r.k === 'ty') { v.mtd += x; v['d' + r.d] += x; } else if (r.k === 'ly') v.ly += x; else v.pm += x; });
      v.chg = v.ly > 0 ? v.mtd / v.ly - 1 : null;
      v.pm_pace = v.pm ? v.mtd / (v.pm * a.day / a.dim) - 1 : null;
      return v;
    };
    const lv = (d) => ({ key: d.key, label: (k, rs) => d.name(k, rs), sub: d.sub ? (k) => d.sub(k) : null });
    const nodes = buildNodes(rows, dims.map(lv), meas, (n) => n.v.mtd || n.v.ly || n.v.pm);
    const fmtV = (v) => (N(v) ? fmtInt(v) : '');
    const monthStart = new Date(Date.UTC(a.year, a.asOf.getUTCMonth(), 1));
    const dayDate = (d) => new Date(monthStart.getTime() + (d - 1) * 864e5);
    const weekend = (d) => [0, 6].includes(dayDate(d).getUTCDay());
    const pmLabel = d3.utcFormat('%b')(new Date(Date.UTC(a.year, a.asOf.getUTCMonth() - 1, 1)));
    const cols = [
      { field: 'label', label: dims.map((d) => d.label).join(' → ') },
      { field: 'pm', label: pmLabel, sub: 'full month', num: true, fmt: fmtInt },
      { field: 'ly', label: 'Last year', sub: '1–' + a.day, num: true, fmt: fmtInt },
      { field: 'mtd', label: 'This month', sub: '1–' + a.day, num: true, fmt: fmtInt, cls: 'pf-strong' },
      { field: 'chg', label: 'vs LY', num: true, fmt: arrowPct, heat: (n) => heatPct(n.v.chg) },
      ...days.map((d) => ({ field: 'd' + d, label: String(d), sub: d3.utcFormat('%a')(dayDate(d)), num: true, fmt: fmtV, thCls: (weekend(d) ? 'pf-wkend' : '') + (d === 1 ? ' pf-sep' : ''), cls: weekend(d) ? 'pf-wkend' : '' })),
    ];
    const tot = { label: 'Total', v: meas(rows) };
    const unit = q === 's' ? 'AED' : 'quantity';
    $('#dt-title').textContent = 'Day by day · ' + d3.utcFormat('%B %Y')(a.asOf) + ' · ' + unit;
    $('#dt-count').textContent = nodes.length + ' ' + (nodes.length === 1 ? d1.label.toLowerCase() : d1.plural);
    drawTree($('#tbl-dt'), cols, nodes, { sort: { field: 'mtd', dir: -1 }, total: tot, toggle: $('#dt-toggle'), empty: 'No sales for this view this month.' });
    // chart
    $('#dt-chart-title').textContent = (q === 's' ? 'Daily sales' : 'Daily quantity') + ' · ' + d3.utcFormat('%b %Y')(a.asOf);
    const lyDay = {}; rows.forEach((r) => { if (r.k === 'ly') lyDay[r.d] = (lyDay[r.d] || 0) + (N(r[q]) || 0); });
    dailyBars($('#ch-dt'), days.map((d) => ({ d, date: dayDate(d), v: tot.v['d' + d], ly: lyDay[d] || 0, wk: weekend(d) })));
  }
  function dailyBars(box, data) {
    clearBox(box);
    const W = box.clientWidth || 400, H = 220;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    const y = d3.scaleLinear([0, (d3.max(data, (r) => Math.max(r.v, r.ly)) || 1) * 1.12], [H - 24, 12]).nice();
    const ticks = y.ticks(4);
    const ml = measure(svg, ticks.map((v) => compact.format(v))) + 10;
    const x = d3.scaleBand(data.map((r) => r.d), [ml, W - 4]).padding(0.22);
    svg.append('g').selectAll('rect').data(data.filter((r) => r.wk)).join('rect').attr('x', (r) => x(r.d) - (x.step() - x.bandwidth()) / 2).attr('width', x.step()).attr('y', 6).attr('height', H - 30).attr('fill', 'var(--weekend)');
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', ml).attr('x2', W - 4).attr('y1', (v) => y(v)).attr('y2', (v) => y(v)).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', ml - 8).attr('y', (v) => y(v)).attr('dy', '0.32em').attr('text-anchor', 'end').text((v) => compact.format(v));
    const every = x.bandwidth() < 14 ? 3 : x.bandwidth() < 22 ? 2 : 1;
    svg.append('g').selectAll('text').data(data.filter((r, i) => i % every === 0)).join('text').attr('x', (r) => x(r.d) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').text((r) => r.d);
    svg.append('g').selectAll('rect').data(data.filter((r) => r.v > 0)).join('rect').attr('x', (r) => x(r.d)).attr('width', x.bandwidth()).attr('y', (r) => y(r.v)).attr('height', (r) => y(0) - y(r.v)).attr('rx', 3).attr('fill', 'var(--cds-series-1)');
    svg.append('g').selectAll('line').data(data.filter((r) => r.ly > 0)).join('line').attr('x1', (r) => x(r.d) + 2).attr('x2', (r) => x(r.d) + x.bandwidth() - 2).attr('y1', (r) => y(r.ly)).attr('y2', (r) => y(r.ly)).attr('stroke', '#c99a2e').attr('stroke-width', 2.5);
    if (x.bandwidth() >= 26) svg.append('g').selectAll('text').data(data.filter((r) => r.v > 0)).join('text').attr('x', (r) => x(r.d) + x.bandwidth() / 2).attr('y', (r) => Math.min(y(r.v), y(r.ly)) - 5).attr('text-anchor', 'middle').attr('style', 'fill: var(--color-fg); font-size: 11px; font-weight: 600').text((r) => compact.format(r.v));
    svg.append('line').attr('x1', ml).attr('x2', W - 4).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--cds-chart-axis)');
    const tip = tipFor(box);
    svg.append('g').selectAll('rect').data(data).join('rect').attr('x', (r) => x(r.d) - (x.step() - x.bandwidth()) / 2).attr('width', x.step()).attr('y', 0).attr('height', H).attr('fill', 'transparent')
      .on('pointermove', (ev, r) => {
        tipRows(tip, d3.utcFormat('%a %-d %b')(r.date) + (r.ly ? ' · ' + fmtDelta(r.v / r.ly - 1) + ' vs LY' : ''), [['var(--cds-series-1)', 'This month', fmtInt(r.v)], ['#c99a2e', 'Same date last year', fmtInt(r.ly)]]);
        const [px, py] = d3.pointer(ev, box); placeTip(box, tip, px, py);
      })
      .on('pointerleave', () => { tip.hidden = true; });
  }

  // ======================= Margin Tracker =======================
  local.mg = { month: '', by: 'it', show: 'all', search: '' };
  ['month', 'by', 'show'].forEach((k) => { const s = $('#mg-' + k); s.addEventListener('change', () => { local.mg[k] = s.value; if (k === 'by') local.tree['tbl-mg'] = null; redraw(); }); });
  $('#mg-search').addEventListener('input', (e) => { local.mg.search = e.target.value.trim().toLowerCase(); redraw(); });
  bindToggle($('#mg-toggle'), $('#tbl-mg'));
  const MG_DIMS = {
    it: { label: 'Item', plural: 'items', key: (r) => r.it, name: (k, rs) => rs[0]._it.description, sub: (k) => String(k) },
    brand: { label: 'Brand', plural: 'brands', key: (r) => r._it.brand, name: (k) => k, sub: (k, rs) => rs[0]._it.category },
    cu: { label: 'Customer', plural: 'customers', key: (r) => r.cu, name: (k) => custOf(k).name || String(k), sub: (k) => custOf(k).segment || '' },
    sp: { label: 'Salesperson', plural: 'salespeople', key: (r) => r.sp ?? '', name: (k) => repName(k === '' ? null : k), sub: () => '' },
  };
  const MG_DRILL = { it: ['cu'], brand: ['it', 'cu'], cu: ['it'], sp: ['cu', 'it'] };
  function mgMeasure(rs) {
    let s = 0, c = 0, ls = 0, lc = 0, fl = 0, leak = 0;
    rs.forEach((r) => {
      const x = N(r.s) || 0, y = N(r.c) || 0;
      if (r.k === 'ty') { s += x; c += y; fl += x * N(r._it.margin_floor); const g = N(r._it.margin_floor) * x - (x - y); if (x > 0 && g > 0) leak += g; }
      else { ls += x; lc += y; }
    });
    const v = { sales: s, cost: c, profit: s - c, ly_sales: ls, ly_cost: lc, leak };
    v.gm = s > 0 ? (s - c) / s : null; v.ly_gm = ls > 0 ? (ls - lc) / ls : null;
    v.gm_pp = v.gm !== null && v.ly_gm !== null ? v.gm - v.ly_gm : null;
    v.floor = s > 0 ? fl / s : null;
    v.vs_floor = v.gm !== null && v.floor !== null ? v.gm - v.floor : null;
    v.status = v.gm === null ? '' : v.vs_floor < 0 ? 'Below floor' : v.vs_floor < 0.03 ? 'Thin' : 'Healthy';
    return v;
  }
  const MG_TONE = { 'Below floor': 'bad', Thin: 'warn', Healthy: 'ok' };
  function drawMargin() {
    const a = asOfInfo();
    const base = ['kpi', 'items', 'custs', 'reps'];
    if (!a) { pfWait([$('#ch-mg'), $('#tbl-mg')], base); return; }
    const monthOpts = yearMonths(a).reverse().map((m) => [m, d3.utcFormat('%B %Y')(monDate(m)) + (m === a.cur ? ' (to date)' : '')]);
    local.mg.month = fillSelect($('#mg-month'), monthOpts, local.mg.month || a.cur);
    const id = 'margin_detail?month=' + local.mg.month;
    if (!pfWait([$('#ch-mg'), $('#tbl-mg')], [...base, id])) { $('#mg-kpis').replaceChildren(); return; }
    const by = local.mg.by; const dim = MG_DIMS[by];
    const rows = viewRows(id, 'it');
    const lv = (d) => ({ key: d.key, label: (k, rs) => d.name(k, rs), sub: (k, rs) => d.sub(k, rs) });
    const tot = mgMeasure(rows);
    const show = local.mg.show, s = local.mg.search;
    const keep = (n) => (n.v.sales || n.v.ly_sales)
      && (show === 'all' || (show === 'below' && n.v.status === 'Below floor') || (show === 'thin' && n.v.status === 'Thin') || (show === 'drop' && N(n.v.gm_pp) !== null && n.v.gm_pp <= -0.02))
      && (!s || n.label.toLowerCase().includes(s) || String(n.id).toLowerCase().includes(s) || String(n.sub || '').toLowerCase().includes(s));
    const nodes = buildNodes(rows, [lv(dim), ...MG_DRILL[by].map((k) => lv(MG_DIMS[k]))], (rs) => { const v = mgMeasure(rs); v.pshare = tot.profit ? v.profit / tot.profit : null; return v; }, keep);
    // cards
    const below = buildNodes(rows, [lv(dim)], mgMeasure).filter((n) => n.v.status === 'Below floor');
    const cur = local.mg.month === a.cur;
    pfCards($('#mg-kpis'), [
      ['Net value', money(tot.sales), '', ['vs LY: ' + fmtDelta(tot.ly_sales ? tot.sales / tot.ly_sales - 1 : null) + (cur ? ' (same days)' : '')]],
      ['Gross profit', money(tot.profit), tot.profit >= tot.ly_sales - tot.ly_cost ? 'ok' : 'bad', ['Cost ' + money(tot.cost)]],
      ['Gross margin %', fmtPct(tot.gm), N(tot.vs_floor) === null ? '' : tot.vs_floor < 0 ? 'bad' : tot.vs_floor < 0.03 ? 'warn' : 'ok', ['Floor ' + fmtPct(tot.floor) + ' · LY ' + fmtPct(tot.ly_gm), fmtPP(tot.gm_pp) + ' vs LY']],
      ['Profit lost under the floor', money(tot.leak), tot.leak > 0 ? 'bad' : 'ok', ['Lines sold below their category floor']],
      [dim.label + 's below floor', fmtInt(below.length), below.length ? 'bad' : 'ok', ['of ' + fmtInt(buildNodes(rows, [lv(dim)], (rs) => 0).length) + ' ' + dim.plural + ' sold']],
    ]);
    const cols = [
      { field: 'label', label: dim.label + ' → ' + MG_DRILL[by].map((k) => MG_DIMS[k].label).join(' → ') },
      { field: 'sales', label: 'Net value', num: true, fmt: fmtInt },
      { field: 'cost', label: 'Total cost', num: true, fmt: fmtInt },
      { field: 'profit', label: 'Profit', num: true, fmt: (v) => toneSpan(v < 0 ? v : null, fmtInt(v)) },
      { field: 'gm', label: 'Margin %', num: true, fmt: (v, n) => el('span', n.v.status === 'Below floor' ? 'cc-bad' : n.v.status === 'Thin' ? 'cc-warn' : '', fmtPct(v)) },
      { field: 'floor', label: 'Floor', num: true, fmt: (v) => fmtPct(v, 0) },
      { field: 'status', label: 'Status', fmt: (v) => (v ? chip(v, MG_TONE[v]) : '—'), sort: (n) => n.v.vs_floor },
      { field: 'ly_gm', label: 'LY margin %', num: true, fmt: (v) => fmtPct(v) },
      { field: 'gm_pp', label: 'vs LY', num: true, fmt: (v) => toneSpan(v, fmtPP(v), 0.0005), heat: (n) => heatPP(n.v.gm_pp) },
      { field: 'leak', label: 'Profit under floor', num: true, fmt: (v) => (N(v) > 0.5 ? el('span', 'cc-bad', fmtInt(v)) : el('span', 'cc-muted', '0')), title: 'Gross profit missing against the floor, from lines sold under it' },
      { field: 'pshare', label: '% of profit', num: true, fmt: (v) => fmtPct(v) },
    ];
    $('#mg-title').textContent = 'Margin by ' + dim.label.toLowerCase() + ' · ' + d3.utcFormat('%B %Y')(monDate(local.mg.month)) + (cur ? ' to date' : '');
    $('#mg-count').textContent = nodes.length + ' ' + dim.plural;
    drawTree($('#tbl-mg'), cols, nodes, { sort: { field: 'sales', dir: -1 }, total: { label: 'Total', v: Object.assign({}, tot, { pshare: 1 }) }, toggle: $('#mg-toggle'), empty: 'Nothing matches these filters.' });
    $('#mg-map-title').textContent = 'Margin map · ' + dim.plural;
    marginMap($('#ch-mg'), nodes.filter((n) => n.v.sales > 0 && n.v.gm !== null).sort((x, y) => y.v.sales - x.v.sales).slice(0, 300), tot.floor);
  }
  function marginMap(box, nodes, floor) {
    clearBox(box);
    if (!nodes.length) { box.append(el('div', 'pf-empty cc-empty', 'Nothing to plot for these filters.')); return; }
    const W = box.clientWidth || 400, H = 280;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    const gms = nodes.map((n) => n.v.gm);
    const y = d3.scaleLinear([Math.min(0, d3.min(gms), (floor || 0) - 0.05), Math.max(d3.max(gms), (floor || 0) + 0.05)], [H - 28, 10]).nice();
    const ticks = y.ticks(5);
    const ml = measure(svg, ticks.map((v) => fmtPct(v, 0))) + 10;
    const x = d3.scaleLog([Math.max(1, d3.min(nodes, (n) => n.v.sales) * 0.8), d3.max(nodes, (n) => n.v.sales) * 1.2], [ml + 6, W - 10]);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', ml).attr('x2', W - 4).attr('y1', (v) => y(v)).attr('y2', (v) => y(v)).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', ml - 8).attr('y', (v) => y(v)).attr('dy', '0.32em').attr('text-anchor', 'end').text((v) => fmtPct(v, 0));
    const xt = x.ticks(5).filter((v, i, arr) => arr.length < 8 || [1, 2, 5].includes(Number(String(v)[0])));
    svg.append('g').selectAll('text').data(xt).join('text').attr('x', (v) => x(v)).attr('y', H - 8).attr('text-anchor', 'middle').text((v) => compact.format(v));
    svg.append('line').attr('x1', ml).attr('x2', W - 4).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--cds-chart-axis)');
    if (floor !== null) {
      svg.append('line').attr('x1', ml).attr('x2', W - 4).attr('y1', y(floor)).attr('y2', y(floor)).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '5 4').attr('stroke-width', 1.5);
      svg.append('text').attr('x', W - 6).attr('y', y(floor) - 6).attr('text-anchor', 'end').text('Average floor ' + fmtPct(floor, 0));
    }
    const color = (n) => (n.v.status === 'Below floor' ? 'var(--short)' : n.v.status === 'Thin' ? 'var(--warn)' : 'var(--cds-series-1)');
    const tip = tipFor(box);
    svg.append('g').selectAll('path').data(nodes).join('path')
      .attr('d', (n) => d3.symbol(n.v.status === 'Below floor' ? d3.symbolTriangle : n.v.status === 'Thin' ? d3.symbolDiamond : d3.symbolCircle, 46)())
      .attr('transform', (n) => `translate(${x(n.v.sales)},${y(n.v.gm)})${n.v.status === 'Below floor' ? ' rotate(180)' : ''}`)
      .attr('fill', color).attr('fill-opacity', 0.75).attr('stroke', 'var(--color-panel)').attr('stroke-width', 1)
      .on('pointermove', (ev, n) => {
        tipRows(tip, n.label + (n.sub ? ' · ' + n.sub : ''), [[color(n), 'Margin', fmtPct(n.v.gm) + ' (floor ' + fmtPct(n.v.floor, 0) + ')'], ['var(--cds-chart-muted)', 'Net value', fmtInt(n.v.sales) + ' AED'], ['var(--cds-chart-muted)', 'vs LY', fmtPP(n.v.gm_pp)]]);
        const [px, py] = d3.pointer(ev, box); placeTip(box, tip, px, py);
      })
      .on('pointerleave', () => { tip.hidden = true; });
    const lg = svg.append('g').attr('transform', `translate(${ml + 8},14)`);
    [['Below floor', 'var(--short)', d3.symbolTriangle, 180], ['Within 3 points', 'var(--warn)', d3.symbolDiamond, 0], ['Healthy', 'var(--cds-series-1)', d3.symbolCircle, 0]].reduce((xo, [t, c, sym, rot]) => {
      lg.append('path').attr('d', d3.symbol(sym, 40)()).attr('transform', `translate(${xo},0) rotate(${rot})`).attr('fill', c);
      lg.append('text').attr('x', xo + 9).attr('y', 0).attr('dy', '0.32em').text(t);
      return xo + 22 + measure(svg, [t]);
    }, 0);
  }

