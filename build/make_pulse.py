import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'public/index.html').read_text().split('\n')
head = (root / 'public/pulse-head.html').read_text()
top = (root / 'public/pulse-top.html').read_text()

# sections: lines 117..279 (1-based), with the tile block 118..150 swapped for KPI cards
sec = src[116:279]
tiles_start = next(i for i, l in enumerate(sec) if 'id="cc-tiles"' in l)
grid_start = next(i for i, l in enumerate(sec) if l.strip() == '<div class="cc-grid">')
sec = sec[:tiles_start] + [
  '    <div class="kpi-row" id="cc-tiles"></div>',
  '    <ul class="legend" aria-label="Legend"><li><span class="i-actual">●</span> Actual</li><li><span class="i-short">▼</span> Shortfall</li><li><span class="i-over">▲</span> At or above target</li><li><span class="i-warn">◆</span> Watch</li></ul>',
] + sec[grid_start:]
sections = '\n'.join(sec)
sections = re.sub(r' role="tabpanel" aria-labelledby="tab-\w+"', '', sections)
sections = sections.replace('Click a brand to see its items in Stock &amp; cover', 'Click a brand to filter the page to it')
sections = sections.replace('show under Customers &amp; margin', 'show under Customers &amp; Margin')

js = '\n'.join(src[281:])

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

# pages: sidebar links instead of tabs
start = js.index('  // ---------- pages ----------')
end = js.index('  const start = (location.hash')
js = js[:start] + (root / 'build/pages.js').read_text() + js[end:]
sub("$('#cc-asof').textContent = fmtDate(String(r.as_of).slice(0, 10));", "$('#cc-asof').textContent = d3.utcFormat('%-d %b %Y')(new Date(String(r.as_of).slice(0, 10) + 'T00:00:00Z'));")
sub("dash.setParams({ brand: r.brand }); showPage('stock');", "dash.setParams({ brand: r.brand });", 2)

out = head + top + sections + '\n</div>\n' + (root / 'build/foot.html').read_text() + js + '\n</body>\n</html>\n'
(root / 'public/pulse.html').write_text(out)
print(len(out))
