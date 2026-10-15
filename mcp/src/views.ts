/**
 * Interactive views shown inside the AI chat (see docs/chat-visuals-spec.md). Step 1: one static view, the
 * month summary. It is a single self-contained page: no outside requests, and it only shows the figures the
 * tool returned. The host sends the tool result to the view; the view reads the JSON that follows the summary
 * line of the text content.
 */

export const MONTH_VIEW_URI = 'ui://finbuddy/month-view'
export const VIEW_MIME = 'text/html;profile=mcp-app'

export const MONTH_VIEW_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FinBuddy month</title>
<style>
  :root { color-scheme: light dark; --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --in:#15803d; --out:#be123c; --bg:#ffffff; }
  @media (prefers-color-scheme: dark) { :root { --ink:#e2e8f0; --muted:#94a3b8; --line:#334155; --in:#4ade80; --out:#fb7185; --bg:#0f172a; } }
  body { margin:0; padding:16px; font:14px/1.4 system-ui, sans-serif; color:var(--ink); background:var(--bg); }
  h1 { font-size:16px; margin:0 0 4px; }
  .sub { color:var(--muted); font-size:12px; margin-bottom:12px; }
  .kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:14px; }
  .kpi { border:1px solid var(--line); border-radius:10px; padding:8px; }
  .kpi b { display:block; font-size:15px; }
  .kpi span { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
  .row { display:grid; grid-template-columns:minmax(80px,1fr) 2fr auto; gap:8px; align-items:center; margin:6px 0; }
  .bar { height:8px; background:var(--line); border-radius:4px; overflow:hidden; }
  .bar i { display:block; height:100%; background:var(--out); }
  .amt { font-variant-numeric:tabular-nums; white-space:nowrap; }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); margin:14px 0 6px; }
  .series { display:flex; align-items:flex-end; gap:6px; height:90px; }
  .series div { flex:1; text-align:center; font-size:11px; color:var(--muted); }
  .series i { display:block; background:var(--in); border-radius:3px 3px 0 0; min-height:2px; }
  .note { color:var(--muted); font-size:11px; margin-top:12px; }
</style>
</head>
<body>
<h1 id="title">Your month</h1>
<div class="sub" id="sub">Waiting for your FinBuddy figures…</div>
<div class="kpis">
  <div class="kpi"><span>Money in</span><b id="in">–</b></div>
  <div class="kpi"><span>Money out</span><b id="out">–</b></div>
  <div class="kpi"><span>Left over</span><b id="net">–</b></div>
</div>
<h2>Spending by category</h2>
<div id="cats"></div>
<h2>Last six periods, money in</h2>
<div class="series" id="series"></div>
<div class="note" id="basis"></div>
<script>
(function () {
  var money = function (n, cur) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'EUR' }).format(n); }
    catch (e) { return (Math.round(n * 100) / 100).toFixed(2) + ' ' + (cur || 'EUR'); }
  };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); };

  // The tool's text is "summary line" + blank line + JSON. Only the JSON is used.
  function readData(result) {
    var text = (result && result.content || []).filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text; }).join('\\n');
    var i = text.indexOf('\\n\\n');
    try { return JSON.parse(i >= 0 ? text.slice(i + 2) : text); } catch (e) { return null; }
  }

  function render(d) {
    if (!d || !d.totals) return;
    var cur = d.currency || 'EUR';
    document.getElementById('title').textContent = d.period && d.period.label ? d.period.label : 'Your month';
    document.getElementById('sub').textContent = (d.period ? d.period.start + ' to ' + d.period.end : '') + (d.fell_back_to_calendar ? ' · calendar months (no salary credits yet)' : '');
    document.getElementById('in').textContent = money(d.totals.income, cur);
    document.getElementById('out').textContent = money(d.totals.spending, cur);
    document.getElementById('net').textContent = money(d.totals.net, cur);

    var cats = (d.categories || []).filter(function (c) { return c.amount > 0 || c.previous_amount > 0; });
    var max = Math.max.apply(null, [1].concat(cats.map(function (c) { return c.amount; })));
    document.getElementById('cats').innerHTML = cats.map(function (c) {
      var change = c.previous_amount > 0 ? Math.round((c.amount - c.previous_amount) / c.previous_amount * 100) : null;
      var tag = change === null ? '' : ' (' + (change > 0 ? '+' : '') + change + '%)';
      return '<div class="row"><span>' + esc(c.category) + '</span><div class="bar"><i style="width:' + Math.round(c.amount / max * 100) + '%"></i></div><span class="amt">' + money(c.amount, cur) + esc(tag) + '</span></div>';
    }).join('') || '<div class="note">No spending in this period.</div>';

    var s = d.series || [];
    var sMax = Math.max.apply(null, [1].concat(s.map(function (p) { return p.income; })));
    document.getElementById('series').innerHTML = s.map(function (p) {
      return '<div><i style="height:' + Math.round(p.income / sMax * 80) + 'px"></i>' + esc(p.start.slice(5, 7)) + '</div>';
    }).join('');

    document.getElementById('basis').textContent = d.basis || '';
  }

  // Hosts send the tool result to the view as a JSON-RPC notification.
  window.addEventListener('message', function (ev) {
    var msg = ev.data;
    if (!msg || msg.method !== 'ui/notifications/tool-result') return;
    render(readData(msg.params));
  });
})();
</script>
</body>
</html>
`
