  // ---------- filters: category manager, category, brand ----------
  const USER = window.CP_USER || { name: 'Demo user', role: 'All categories', manager: null };
  const fMgr = $('#f-manager'), fCat = $('#f-category'), fBrand = $('#f-brand');
  const pick = () => {
    const s = scopeInfo();
    const mgr = s.level === 'manager' ? s.scope : s.level === 'category' ? s.row.manager : '';
    return { mgr, cat: s.level === 'category' ? s.scope : '' };
  };
  fMgr.addEventListener('change', () => setScope(fMgr.value || ALL));
  fCat.addEventListener('change', () => setScope(fCat.value || fMgr.value || ALL));
  fBrand.addEventListener('change', () => dash.setParams({ brand: fBrand.value || null }));
  $('#f-clear').addEventListener('click', () => setScope(USER.manager || ALL));
  if (USER.manager && params().scope === ALL) dash.setParams({ scope: USER.manager });
  const opt = (label, value) => new Option(label, value);
  function drawScope() {
    const k = rowsOf('kpi');
    [fMgr, fCat, fBrand].forEach((s) => { s.disabled = !k.length; });
    if (!k.length) { [fMgr, fCat, fBrand].forEach((s) => s.replaceChildren(opt(failed('kpi') ? 'Not loaded' : 'Loading…', ''))); return; }
    const { mgr, cat } = pick();
    const mgrs = k.filter((r) => r.level === 'manager' && (!USER.manager || r.scope === USER.manager));
    fMgr.replaceChildren(...(USER.manager ? [] : [opt('All managers', '')]), ...mgrs.map((r) => opt(r.scope, r.scope)));
    fMgr.value = mgr; fMgr.disabled = !!USER.manager;
    const cats = k.filter((r) => r.level === 'category' && (!mgr || r.manager === mgr) && (!USER.manager || r.manager === USER.manager));
    fCat.replaceChildren(opt(mgr ? 'All ' + mgr.split(' ')[0] + '’s categories' : 'All categories', ''), ...cats.map((r) => opt(r.scope, r.scope)));
    fCat.value = cat;
    const brands = Array.from(new Set(inScope(rowsOf('brand')).map((r) => r.brand))).sort();
    const brand = params().brand;
    fBrand.replaceChildren(opt('All brands', ''), ...brands.map((b) => opt(b, b)));
    fBrand.value = brands.includes(brand) ? brand : '';
    if (brand && rowsOf('brand').length && !brands.includes(brand)) dash.setParams({ brand: null });
    // filter chips under the bar, each removable
    const chips = [];
    const chipF = (text, clear) => { const c = el('span', 'chip-f', text); const b = el('button', '', '×'); b.type = 'button'; b.setAttribute('aria-label', 'Remove ' + text); b.addEventListener('click', clear); c.append(b); return c; };
    if (mgr && !USER.manager) chips.push(chipF('Manager: ' + mgr, () => setScope(ALL)));
    if (cat) chips.push(chipF('Category: ' + cat, () => setScope(mgr || ALL)));
    if (brand) chips.push(chipF('Brand: ' + brand + ' (tables and alerts)', () => dash.setParams({ brand: null })));
    $('#cc-chips').replaceChildren(...chips);
    const r = kpiRow(ALL);
    if (r) {
      const asOf = new Date(String(r.as_of).slice(0, 10) + 'T00:00:00Z');
      const d = d3.utcFormat('%-d %b %Y'); const m = d3.utcFormat('%b %Y');
      const ly = new Date(Date.UTC(asOf.getUTCFullYear() - 1, asOf.getUTCMonth(), asOf.getUTCDate()));
      $('#cc-context').textContent = m(asOf) + ' (1–' + d(asOf) + ') · month to date vs ' + d3.utcFormat('1–%-d %b %Y')(ly) + ' like-for-like · ' + r.days_elapsed + ' of ' + r.days_in_month + ' days';
    }
  }

