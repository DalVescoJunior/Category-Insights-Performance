  // KPI cards in the Executive Pulse style: label, value with a status icon, labelled lines under it
  const TONE = { ok: 'over', warn: 'warn', bad: 'short', '': 'actual' };
  const ICON = { over: '▲', warn: '◆', short: '▼', actual: '●' };
  const ICON_LABEL = { over: 'At or above target', warn: 'Watch', short: 'Below target', actual: '' };
  const money = (v) => (N(v) === null ? '—' : fmtMoney(v) + ' AED');
  function drawTiles() {
    const box = $('#cc-tiles'); const r = scopeInfo().row;
    if (!r) {
      box.replaceChildren(...Array.from({ length: 8 }, () => { const k = el('div', 'kpi'); k.append(el('div', 'kpi-label', ' '), el('div', 'kpi-value dash-skeleton', failed('kpi') ? '' : '—')); return k; }));
      if (failed('kpi')) box.replaceChildren(el('div', 'cc-fail', 'The figures did not load.'));
      return;
    }
    const gm = N(r.gm_pct), fl = N(r.margin_floor), tg = N(r.target_gm_pct);
    const gapToDate = N(r.mtd_sales) - N(r.target_to_date);
    const cards = [
      ['Net Sales MTD', money(r.mtd_sales), '', ['vs ' + (new Date(r.as_of).getUTCFullYear() - 1) + ': ' + fmtDelta(r.yoy_pct) + ' (' + money(r.ly_mtd_sales) + ')']],
      ['Sales Target', money(r.month_target), '', ['To date: ' + money(r.target_to_date)]],
      ['Achieved % to date', fmtPct(r.pace_pct), paceTone(r.pace_pct), ['vs target: ' + fmtGap(gapToDate) + ' AED']],
      ['Month-end forecast', money(r.forecast_eom), paceTone(r.forecast_pct), [fmtPct(r.forecast_pct, 0) + ' of target · gap ' + fmtGap(r.forecast_gap)]],
      ['Gross Margin %', fmtPct(r.gm_pct), fl !== null && gm < fl ? 'bad' : gm < tg ? 'warn' : 'ok', ['Target ' + fmtPct(r.target_gm_pct) + (fl !== null ? ' · floor ' + fmtPct(fl, 0) : ''), 'GP ' + money(r.mtd_gp)]],
      ['Time Elapsed %', fmtPct(N(r.days_elapsed) / N(r.days_in_month)), '', [r.days_elapsed + ' of ' + r.days_in_month + ' days']],
      ['YTD Sales', money(r.ytd_sales), paceTone(r.ytd_pct), [fmtPct(r.ytd_pct, 0) + ' of YTD target · ' + fmtDelta(r.ytd_yoy_pct) + ' vs LY']],
      ['Stock on hand', money(r.soh_value), '', [fmtDays(r.days_cover) + ' days of cover', money(r.inbound_value) + ' on order']],
      ['Expiring ≤ 30 days', money(r.at_risk_value), N(r.expired_value) > 0 ? 'bad' : N(r.at_risk_value) > 0 ? 'warn' : 'ok', [money(r.expired_value) + ' already expired', money(r.blocked_value) + ' blocked or in QI']],
      ['Out of stock lines', fmtInt(r.oos_skus), N(r.oos_skus) > 0 ? 'bad' : N(r.low_skus) > 0 ? 'warn' : 'ok', [fmtInt(r.low_skus) + ' low · ' + fmtInt(r.over_skus) + ' overstock · ' + fmtInt(r.nomove_skus) + ' not selling', 'of ' + fmtInt(r.active_skus) + ' item-hub lines']],
    ];
    box.replaceChildren(...cards.map(([label, value, tone, lines]) => {
      const t = TONE[tone] || 'actual';
      const k = el('div', 'kpi kpi-' + t); const v = el('div', 'kpi-value');
      const i = el('span', 'kpi-icon', ICON[t]); i.setAttribute('aria-hidden', 'true'); v.append(i, document.createTextNode(value));
      if (ICON_LABEL[t]) v.title = ICON_LABEL[t];
      k.append(el('div', 'kpi-label', label), v, ...lines.map((l) => el('div', 'kpi-sub', l)));
      return k;
    }));
  }

