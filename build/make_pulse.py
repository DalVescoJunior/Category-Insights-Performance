import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'public/index.html').read_text().split('\n')
head = (root / 'public/pulse-head.html').read_text()
top = (root / 'public/pulse-top.html').read_text()

# sections: lines 117..279 (1-based), with the tile block 118..150 swapped for KPI cards
first = next(i for i, l in enumerate(src) if '<section class="cc-page" id="overview"' in l)
script = next(i for i, l in enumerate(src) if l.strip() == '<script>')
last = max(i for i in range(script) if src[i].strip() == '</section>')
sec = src[first:last + 1]
tiles_start = next(i for i, l in enumerate(sec) if 'id="cc-tiles"' in l)
grid_start = next(i for i, l in enumerate(sec) if l.strip() == '<div class="cc-grid">')
sec = sec[:tiles_start] + [
  '    <div class="kpi-row" id="cc-tiles"></div>',
  '    <ul class="legend" aria-label="Legend"><li><span class="i-actual">●</span> Actual</li><li><span class="i-short">▼</span> Shortfall</li><li><span class="i-over">▲</span> At or above target</li><li><span class="i-warn">◆</span> Watch</li></ul>',
] + sec[grid_start:]
sections = '\n'.join(sec)
sections = re.sub(r' role="tabpanel" aria-labelledby="tab-\w+"', '', sections)
sections = sections.replace('Click a brand to see its items in Stock &amp; cover', 'Click a brand to filter the page to it')
sections = sections.replace('show under Customers &amp; margin', 'show under Customers &amp; Leakage')
LEGEND_OLD = '''          <span><i class="cc-sw cc-sw-box" id="lg-bar"></i>Sales</span>
          <span><i class="cc-sw" style="border-color: var(--cds-chart-reference)"></i>Target</span>
          <span><i class="cc-sw cc-sw-box" style="background: var(--cds-chart-muted); border-radius: 50%"></i>Last year</span>'''
assert LEGEND_OLD in sections
sections = sections.replace(LEGEND_OLD, (root / 'build/target-legend.html').read_text().rstrip('\n'))
sections = sections.replace('<span class="cc-note">Sales against monthly target and last year</span>', '<span class="cc-note">Above each bar: % against target and the amount achieved. This month is judged against its target to date.</span>')

js = '\n'.join(src[script:])

def sub(old, new, count=1):
    global js
    assert js.count(old) == count, (old[:60], js.count(old))
    js = js.replace(old, new)

# scope select -> manager / category / brand filters
start = js.index('  // ---------- scope select ----------')
end = js.index('  // ---------- header ----------')
js = js[:start] + (root / 'build/filters.js').read_text() + js[end:]

sub("""    const bp = $('#cc-brand-pill'); const brand = params().brand;
    bp.hidden = !brand; bp.textContent = brand ? 'Brand: ' + brand + ' ×' : '';
""", '')
sub("""  $('#cc-brand-pill').addEventListener('click', () => dash.setParams({ brand: null }));
""", '')

# tiles -> Executive Pulse KPI cards
start = js.index('  function drawTiles() {')
end = js.index('  function drawScorecard() {')
js = js[:start] + (root / 'build/tiles.js').read_text() + js[end:]

# monthly chart: replaced by the target-coloured version in perf.js
start = js.index('  function drawMonthly() {')
end = js.index('  function drawAgingChart(')
js = js[:start] + js[end:]

# pages: sidebar links instead of tabs
start = js.index('  // ---------- pages ----------')
end = js.index('  const start = (location.hash')
js = js[:start] + (root / 'build/perf.js').read_text() + (root / 'build/pages.js').read_text() + js[end:]
sub("$('#cc-asof').textContent = fmtDate(String(r.as_of).slice(0, 10));", "$('#cc-asof').textContent = d3.utcFormat('%-d %b %Y')(new Date(String(r.as_of).slice(0, 10) + 'T00:00:00Z'));")
sub("dash.setParams({ brand: r.brand }); showPage('stock');", "dash.setParams({ brand: r.brand });", 2)

sections += '\n\n' + (root / 'build/perf.html').read_text()
out = head + top + sections + '\n</div>\n' + (root / 'build/foot.html').read_text() + js + '\n</body>\n</html>\n'
(root / 'public/pulse.html').write_text(out)
print(len(out))
