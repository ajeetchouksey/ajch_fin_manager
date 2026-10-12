// Finance Manager front-end — plain JS, no build step.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const api = async (url, opts = {}) => {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || r.statusText);
  return j;
};
const eur = (v, d = 0) => (v < 0 ? "−" : "") + "€" + Math.abs(Number(v || 0)).toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: d });
const inr = (v) => (v < 0 ? "−" : "") + "₹" + Math.abs(Number(v || 0)).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const lakh = (v) => "₹" + (v / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 1 }) + "L";
const money = (v, c) => (c === "INR" ? inr(v) : eur(v));
const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const toast = (m) => { const t = $("#toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2600); };
const kpi = (l, v, s = "", extra = "") => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div>${extra}</div>`;
const meter = (f, color) => `<div class="meter"><i style="width:${Math.max(0, Math.min(1, f)) * 100}%;${color ? "background:" + color : ""}"></i></div>`;
const daysTo = (d) => Math.ceil((new Date(d) - new Date(new Date().toDateString())) / 864e5);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

// ---------------- theme & charts ----------------
window.toggleTheme = () => {
  const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("fm-theme", next); } catch (e) { }
  const active = $(".tab.on")?.id; if (active) loaders[active]?.();
};
// category colours stay neutral so blue/red always mean EUR/INR
const palette = () => ["#5b4bd6", "#fbbf24", "#34d399", "#f472b6", "#fb923c", "#2dd4bf", "#c4b5fd", "#64748b"];
const charts = {};
function chart(id, cfg) {
  if (!window.Chart) return;
  Chart.defaults.font.family = css("--body"); Chart.defaults.color = css("--muted");
  Chart.defaults.borderColor = css("--line");
  Chart.defaults.plugins.tooltip.backgroundColor = "#16223a"; Chart.defaults.plugins.tooltip.borderColor = "rgba(169,155,255,.3)"; Chart.defaults.plugins.tooltip.borderWidth = 1;
  charts[id]?.destroy();
  cfg.options = { responsive: true, maintainAspectRatio: false, animation: { duration: 700 }, ...(cfg.options || {}) };
  charts[id] = new Chart($("#" + id), cfg);
}
const doughnut = (labels, data, center) => ({ type: "doughnut",
  data: { labels, datasets: [{ data, backgroundColor: palette(), borderColor: css("--paper"), borderWidth: 3, hoverOffset: 6 }] },
  options: { cutout: "68%", plugins: { legend: { position: innerWidth < 760 ? "bottom" : "right", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 12 } },
    tooltip: { callbacks: { label: (c) => ` ${c.label}: ${eur(c.raw)}` } } } },
  plugins: center ? [{ id: "c", afterDraw(ch) { const { ctx, chartArea: a } = ch; const x = (a.left + a.right) / 2, y = (a.top + a.bottom) / 2;
    ctx.save(); ctx.textAlign = "center"; ctx.fillStyle = css("--ink"); ctx.font = `600 22px ${css("--display")}`; ctx.fillText(center[0], x, y + 2);
    ctx.fillStyle = css("--muted"); ctx.font = `500 11px ${css("--body")}`; ctx.fillText(center[1], x, y + 20); ctx.restore(); } }] : [] });
function areaGradient(ctx, color) {
  const g = ctx.chart.ctx.createLinearGradient(0, ctx.chart.chartArea?.top || 0, 0, ctx.chart.chartArea?.bottom || 300);
  g.addColorStop(0, color + "55"); g.addColorStop(1, color + "00"); return g;
}

// ---------------- tabs ----------------
const loaders = {};
window.go = (tab) => $(`#tabs button[data-tab="${tab}"]`)?.click();
$$("#tabs button").forEach((b) => b.onclick = () => {
  $$("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
  $$(".tab").forEach((t) => t.classList.toggle("on", t.id === b.dataset.tab));
  history.replaceState(null, "", "#" + b.dataset.tab); scrollTo({ top: 0 });
  b.scrollIntoView({ block: "nearest", inline: "center" });
  loaders[b.dataset.tab]?.();
  loadFx();
});
async function loadFx() { try { const s = await api("/api-settings"); $$(".fxval").forEach((e) => e.textContent = "₹" + (+s.fx_inr_per_eur).toFixed(2)); } catch (e) { } }

// ---------------- generic edit dialog ----------------
function dialog(title, fields, row, onSave, onDelete) {
  const f = $("#dlgForm");
  f.innerHTML = `<h3>${title}</h3>` + fields.map(([k, label, type = "text", opts]) => {
    const v = row[k] ?? "";
    if (type === "select") return `<label>${label}<select name="${k}">${opts.map((o) => `<option ${o == v ? "selected" : ""}>${o}</option>`).join("")}</select></label>`;
    if (type === "checkbox") return `<label><input type="checkbox" name="${k}" ${v ? "checked" : ""}> ${label}</label>`;
    if (type === "textarea") return `<label>${label}<textarea name="${k}" rows="3">${esc(v)}</textarea></label>`;
    return `<label>${label}<input name="${k}" type="${type}" step="any" value="${esc(v)}"></label>`;
  }).join("") + `<div style="display:flex;gap:8px;justify-content:space-between;margin-top:8px">
    ${onDelete && row.id ? '<button type="button" class="ghost" id="dlgDel">Delete</button>' : "<span></span>"}
    <span style="display:flex;gap:6px"><button type="button" class="ghost" id="dlgCancel">Cancel</button><button>Save</button></span></div>`;
  const d = $("#dlg"); d.showModal();
  $("#dlgCancel").onclick = () => d.close();
  if ($("#dlgDel")) $("#dlgDel").onclick = async () => { await onDelete(row.id); d.close(); toast("Deleted"); };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const out = { ...row };
    fields.forEach(([k, , type]) => {
      const el = f.elements[k];
      out[k] = type === "checkbox" ? (el.checked ? 1 : 0) : type === "number" ? (el.value === "" ? null : +el.value) : el.value;
    });
    try { await onSave(out); d.close(); toast("Saved"); } catch (err) { toast(err.message); }
  };
}

// ---------------- "Ask Claude" shortcut ----------------
window.askClaude = (q) => {
  go("chat");
  setTimeout(() => { CHAT_ID = null; drawEmpty(); const t = $("#prompt"); t.value = q; autosize(); t.focus(); }, 350);
};
function urgencyRing(days, size = 64) {
  const r = 26, c = 2 * Math.PI * r, f = days == null ? 1 : Math.max(0, Math.min(1, days / 45));
  const col = days == null ? css("--lilac") : days <= 31 ? css("--bad") : days <= 62 ? css("--gold") : css("--good");
  return `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="${r}" stroke="rgba(148,163,184,.18)"/>
    <circle cx="32" cy="32" r="${r}" stroke="${col}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - f)}" style="filter:drop-shadow(0 0 4px ${col})"/></svg>`;
}

// ---------------- deadline timeline (shared) ----------------
function countdown(due) {
  if (!due) return `<span class="count">ongoing</span>`;
  const d = daysTo(due);
  const cls = d <= 31 ? "hot" : d <= 62 ? "warm" : "";
  return `<span class="count ${cls}">${d < 0 ? Math.abs(d) + " days late" : d === 0 ? "today" : d + " days"}</span>`;
}
function timeline(items, { actions = false, compact = false } = {}) {
  let month = "";
  return items.map((c) => {
    const dt = c.due ? new Date(c.due) : null;
    const m = dt ? `${MON[dt.getMonth()]} ${dt.getFullYear()}` : "Every time";
    const head = !compact && m !== month ? `<div class="tl-month">${m}</div>` : ""; month = m;
    const sev = c.status === "done" ? "done" : c.severity;
    return head + `<div class="tl-item ${c.country} ${c.status === "done" ? "done" : ""}">
      <div class="tl-date">${dt ? `<b>${dt.getDate()}</b><span>${MON[dt.getMonth()]}</span>` : `<b>∞</b><span>always</span>`}</div>
      <div><div class="tl-title">${esc(c.title)}</div>
        <div class="tl-meta"><span class="tag ${c.country}">${c.country === "IN" ? "India" : "Germany"}</span>
        ${sev !== "normal" ? `<span class="tag ${sev}">${sev === "critical" ? "Critical" : sev === "high" ? "Important" : "Done"}</span>` : ""}
        ${compact ? countdown(c.due) : ""}</div></div>
      ${actions ? `<div class="tl-actions">${countdown(c.due)}<button class="sm ${c.status === "done" ? "ghost" : ""}" onclick="toggleCal(${c.id})">${c.status === "done" ? "Reopen" : "Mark done"}</button>
        ${c.status !== "done" ? `<button class="sm ghost ask" onclick='askClaude(${JSON.stringify("Explain in simple words what I need to do for: " + c.title + " — and how, step by step.").replace(/'/g, "&#39;")})'>Ask assistant</button>` : ""}</div>` : ""}
      ${actions ? `<details><summary>What to do &amp; why</summary><p>${esc(c.detail)}</p><p class="hint">Source: ${esc(c.source || "")}</p></details>` : ""}
    </div>`;
  }).join("");
}

// ---------------- POSITION ----------------
let ITEMS = [];
loaders.position = async () => {
  const [p, items] = await Promise.all([api("/calc/position"), api("/api/items")]);
  ITEMS = items; loadFx();
  const n = p.net_worth, fx = p.fx;
  $("#posDate").textContent = "Position · " + new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const eurItems = [], inrItems = [];
  const acc = await api("/money/accounts").catch(() => ({ accounts: [] }));
  acc.accounts.filter((a) => a.in_networth && a.balance > 0).sort((a, b) => b.balance - a.balance).forEach((a) => (a.currency === "INR" ? inrItems : eurItems).push([a.name, a.balance, a.currency]));
  items.filter((i) => i.kind === "asset").forEach((i) => (i.currency === "INR" ? inrItems : eurItems).push([i.name, i.amount, i.currency]));
  const hasINR = (PROFILE?.currencies || ["EUR", "INR"]).includes("INR") || inrItems.length > 0;
  if (!hasINR) { eurItems.push(...inrItems); }
  const eurTot = (n.by_currency.EUR || 0), inrTotEur = (n.by_currency.INR || 0);
  const share = n.assets_eur ? eurTot / n.assets_eur : 0.5;
  const hist = p.history, prev = hist.length > 1 ? hist[hist.length - 2].net_worth_eur : null;
  const li = (arr, c) => arr.slice(0, 4).map(([nm, a]) => `<li><span>${esc(nm.split(" — ")[0])}</span><span>${money(a, c)}</span></li>`).join("") ||
    `<li><span class="muted">Nothing entered yet</span><span></span></li>`;
  $("#ledger").innerHTML = `
    <div class="ledger-top"><div><div class="eyebrow">Net worth</div><div class="nw">${eur(n.net_worth_eur)}</div></div>
      <div class="delta">${prev !== null ? `${n.net_worth_eur >= prev ? "▲" : "▼"} ${eur(Math.abs(n.net_worth_eur - prev))} since last visit` : "Your first snapshot — check back next month"}
      ${n.liabilities_eur ? `<br>after ${eur(n.liabilities_eur)} of debts` : ""}</div></div>
    <div class="ledger-cols">
      <div class="lcol eur"><div class="where">${hasINR ? "Euros" : "Your money"}</div><div class="amt">${eur(eurTot)}</div><div class="conv">${pct(share, 0)} of what you own</div><ul>${li(eurItems, "EUR")}</ul></div>
      ${hasINR ? `<div class="pivot"><div class="rate"><small>today</small>1 € = ₹${fx.toFixed(2)}</div></div>
      <div class="lcol inr"><div class="where">Rupees</div><div class="amt">${inr(inrTotEur * fx)}</div><div class="conv">= ${eur(inrTotEur)} · ${pct(1 - share, 0)}</div><ul>${li(inrItems, "INR")}</ul></div>` : ""}
    </div>
    <div class="splitbar"><i class="e" style="width:0"></i><i class="r" style="width:0"></i></div>
    <div class="split-legend"><span><span class="dot eur"></span> EUR</span><span>${share < .35 ? "Most of your wealth is in rupees — a weaker rupee lowers it in euros." : share > .75 ? "Mostly euros — your spending currency." : "A fairly even split between the two currencies."}</span><span>INR <span class="dot inr"></span></span></div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => { $(".splitbar .e").style.width = share * 100 + "%"; $(".splitbar .r").style.width = (1 - share) * 100 + "%"; }));
  countUp($("#ledger .nw"), n.net_worth_eur);
  const cf = await api("/calc/cashflow").catch(() => null);
  $("#kpis").innerHTML =
    kpi(`<span class="dot good"></span>Cash cushion`, eur(n.liquid_eur), cf && cf.spend ? `${cf.emergency_months} months of spending` : "tick “liquid” on bank accounts", meter((cf?.emergency_months || 0) / 6)) +
    kpi(`<span class="dot gold"></span>You owe`, eur(n.liabilities_eur), n.liabilities_eur ? "loans & cards" : "no debts entered") +
    kpi(`<span class="dot eur"></span>Savings rate`, cf && cf.spend ? pct(cf.savings_rate, 0) : "—", cf && cf.spend ? eur(cf.savings) + " a month" : "add spending in Plan", meter((cf?.savings_rate || 0) / .3, css("--eur"))) +
    (HAS_GERA ? kpi(`<span class="dot inr"></span>Gera still to pay`, lakh(p.gera.remaining_with_gst), `≈ ${eur(p.gera.remaining_with_gst / fx)} incl. GST`, meter(p.gera.paid_pct, css("--inr"))) : "");
  $$(".only-gera").forEach((el) => el.hidden = !HAS_GERA);
  $$("#position .g-hero").forEach((el) => el.classList.toggle("solo", !HAS_GERA));
  $("#ledger").classList.toggle("one", !hasINR);
  if (HAS_GERA) { drawTower(p.gera, fx); drawGeraJourney(p.gera, fx); }
  drawAttention(p.open_deadlines);
  loadAnalysis();
  $("#nextDeadlines").innerHTML = timeline(p.open_deadlines, { compact: true }) || `<div class="empty">Nothing open.</div>`;
  chart("chCat", doughnut(Object.keys(n.by_category), Object.values(n.by_category), [eur(n.assets_eur), "you own"]));
  drawOutlook(hist, n.net_worth_eur, cf?.savings || 0);
  $("#itemsTbl").innerHTML = `<thead><tr><th>Name</th><th>Type</th><th class="n">Amount</th><th>Liquid</th><th>Updated</th></tr></thead><tbody>` +
    (items.map((i) => `<tr class="click" onclick="editItem(${i.id})"><td>${esc(i.name)}${i.note ? `<div class="hint" style="font-weight:400">${esc(i.note)}</div>` : ""}</td>
      <td data-l="Type">${i.kind === "liability" ? "▼ " : ""}${esc(i.category)}</td><td class="n" data-l="Amount">${money(i.amount, i.currency)}<span class="cur ${i.currency}">${i.currency}</span></td>
      <td data-l="Liquid">${i.liquid ? "✓" : "—"}</td><td class="muted" data-l="Updated">${i.updated || ""}</td></tr>`).join("") ||
      `<tr><td colspan="5"><div class="empty">No accounts yet.<br><button class="sm" onclick="editItem()">＋ Add your first account</button></div></td></tr>`) + "</tbody>";
};
function drawAttention(items) {
  const open = items.filter((c) => c.due);
  const top = open.slice().sort((a, b) => (a.severity === "critical" ? -1 : 0) - (b.severity === "critical" ? -1 : 0) || a.due.localeCompare(b.due))[0];
  if (!top) { $("#attention").innerHTML = ""; return; }
  const d = daysTo(top.due), more = open.filter((c) => daysTo(c.due) <= 45).length - 1;
  const q = "Explain in simple words what I need to do for: " + top.title + " — and how, step by step.";
  $("#attention").innerHTML = `<div class="attn">
    <div class="urg">${urgencyRing(d)}<div class="c"><div><b>${d}</b><span>days</span></div></div></div>
    <div class="what"><div class="eyebrow">Needs your attention · ${top.country === "IN" ? "India" : "Germany"}</div><div class="t">${esc(top.title)}</div>
      <p class="hint">Due ${new Date(top.due).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}${more > 0 ? ` · ${more} more item${more > 1 ? "s" : ""} due within 45 days` : ""}</p></div>
    <div class="acts"><button class="sm ask" id="attnAsk">Ask the assistant how</button><button class="sm ghost" onclick="go('tax')">Open tax desk</button></div></div>`;
  $("#attnAsk").onclick = () => askClaude(q);
}
function drawGeraJourney(g, fx) {
  const pts = g.payments.map((p) => ({ x: +new Date(p.date), y: p.cumulative, l: p.label }));
  const last = pts[pts.length - 1];
  const proj = [last, ...g.projection.map((p) => ({ x: +new Date(p.date), y: p.cumulative, l: p.label }))];
  const today = +new Date(new Date().toDateString());
  const col = css("--lilac");
  chart("chGera", { type: "line", data: { datasets: [
      { label: "Paid", data: pts, stepped: "before", borderColor: col, borderWidth: 2.5, pointRadius: 3.5, pointBackgroundColor: col, fill: true, backgroundColor: (c) => areaGradient(c, "#a99bff") },
      { label: "Still to come (estimate)", data: proj, stepped: "before", borderColor: col, borderDash: [6, 5], borderWidth: 2, pointRadius: 3, pointBackgroundColor: css("--paper"), pointBorderColor: col },
      { label: "Total price", data: [{ x: pts[0].x, y: g.consideration }, { x: +new Date("2027-12-31"), y: g.consideration }], borderColor: "rgba(148,163,184,.45)", borderDash: [2, 4], borderWidth: 1, pointRadius: 0 },
    ] },
    options: { parsing: false, interaction: { mode: "nearest", intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        title: (i) => new Date(i[0].raw.x).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        label: (c) => c.dataset.label === "Total price" ? ` Total price ${inr(c.raw.y)}` : ` ${c.raw.l || ""}: ${inr(c.raw.y)} paid (≈ ${eur(c.raw.y / fx)})` } } },
      scales: { x: { type: "linear", min: pts[0].x, max: +new Date("2028-01-31"), grid: { display: false },
          ticks: { stepSize: 182.6 * 864e5, callback: (v) => { const d = new Date(v); return MON[d.getMonth()] + " " + String(d.getFullYear()).slice(2); } } },
        y: { min: 0, ticks: { maxTicksLimit: 5, callback: (v) => lakh(v) } } } },
    plugins: [{ id: "today", afterDraw(ch) { const x = ch.scales.x.getPixelForValue(today), { top, bottom } = ch.chartArea; const k = ch.ctx;
      k.save(); k.strokeStyle = "rgba(52,211,153,.6)"; k.setLineDash([3, 3]); k.beginPath(); k.moveTo(x, top); k.lineTo(x, bottom); k.stroke();
      k.fillStyle = css("--good"); k.font = `500 10px ${css("--num")}`; k.fillText("TODAY", x + 5, top + 10); k.restore(); } }] });
  $("#geraNote").textContent = `${pct(g.paid_pct, 0)} of the price paid over ${pts.length} payments since Aug 2023. The dashed line spreads the 7 remaining stages evenly up to the contract possession date — actual timing follows Gera's invoices, and construction is running behind.`;
}
function drawOutlook(hist, nw, savings) {
  const now = new Date(), labels = [], proj = [], past = [];
  const h = hist.slice(-6);
  h.forEach((x) => { labels.push(x.day.slice(5)); past.push(x.net_worth_eur); proj.push(null); });
  proj[proj.length - 1] = nw;
  for (let m = 1; m <= 12; m++) { const d = new Date(now.getFullYear(), now.getMonth() + m, 1); labels.push(MON[d.getMonth()] + " " + String(d.getFullYear()).slice(2)); past.push(null); proj.push(nw + savings * m); }
  const col = css("--eur");
  chart("chHist", { type: "line", data: { labels, datasets: [
      { label: "So far", data: past, borderColor: col, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: col, tension: .3 },
      { label: "Outlook", data: proj, borderColor: col, borderDash: [6, 5], borderWidth: 2, pointRadius: 0, fill: true, backgroundColor: (c) => areaGradient(c, "#38bdf8"), tension: .3 }] },
    options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${eur(c.raw)}` } } },
      scales: { y: { ticks: { maxTicksLimit: 5, callback: (v) => "€" + Math.round(v / 1000) + "k" } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } } } } });
  $("#outlookNote").textContent = savings > 0
    ? `Saving ${eur(savings)} a month adds about ${eur(savings * 12)} in a year — reaching ≈ ${eur(nw + savings * 12)} by ${labels[labels.length - 1]}, before any investment growth or currency moves.`
    : "Add your take-home pay (Settings) and spending (Plan) to see where your net worth is heading.";
}
function countUp(el, target) {
  if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const t0 = performance.now(), dur = 900;
  const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = eur(target * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function drawTower(g, fx) {
  const paid = g.stages.filter((s) => s.paid).length;
  const floors = g.stages.map((s, i) => {
    const cls = s.paid ? "paid" : i === paid ? "now" : "";
    const label = s.paid ? (s.no === "02" ? "" : s.name.replace("Agreement signing", "Signing")) : "";
    return `<div class="floor ${cls}" style="animation-delay:${i * 45}ms" title="Stage ${s.no} · ${esc(s.name)}${s.paid ? " · paid " + s.paid : ""}"><span>${s.no}</span>${cls === "now" ? "" : `<span>${esc(label)}</span>`}</div>`;
  }).join("");
  const perStage = 703008 * 1.05;
  $("#gera").innerHTML = `<div class="tower-wrap">
    <div class="tower">${floors}<div class="roof">Possession</div></div>
    <div class="tower-facts">
      <div class="eyebrow">Paid so far</div><div class="big">${pct(g.paid_pct, 0)}</div>
      <div class="hint">${inr(g.paid_consideration)} of ${inr(g.consideration)}</div>
      <div class="kv">
        <span class="k">Stages paid</span><span class="v num">${paid} of 17</span>
        <span class="k">Next stage</span><span class="v num">≈ ${lakh(perStage)}</span>
        <span class="k">Still to pay</span><span class="v num">${inr(g.remaining_with_gst)}</span>
        <span class="k">TDS deposited</span><span class="v num">${inr(g.tds_deposited)}</span>
        <span class="k">TDS credit</span><span class="v num pos">+${inr(g.tds_credit)}</span>
        <span class="k">Possession</span><span class="v num">Dec 2027</span>
      </div>
      <div class="warnline">⚠ Construction is about 10 months behind the tentative schedule — watch the Dec 2027 date.</div>
    </div></div>`;
}
const ITEM_CATS = ["Cash · bank account", "Cash · Tagesgeld/savings", "Fixed deposit", "Retirement · EPF/PPF/NPS",
  "Retirement · German pension/bAV", "Property (under construction)", "Property", "Vehicle", "Other asset",
  "Home loan", "Personal loan", "Credit card", "Other debt"];
window.editItem = (id) => {
  const row = ITEMS.find((i) => i.id === id) || { kind: "asset", currency: "EUR", liquid: 0, country: "DE" };
  dialog(id ? "Edit account" : "Add account, asset or debt", [["name", "Name"], ["kind", "Own or owe?", "select", ["asset", "liability"]],
    ["category", "Type", "select", ITEM_CATS], ["amount", "Current value / balance", "number"],
    ["currency", "Currency", "select", ["EUR", "INR"]], ["country", "Country", "select", ["DE", "IN"]],
    ["liquid", "Liquid (reachable within a week)", "checkbox"], ["note", "Note", "textarea"]], row,
    async (r) => { await api("/api/items", { method: "POST", body: r }); loaders.position(); },
    async (i) => { await api("/api/items/" + i, { method: "DELETE" }); loaders.position(); });
};

// ---------------- GOALS ----------------
let GOALS = [];
function ring(frac, color) {
  const r = 46, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac));
  return `<div class="ring"><svg viewBox="0 0 108 108"><circle class="bg" cx="54" cy="54" r="${r}"/>
    <circle class="fg" cx="54" cy="54" r="${r}" stroke="${color}" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-off="${c * (1 - f)}"/></svg>
    <div class="c"><div><b>${Math.round(frac * 100)}%</b><span>funded</span></div></div></div>`;
}
loaders.goals = async () => {
  const [calc, raw] = await Promise.all([api("/calc/goals"), api("/api/goals")]);
  GOALS = raw;
  const on = calc.goals.filter((g) => g.status === "on_track").length;
  const nearest = calc.goals.slice().sort((a, b) => a.months - b.months)[0];
  $("#goalKpis").innerHTML = kpi("Goals", calc.goals.length, `${on} on track`, meter(calc.goals.length ? on / calc.goals.length : 0)) +
    kpi("Needed each month", eur(calc.total_required_monthly_eur), "all goals, in euros") +
    kpi("Nearest goal", nearest ? `<span class="txt">${esc(nearest.name.split(" (")[0])}</span>` : "—", nearest ? nearest.months + " months away" : "");
  $("#goalCards").innerHTML = calc.goals.map((g) => {
    const color = g.status === "on_track" ? css("--good") : g.status === "close" ? css("--gold") : g.currency === "INR" ? css("--inr") : css("--eur");
    const f = (v) => money(v, g.currency);
    const by = new Date(); by.setMonth(by.getMonth() + g.months);
    return `<div class="card"><h3>${esc(g.name)} <span class="right"><span class="pill ${g.status}">${g.verdict}</span><button class="sm ghost" onclick="editGoal(${g.id})">Edit</button></span></h3>
      <div class="goal">${ring(g.progress_pct, color)}
        <div><div class="eyebrow">Save each month</div><div class="need">${f(g.required_monthly)}<small> / month</small></div>
          <div class="hint">Target ${f(g.target_future)} by ${MON[by.getMonth()]} ${by.getFullYear()} · ${g.months} months</div></div>
        <div class="goal-foot">${esc(g.explanation)}${g.note ? `<div class="hint" style="margin-top:6px">${esc(g.note)}</div>` : ""}</div></div>
      <div class="chartbox short" style="margin-top:10px"><canvas id="gch${g.id}"></canvas></div></div>`;
  }).join("") || `<div class="empty">No goals yet. <button class="sm" onclick="editGoal()">＋ Add a goal</button></div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => $$(".ring .fg").forEach((c) => c.style.strokeDashoffset = c.dataset.off)));
  calc.goals.forEach((g) => {
    const col = g.currency === "INR" ? css("--inr") : css("--eur");
    chart("gch" + g.id, { type: "line", data: { labels: g.path.map((p) => "m" + p.month),
      datasets: [{ label: "Projected", data: g.path.map((p) => p.balance), borderColor: col, borderWidth: 2.5, fill: true, backgroundColor: (c) => areaGradient(c, col), tension: .3, pointRadius: 0 },
                 { label: "Target", data: g.path.map((p) => p.target), borderColor: css("--gold"), borderDash: [5, 5], borderWidth: 2, pointRadius: 0 }] },
      options: { plugins: { legend: { position: "bottom", labels: { boxWidth: 10, usePointStyle: true } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${money(c.raw, g.currency)}` } } },
        scales: { x: { ticks: { maxTicksLimit: 6 }, grid: { display: false } }, y: { ticks: { maxTicksLimit: 4, callback: (v) => g.currency === "INR" ? lakh(v) : "€" + (v / 1000).toFixed(0) + "k" } } } } });
  });
};
window.editGoal = (id) => {
  const row = GOALS.find((g) => g.id === id) || { currency: "EUR", annual_return: 0.05, inflation: 0.02, priority: 2, saved: 0, monthly: 0 };
  dialog(id ? "Edit goal" : "New goal", [["name", "Goal"], ["target_today", "Cost in today's money", "number"],
    ["currency", "Currency", "select", ["EUR", "INR"]], ["target_date", "Needed by", "date"],
    ["saved", "Already set aside", "number"], ["monthly", "Saving per month", "number"],
    ["annual_return", "Expected growth per year (0.05 = 5%)", "number"], ["inflation", "Inflation per year (0.02 = 2%)", "number"],
    ["priority", "Priority (1 = must, 3 = nice)", "select", [1, 2, 3]], ["note", "Note", "textarea"]], row,
    async (r) => { await api("/api/goals", { method: "POST", body: r }); loaders.goals(); },
    async (i) => { await api("/api/goals/" + i, { method: "DELETE" }); loaders.goals(); });
};

// ---------------- PLAN ----------------
let EXP = [];
const EXP_CATS = ["Rent / Warmmiete", "Utilities & internet", "Groceries", "Transport", "Insurance", "Childcare & school",
  "Eating out", "Shopping", "Travel", "Subscriptions", "Support to family (India)", "Loan EMI", "Other"];
loaders.plan = async () => {
  const [cf, exp] = await Promise.all([api("/calc/cashflow"), api("/api/expenses")]);
  EXP = exp;
  $("#cfKpis").innerHTML = kpi("Take-home", eur(cf.income), "per month") + kpi("Spending", eur(cf.spend), exp.length + " categories") +
    kpi("Saved", `<span class="${cf.savings >= 0 ? "pos" : "neg"}">${eur(cf.savings)}</span>`, `savings rate ${pct(cf.savings_rate, 0)} · aim 20%+`, meter(cf.savings_rate / .3)) +
    kpi("Emergency cover", cf.emergency_months + " mo", "cash ÷ monthly spending · aim 3–6", meter(cf.emergency_months / 6, css("--eur")));
  const pal = palette(), sorted = exp.slice().sort((a, b) => b.amount - a.amount);
  const segs = sorted.map((e, i) => [e.category, e.amount, pal[i % pal.length]]);
  if (cf.savings > 0) segs.push(["Saved", cf.savings, css("--good")]);
  const tot = Math.max(cf.income, cf.spend) || 1;
  $("#flow").innerHTML = cf.income || exp.length ? `<div class="flowbar">${segs.map(([n, a, c]) => `<div style="flex-grow:${a};background:${c}" title="${esc(n)}: ${eur(a)}">${a / tot > .09 ? esc(n.split(" ")[0]) + " " + pct(a / tot, 0) : ""}</div>`).join("")}</div>
    <div class="flowlegend">${segs.map(([n, a, c]) => `<span><i style="background:${c}"></i>${esc(n)} <b class="num">${eur(a)}</b></span>`).join("")}</div>`
    : `<div class="empty">Add your take-home pay in Settings and your spending here to see where the money goes.</div>`;
  $("#expTbl").innerHTML = `<thead><tr><th>Category</th><th class="n">€ / month</th><th class="n">Share</th></tr></thead><tbody>` +
    (sorted.map((e) => `<tr class="click" onclick="editExpense(${e.id})"><td>${esc(e.category)}${e.note ? ` <span class="hint">${esc(e.note)}</span>` : ""}</td>
      <td class="n" data-l="€ / month">${eur(e.amount)}</td><td class="n" data-l="Share">${cf.income ? pct(e.amount / cf.income, 0) : "—"}</td></tr>`).join("") ||
      `<tr><td colspan="3"><div class="empty">No spending yet.<br><button class="sm" onclick="editExpense()">＋ Add a category</button></div></td></tr>`) + "</tbody>";
  drawRule(cf, exp);
  $("#cfTips").innerHTML = (cf.tips.length ? cf.tips : ["Add income and spending to get suggestions."]).map((t) => `<li>${esc(t)}</li>`).join("");
  const act = cf.actuals || {};
  $("#cfSrc").innerHTML = "Take-home pay from: " + esc(cf.income_source) + (act.count ? ` · <b>Actual (Money tab, last ${act.months} months):</b> in ${eur(act.income)}/month, out ${eur(act.expense)}/month` : " · Log real income and spending in <b>Money</b> to compare with this plan.");
};
const WANTS = ["Eating out", "Shopping", "Travel", "Subscriptions", "Other"];
function drawRule(cf, exp) {
  if (!cf.income) { $("#rule").innerHTML = `<div class="empty">Set your take-home pay in Settings to see the check.</div>`; return; }
  const wants = exp.filter((e) => WANTS.includes(e.category)).reduce((a, e) => a + e.amount, 0);
  const needs = cf.spend - wants, save = Math.max(cf.savings, 0);
  const rows = [["Needs", "rent, food, childcare, insurance, family support", needs, .5, "#5b4bd6", "under"],
                ["Wants", "eating out, shopping, travel, subscriptions", wants, .3, "#f472b6", "under"],
                ["Savings", "what's left each month", save, .2, css("--good"), "over"]];
  $("#rule").innerHTML = `<div class="rule">${rows.map(([n, sub, v, t, c, dir]) => {
    const f = v / cf.income, ok = dir === "under" ? f <= t : f >= t;
    return `<div class="rule-row"><div class="name">${n}<small>${sub}</small></div>
      <div class="rule-track"><i style="width:0;background:${c};box-shadow:0 0 12px ${c}66" data-w="${Math.min(f, 1) * 100}%"></i><b style="left:${t * 100}%" data-t="${t * 100}% target"></b></div>
      <div class="val">${eur(v)} · ${pct(f, 0)}<em class="${ok ? "pos" : "neg"}">${ok ? "✓ on target" : dir === "under" ? "above target" : "below target"}</em></div></div>`;
  }).join("")}</div>
  <div class="rule-verdict">${save / cf.income >= .2 ? `You save ${pct(save / cf.income, 0)} of your pay — above the 20% rule of thumb. The next question is where that money goes: goals first, then investing.` :
    `You save ${pct(save / cf.income, 0)} of your pay. Reaching 20% means finding about ${eur(cf.income * .2 - save)} a month — start with the biggest "wants" line.`}</div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => $$("#rule .rule-track i").forEach((i) => i.style.width = i.dataset.w)));
}
window.editExpense = (id) => {
  const row = EXP.find((e) => e.id === id) || {};
  dialog(id ? "Edit spending" : "Add spending", [["category", "Category", "select", EXP_CATS], ["amount", "€ per month", "number"], ["note", "Note"]], row,
    async (r) => { await api("/api/expenses", { method: "POST", body: r }); loaders.plan(); },
    async (i) => { await api("/api/expenses/" + i, { method: "DELETE" }); loaders.plan(); });
};

// ---------------- INVEST ----------------
let HOLD = [];
loaders.invest = async () => {
  const [h, s] = await Promise.all([api("/api/holdings"), api("/api-settings")]);
  HOLD = h; const fx = +s.fx_inr_per_eur;
  let val = 0, cost = 0; const alloc = {};
  const rows = h.map((x) => {
    const px = x.last_price ?? x.avg_cost; const v = x.qty * px, c = x.qty * x.avg_cost;
    const k = x.currency === "INR" ? 1 / fx : 1; val += v * k; cost += c * k;
    alloc[x.asset_type] = (alloc[x.asset_type] || 0) + v * k;
    const g = v - c;
    return `<tr class="click" onclick="editHolding(${x.id})"><td>${esc(x.name)}<div class="hint" style="font-weight:400">${esc(x.ticker || "no ticker")}${x.account ? " · " + esc(x.account) : ""}</div></td>
      <td data-l="Type">${esc(x.asset_type)}</td><td class="n" data-l="Units">${x.qty}</td>
      <td class="n" data-l="Price">${money(px, x.currency)}<div class="hint">${x.price_date || "manual"}</div></td><td class="n" data-l="Value">${money(v, x.currency)}</td>
      <td class="n ${g >= 0 ? "pos" : "neg"}" data-l="Gain">${g >= 0 ? "+" : ""}${money(g, x.currency)}<div class="hint">${c ? pct(g / c) : ""}</div></td></tr>`;
  });
  $("#holdTbl").innerHTML = `<thead><tr><th>Holding</th><th>Type</th><th class="n">Units</th><th class="n">Price</th><th class="n">Value</th><th class="n">Gain</th></tr></thead><tbody>` +
    (rows.join("") || `<tr><td colspan="6"><div class="empty">No holdings yet — add your ETF Sparplan, Indian funds, shares or EPF.<br><button class="sm" onclick="editHolding()">＋ Add a holding</button></div></td></tr>`) + "</tbody>";
  $("#invKpis").innerHTML = kpi("Invested value", eur(val)) + kpi("Paid in", eur(cost)) +
    kpi("Gain / loss", `<span class="${val - cost >= 0 ? "pos" : "neg"}">${val - cost >= 0 ? "+" : ""}${eur(val - cost)}</span>`, cost ? pct((val - cost) / cost) + " overall" : "");
  chart("chAlloc", doughnut(Object.keys(alloc), Object.values(alloc), [eur(val), "invested"]));
};
window.editHolding = (id) => {
  const row = HOLD.find((x) => x.id === id) || { asset_type: "ETF", currency: "EUR", country: "DE" };
  dialog(id ? "Edit holding" : "Add holding", [["name", "Name (e.g. Vanguard FTSE All-World)"], ["ticker", "Yahoo ticker (optional)"],
    ["asset_type", "Type", "select", ["ETF", "Mutual fund", "Stock", "Bond", "Gold", "Crypto", "Retirement"]],
    ["account", "Where (broker/bank)"], ["country", "Country", "select", ["DE", "IN"]],
    ["qty", "Units", "number"], ["avg_cost", "Average buy price per unit", "number"],
    ["currency", "Currency", "select", ["EUR", "INR"]], ["last_price", "Current price (blank = automatic)", "number"]], row,
    async (r) => { await api("/api/holdings", { method: "POST", body: r }); loaders.invest(); },
    async (i) => { await api("/api/holdings/" + i, { method: "DELETE" }); loaders.invest(); });
};
window.refreshPrices = async () => {
  $("#refreshMsg").textContent = "Refreshing prices…";
  try { const r = await api("/calc/refresh-prices", { method: "POST", body: {} }); $("#refreshMsg").textContent = r.messages.join(" · "); toast("Prices refreshed"); }
  catch (e) { $("#refreshMsg").textContent = e.message; }
  loadFx(); loaders.invest();
};

// ---------------- LEARN ----------------
const formData = (f) => Object.fromEntries([...new FormData(f)].filter(([, v]) => !(v instanceof File)));
$("#btForm").onsubmit = async (e) => {
  e.preventDefault(); const f = e.target; const body = formData(f);
  body.cost_pct = +body.cost_pct / 100;
  if (f.file.files[0]) body.csv = await f.file.files[0].text();
  $("#btOut").className = ""; $("#btOut").textContent = "Running…";
  try {
    const r = await api("/calc/backtest", { method: "POST", body });
    const m = r.metrics, b = r.buy_hold;
    const row = (l, a, bb, cls = "") => `<tr><td>${l}</td><td class="n ${cls}" data-l="Rule">${a}</td><td class="n ${cls}" data-l="Buy & hold">${bb}</td></tr>`;
    $("#btOut").innerHTML = `<table class="rt"><thead><tr><th></th><th class="n">Rule</th><th class="n">Buy &amp; hold</th></tr></thead><tbody>
      ${row("Ended with", eur(m.final), eur(b.final))}${row("Growth per year", pct(m.cagr), pct(b.cagr))}
      ${row("Worst fall", pct(m.max_drawdown, 0), pct(b.max_drawdown, 0), "neg")}${row("Bumpiness", pct(m.volatility, 0), pct(b.volatility, 0))}
      ${row("Return per risk", m.sharpe, b.sharpe)}</tbody></table>
      <div class="result">${esc(r.verdict)}</div><p class="hint">Data: ${esc(r.source)} · ${m.years} years</p>`;
    chart("chBt", { type: "line", data: { labels: r.series.map((s) => s.d), datasets: [
      { label: "Rule", data: r.series.map((s) => s.s), borderColor: css("--eur"), borderWidth: 2, pointRadius: 0, fill: true, backgroundColor: (c) => areaGradient(c, css("--eur")) },
      { label: "Buy & hold", data: r.series.map((s) => s.b), borderColor: css("--muted"), borderWidth: 1.5, pointRadius: 0 }] },
      options: { interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, usePointStyle: true } } },
        scales: { x: { ticks: { maxTicksLimit: 6 }, grid: { display: false } } } } });
  } catch (err) { $("#btOut").innerHTML = `<p class="err">${esc(err.message)}</p>`; }
};
$("#sipForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const r = await api("/calc/sip", { method: "POST", body: formData(e.target) });
    $("#sipOut").innerHTML = `<div class="result"><div class="big">${eur(r.value)}</div>${esc(r.explanation)}<div class="hint">Data: ${esc(r.source)}</div></div>`;
    chart("chSip", { type: "line", data: { labels: r.series.map((s) => s.d.slice(0, 7)), datasets: [
      { label: "Worth", data: r.series.map((s) => s.value), borderColor: css("--good"), borderWidth: 2.5, pointRadius: 0, fill: true, backgroundColor: (c) => areaGradient(c, css("--good")) },
      { label: "Paid in", data: r.series.map((s) => s.invested), borderColor: css("--gold"), borderDash: [5, 5], borderWidth: 2, pointRadius: 0 }] },
      options: { interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, usePointStyle: true } } },
        scales: { x: { ticks: { maxTicksLimit: 6 }, grid: { display: false } } } } });
  } catch (err) { $("#sipOut").innerHTML = `<p class="err">${esc(err.message)}</p>`; }
};
loaders.learn = async () => {
  const p = await api("/calc/paper");
  $("#paperKpis").innerHTML = kpi("Account value", eur(p.total_value, 2), `started with ${eur(p.start)}`) +
    kpi("Return", `<span class="${p.total_return >= 0 ? "pos" : "neg"}">${p.total_return >= 0 ? "+" : ""}${pct(p.total_return)}</span>`) +
    kpi("Pretend cash", eur(p.cash, 2), "", meter(p.cash / p.start, css("--eur"))) + kpi("Realised profit", eur(p.realized_pnl, 2), "from sells");
  const pos = Object.entries(p.positions);
  $("#paperPos").innerHTML = `<thead><tr><th>Ticker</th><th class="n">Units</th><th class="n">Avg cost</th><th class="n">Price</th><th class="n">Value</th><th class="n">Unrealised</th></tr></thead><tbody>` +
    (pos.map(([t, x]) => `<tr><td>${esc(t)}</td><td class="n" data-l="Units">${x.qty}</td><td class="n" data-l="Avg cost">${x.avg_cost}</td><td class="n" data-l="Price">${x.price}</td><td class="n" data-l="Value">${eur(x.value, 2)}</td>
      <td class="n ${x.unrealized >= 0 ? "pos" : "neg"}" data-l="Unrealised">${eur(x.unrealized, 2)}</td></tr>`).join("") || `<tr><td colspan="6"><div class="empty">No positions. Try buying a few units of an ETF.</div></td></tr>`) + "</tbody>";
  $("#paperHist").innerHTML = `<thead><tr><th>When</th><th>Side</th><th>Ticker</th><th class="n">Units</th><th class="n">Price</th><th></th></tr></thead><tbody>` +
    p.trades.slice().reverse().map((t) => `<tr><td>${t.ts.replace("T", " ")}</td><td data-l="Side">${t.side}</td><td data-l="Ticker">${esc(t.ticker)}</td><td class="n" data-l="Units">${t.qty}</td><td class="n" data-l="Price">${t.price}</td>
      <td data-l=""><button class="link" onclick="delTrade(${t.id})">undo</button></td></tr>`).join("") + "</tbody>";
};
$("#paperForm").onsubmit = async (e) => {
  e.preventDefault(); $("#paperErr").textContent = "";
  const b = formData(e.target); ["qty", "price", "fee"].forEach((k) => b[k] = +b[k]); b.ticker = b.ticker.trim().toUpperCase();
  try { await api("/api/paper_trades", { method: "POST", body: b }); toast("Pretend order placed"); e.target.qty.value = ""; loaders.learn(); }
  catch (err) { $("#paperErr").textContent = err.message; }
};
window.getQuote = async (e) => {
  e.preventDefault(); const f = $("#paperForm");
  try { const q = await api("/calc/quote/" + encodeURIComponent(f.ticker.value.trim())); f.price.value = q.price; }
  catch (err) { $("#paperErr").textContent = err.message; }
};
window.delTrade = async (id) => { await api("/api/paper_trades/" + id, { method: "DELETE" }); loaders.learn(); };

// ---------------- TAX ----------------
let CAL = [];
loaders.tax = async () => { CAL = await api("/api/calendar"); drawCal(); };
function drawCal() {
  const show = $("#showDone").checked, open = CAL.filter((c) => c.status !== "done");
  const soon = open.filter((c) => c.due && daysTo(c.due) <= 45).length;
  const done = CAL.length - open.length, health = CAL.length ? done / CAL.length : 0;
  $("#taxKpis").innerHTML = `<div class="kpi gauge">${ring(health, health > .7 ? css("--good") : health > .35 ? css("--gold") : css("--lilac")).replace("funded", "done")}
      <div><div class="l">Compliance</div><div class="v">${done}/${CAL.length}</div><div class="s">${open.length} open · mark items done as you go</div></div></div>` +
    kpi(`<span class="dot" style="background:var(--bad)"></span>Due within 45 days`, `<span class="${soon ? "neg" : "pos"}">${soon}</span>`, soon ? "act on these first" : "nothing urgent") +
    kpi(`<span class="dot inr"></span>India`, open.filter((c) => c.country === "IN").length, "open items") +
    kpi(`<span class="dot eur"></span>Germany`, open.filter((c) => c.country === "DE").length, "open items");
  $("#calendar").innerHTML = timeline(CAL.filter((c) => show || c.status !== "done"), { actions: true });
  requestAnimationFrame(() => requestAnimationFrame(() => $$("#taxKpis .ring .fg").forEach((c) => c.style.strokeDashoffset = c.dataset.off)));
}
$("#showDone").onchange = drawCal;
window.toggleCal = async (id) => {
  const c = CAL.find((x) => x.id === id); c.status = c.status === "done" ? "open" : "done";
  await api("/api/calendar", { method: "POST", body: c }); drawCal(); toast(c.status === "done" ? "Marked done" : "Reopened");
};
const checks = (f, body) => { $$("input[type=checkbox]", f).forEach((c) => body[c.name] = c.checked); return body; };
$("#deForm").onsubmit = async (e) => {
  e.preventDefault(); const b = checks(e.target, formData(e.target));
  const r = await api("/calc/tax/de/refund", { method: "POST", body: b });
  $("#deOut").innerHTML = `<div class="result"><div class="eyebrow">${r.refund >= 0 ? "Estimated refund" : "Estimated back-payment"}</div>
    <div class="big ${r.refund >= 0 ? "pos" : "neg"}">${eur(Math.abs(r.refund))}</div>${esc(r.explanation)}
    <div class="kpis" style="margin-top:10px">${kpi("Income tax", eur(r.income_tax))}${kpi("Average rate", pct(r.average_rate))}${kpi("Marginal rate", pct(r.marginal_rate, 0), "on your next €100")}</div></div>`;
};
$("#inForm").onsubmit = async (e) => {
  e.preventDefault(); const b = checks(e.target, formData(e.target));
  const r = await api("/calc/tax/in", { method: "POST", body: b });
  const row = (l, k) => `<tr><td>${l}</td><td class="n" data-l="New">${inr(r.new[k])}</td><td class="n" data-l="Old">${inr(r.old[k])}</td></tr>`;
  $("#inOut").innerHTML = `<div class="result"><div class="eyebrow">Better choice</div><div class="big">${r.better === "new" ? "New" : "Old"} regime <span class="pos" style="font-size:16px">saves ${inr(r.saving)}</span></div>${esc(r.explanation)}</div>
    <table class="rt" style="margin-top:10px"><thead><tr><th></th><th class="n">New</th><th class="n">Old</th></tr></thead><tbody>
    ${row("Taxable income", "taxable_normal_income")}${row("Slab tax", "slab_tax")}${row("Rebate 87A", "rebate_87a")}
    ${row("Capital-gains tax", "capital_gains_tax")}${row("Surcharge", "surcharge")}${row("Cess 4%", "cess")}${row("Total", "total")}</tbody></table>`;
};
$("#cgForm").onsubmit = async (e) => {
  e.preventDefault(); const b = checks(e.target, formData(e.target));
  const r = await api("/calc/tax/de/capital", { method: "POST", body: b });
  $("#cgOut").innerHTML = `<div class="result"><div class="big">${eur(r.total)}</div>${esc(r.explanation)}</div>`;
};

// ---------------- SETTINGS ----------------
const GLOSS = {
  "Net worth": "What you own minus what you owe.",
  "Liquid": "Money you can get within days without a big loss — bank, Tagesgeld, ETFs. A flat under construction is not liquid.",
  "Inflation": "Prices rising over time. At 2% a year, €100 today buys what €82 does in 10 years.",
  "CAGR": "Average yearly growth rate, as if growth had been perfectly steady.",
  "Drawdown": "A fall from a previous high. −35% means €10,000 briefly became €6,500.",
  "ETF": "A fund traded on the stock exchange that cheaply tracks an index, such as the whole world market.",
  "TER": "A fund's yearly fee as a share of your money. 0.2% is cheap, 1.5% is expensive.",
  "Sparplan / SIP": "Automatic monthly investment of a fixed amount.",
  "zvE": "German taxable income after all deductions.",
  "Werbungskosten": "German work-related expenses; €1,230 is allowed automatically.",
  "Abgeltungsteuer": "German flat tax (~26.4% incl. Soli) on interest, dividends and gains.",
  "Freistellungsauftrag": "An instruction to a German bank to pay investment income tax-free up to your €1,000 / €2,000 allowance.",
  "NRI": "Non-Resident Indian for tax: generally fewer than 182 days in India in a financial year.",
  "NRE / NRO": "Indian accounts for NRIs. NRE holds foreign money, repatriable, interest tax-free in India. NRO holds Indian income, taxed in India.",
  "TDS": "Tax deducted at source — the payer withholds tax and pays it to the government, like your 1% on the Gera flat.",
  "26QB / Form 141": "The form a flat buyer uses to deposit the 1% TDS. 26QB until March 2026; Form 141 under the new 2025 Act.",
  "DTAA": "The India–Germany tax treaty — decides which country taxes what and credits tax paid in the other.",
  "Form 10F / TRC": "Documents you give an Indian bank to get the lower treaty rate (10%) on interest.",
};
loaders.settings = async () => {
  const s = await api("/api-settings"); const f = $("#setForm");
  ["fx_inr_per_eur", "monthly_income_eur", "paper_starting_cash"].forEach((k) => f.elements[k].value = s[k] ?? "");
  loadClaudeSettings();
  loadDrive();
  $("#gloss").innerHTML = Object.entries(GLOSS).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
};
$("#setForm").onsubmit = async (e) => { e.preventDefault(); await api("/api-settings", { method: "POST", body: formData(e.target) }); toast("Settings saved"); loadFx(); };

// ---------------- ASK CLAUDE ----------------
let CHAT_ID = null, STREAMING = false, META = null;
const md = (t) => window.marked && window.DOMPurify ? DOMPurify.sanitize(marked.parse(t || "", { breaks: false, gfm: true })) : esc(t).replace(/\n/g, "<br>");
const SUGGESTIONS = [
  ["📊", "Where do I stand financially?", "net worth, cash, what's missing"],
  ["⏰", "What tax deadlines should I act on first?", "Germany + India, most urgent first"],
  ["🧾", "Explain the Stage 07 TDS late fee in simple words", "and what to do before 30 Oct"],
  ["🏗️", "How much should I save each month for the Gera flat?", "stages 11–17 incl. GST"],
  ["🇩🇪", "Do I have to file a German tax return every year?", "tax class III/V vs IV"],
  ["🇮🇳", "How is my Indian interest taxed in Germany and India?", "NRE, NRO, FD and the treaty"],
  ["🌱", "What is an ETF Sparplan and is it right for me?", "explained for a beginner"],
  ["🧪", "Backtest trend-following on the MSCI World", "and explain the result"],
];
const SUGGESTIONS_GENERIC = [
  ["📊", "Where do I stand financially?", "net worth, cash, what's missing"],
  ["🛟", "How big should my emergency fund be?", "and how long to build it"],
  ["🎯", "Can I afford my goals?", "monthly savings needed vs what's left over"],
  ["⏰", "Which deadlines should I act on first?", "most urgent first"],
  ["🌱", "What is an ETF savings plan and is it right for me?", "explained for a beginner"],
  ["💱", "How do exchange rates affect my savings?", "if you hold more than one currency"],
];
function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; }
loaders.chat = async () => {
  loadFx();
  META = await api("/chat/meta");
  $("#modelPick").hidden = META.provider !== "api";
  $("#modelPick").innerHTML = Object.entries(META.models).map(([k, v]) => `<option value="${k}" ${k === META.model ? "selected" : ""}>${v.split(" — ")[0]}</option>`).join("");
  await drawChatList();
  if (CHAT_ID) openChat(CHAT_ID); else drawEmpty();
};
async function drawChatList() {
  const list = await api("/chat/list");
  const today = new Date().toISOString().slice(0, 10);
  let last = "";
  $("#chatList").innerHTML = list.map((c) => {
    const d = (c.updated || "").slice(0, 10), label = d === today ? "Today" : d;
    const head = label !== last ? `<div class="day">${label}</div>` : ""; last = label;
    return head + `<div class="ci ${c.id === CHAT_ID ? "on" : ""}" onclick="openChat(${c.id})"><span title="${esc(c.title)}">${esc(c.title)}</span>
      <button onclick="event.stopPropagation();delChat(${c.id})" title="Delete chat" aria-label="Delete chat">✕</button></div>`;
  }).join("") || `<p class="hint" style="padding:4px 8px">Your conversations will appear here.</p>`;
}
function drawEmpty() {
  if (META && !META.ready) {
    $("#msgs").innerHTML = `<div class="keycard"><div class="hello" style="margin:0"><div class="mark">✦</div></div><h3 style="text-align:center">Choose an assistant</h3>
      <p>The assistant is optional — every other part of the app works without it. Pick how you'd like to connect:</p>
      <div id="aiProvidersChat" class="provlist" role="radiogroup" aria-label="AI assistant"></div>
      <p class="hint">Your question and a summary of your numbers are sent to the company behind the option you pick (Anthropic or Google).</p></div>`;
    drawProviders($("#aiProvidersChat"), META, () => loaders.chat());
    return;
  }
  if (false) {
    $("#msgs").innerHTML = `<div class="keycard"><div class="hello" style="margin:0"><div class="mark">✦</div></div><h3 style="text-align:center">Connect Claude</h3>
      <p>Paste your Anthropic API key to start chatting. It stays on this laptop.</p>
      <form id="keyQuick" class="form"><input name="k" type="password" placeholder="sk-ant-…" required><button>Connect</button></form>
      <p class="hint">Create one at <b>platform.claude.com → Settings → API keys</b>. API use is billed separately from Claude Pro — typically $2–15 a month.</p></div>`;
    $("#keyQuick").onsubmit = async (e) => { e.preventDefault(); await api("/api-settings", { method: "POST", body: { anthropic_api_key: e.target.k.value } }); toast("Claude connected"); loaders.chat(); };
    return;
  }
  $("#msgs").innerHTML = `<div class="hello"><div class="mark">✦</div><h2>${greeting()}, ${esc(META.user_name || "")}</h2>
    <p class="muted">Ask about your money, goals or taxes. Answers use your own numbers, in plain English.${META.provider !== "api" ? ` <br><small>Using ${esc(META.provider_label.split(" — ")[0])}: answers come from a snapshot of your numbers.</small>` : ""}</p>
    <div class="sugg">${(PROFILE?.legacy ? SUGGESTIONS : SUGGESTIONS_GENERIC).map(([i, q, s]) => `<button onclick="askSuggest(this)" data-q="${esc(q)}"><span class="si">${i}</span><span>${esc(q)}<small>${esc(s)}</small></span></button>`).join("")}</div></div>`;
}
window.askSuggest = (b) => { $("#prompt").value = b.dataset.q; send(); };
window.newChat = () => { CHAT_ID = null; drawEmpty(); drawChatList(); $("#chatSide").classList.remove("open"); $("#prompt").focus(); };
window.delChat = async (id) => { await api("/chat/" + id, { method: "DELETE" }); if (CHAT_ID === id) CHAT_ID = null; loaders.chat(); };
window.openChat = async (id) => {
  CHAT_ID = id; $("#chatSide").classList.remove("open");
  const c = await api("/chat/" + id);
  $("#msgs").innerHTML = c.messages.map((m) => m.role === "user" ? userMsg(m.text) : aiMsg(m.text, m.tools)).join("");
  scrollDown(true); drawChatList();
};
const userMsg = (t) => `<div class="msg user"><div class="bub">${esc(t)}</div></div>`;
const aiMsg = (t, tools = []) => `<div class="msg ai"><div class="ai-ico">✦</div><div class="ai-body">
  ${tools.length ? `<div class="chips">${[...new Set(tools)].map((x) => `<span class="chip done">${esc(x)}</span>`).join("")}</div>` : ""}${md(t)}</div></div>`;
function scrollDown(force) { const m = $("#msgs"); if (force || m.scrollHeight - m.scrollTop - m.clientHeight < 160) m.scrollTop = m.scrollHeight; }
async function send() {
  const ta = $("#prompt"), text = ta.value.trim();
  if (!text || STREAMING) return;
  if (!META?.ready) { drawEmpty(); return; }
  if (!CHAT_ID) $("#msgs").innerHTML = "";
  ta.value = ""; autosize();
  $("#msgs").insertAdjacentHTML("beforeend", userMsg(text) +
    `<div class="msg ai" id="live"><div class="ai-ico">✦</div><div class="ai-body"><div class="chips"></div><div class="txt cursor"></div></div></div>`);
  scrollDown(true);
  STREAMING = true; $("#sendBtn").disabled = true; $("#chatStatus").textContent = "Thinking…";
  const live = $("#live"), chipsEl = $(".chips", live), txtEl = $(".txt", live);
  let buf = "", changed = false, pending = false;
  const render = () => { if (pending) return; pending = true; requestAnimationFrame(() => { txtEl.innerHTML = md(buf); pending = false; scrollDown(); }); };
  try {
    const r = await fetch("/chat/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: CHAT_ID, text }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.detail || r.statusText); }
    const reader = r.body.getReader(), dec = new TextDecoder();
    let pend = "";
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      pend += dec.decode(value, { stream: true });
      let i;
      while ((i = pend.indexOf("\n\n")) >= 0) {
        const block = pend.slice(0, i); pend = pend.slice(i + 2);
        const ev = (block.match(/^event: (.*)$/m) || [])[1], data = JSON.parse((block.match(/^data: (.*)$/m) || [, "{}"])[1]);
        if (ev === "chat") { CHAT_ID = data.id; drawChatList(); }
        else if (ev === "text") { buf += data.t; $("#chatStatus").textContent = "Writing…"; render(); }
        else if (ev === "tool") { chipsEl.insertAdjacentHTML("beforeend", `<span class="chip run" data-n="${data.name}">${esc(data.label)}</span>`); $("#chatStatus").textContent = data.label + "…"; scrollDown(); }
        else if (ev === "tool_done") { const c = chipsEl.querySelector(`.chip.run[data-n="${data.name}"]`); if (c) c.className = "chip done"; if (data.changed) changed = true; }
        else if (ev === "proposal") { live.querySelector(".ai-body").insertAdjacentHTML("beforeend", proposalCard(data)); scrollDown(); }
        else if (ev === "error") { txtEl.insertAdjacentHTML("beforeend", `<p class="err-inline">⚠ ${esc(data.message)}</p>`); }
        else if (ev === "done") { $$(".chip.run", chipsEl).forEach((c) => c.className = "chip done"); }
      }
    }
  } catch (e) {
    txtEl.insertAdjacentHTML("beforeend", `<p class="err-inline">⚠ ${esc(e.message)}</p>`);
  } finally {
    txtEl.classList.remove("cursor"); if (buf) txtEl.innerHTML = md(buf);
    live.removeAttribute("id"); STREAMING = false; $("#sendBtn").disabled = false; $("#chatStatus").textContent = "";
    if (changed) toast("The assistant updated your data");
    drawChatList(); scrollDown();
  }
}
// suggested changes from Claude Code / Gemini CLI: nothing happens until Apply
function proposalCard(p) {
  return `<div class="proposal" data-id="${esc(p.id)}"><div><b>Suggested change</b><span>${esc(p.label)}</span></div>
    <div class="acts"><button class="sm" onclick="applyProposal(this)">Apply</button><button class="sm ghost" onclick="this.closest('.proposal').classList.add('dismissed')">Dismiss</button></div></div>`;
}
window.applyProposal = async (btn) => {
  const card = btn.closest(".proposal"); btn.disabled = true;
  try { const r = await api("/chat/apply", { method: "POST", body: { id: card.dataset.id } }); card.classList.add("applied"); card.querySelector(".acts").innerHTML = `<span class="ok">✓ Applied</span>`; toast("Applied: " + r.label); }
  catch (e) { btn.disabled = false; toast(e.message); }
};
function autosize() { const t = $("#prompt"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 220) + "px"; }
$("#prompt").addEventListener("input", autosize);
$("#prompt").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
$("#composer").onsubmit = (e) => { e.preventDefault(); send(); };
$("#modelPick").onchange = async (e) => { await api("/api-settings", { method: "POST", body: { claude_model: e.target.value } }); toast("Model: " + e.target.selectedOptions[0].text); };
async function loadClaudeSettings() {
  const [s, m] = await Promise.all([api("/api-settings"), api("/chat/meta")]);
  const f = $("#claudeForm");
  drawProviders($("#aiProviders"), m, () => loadClaudeSettings());
  f.style.display = m.provider === "api" ? "" : "none";
  $("#apiHint").style.display = f.style.display;
  $("#modelSet").innerHTML = Object.entries(m.models).map(([k, v]) => `<option value="${k}" ${k === s.claude_model ? "selected" : ""}>${v}</option>`).join("");
  f.claude_web_search.checked = s.claude_web_search !== "0";
  $("#keyHint").textContent = s.anthropic_key_set ? `Key saved (${s.anthropic_key_hint}). Leave blank to keep it.` : "No key saved yet.";
}
$("#claudeForm").onsubmit = async (e) => {
  e.preventDefault(); const f = e.target;
  await api("/api-settings", { method: "POST", body: { anthropic_api_key: f.anthropic_api_key.value, claude_model: f.claude_model.value, claude_web_search: f.claude_web_search.checked ? "1" : "0" } });
  f.anthropic_api_key.value = ""; toast("Claude settings saved"); loadClaudeSettings();
};

// ---------------- MONEY ----------------
const CAT_ICON = { "Salary": "💼", "Bonus": "🎯", "Interest": "🏦", "Dividends": "📈", "Rent received": "🏠", "Tax refund": "🧾", "Gift": "🎁", "Sale of asset": "🔁", "Other income": "➕",
  "Rent / Warmmiete": "🏠", "Utilities & internet": "💡", "Groceries": "🛒", "Transport": "🚆", "Insurance": "🛡️", "Childcare & school": "🎒", "Eating out": "🍽️", "Shopping": "🛍️",
  "Travel": "✈️", "Subscriptions": "🔁", "Health": "🩺", "Support to family (India)": "🤝", "Loan EMI": "🏦", "Gera flat payment": "🏗️", "Taxes & fees": "🧾", "Investments / SIP": "🌱", "Other": "•" };
const MONEY = { ccy: "EUR", period: "month", anchor: new Date().toISOString().slice(0, 10), account: "", kind: "expense", meta: null, accts: [] };
try { MONEY.ccy = localStorage.getItem("fm-ccy") || "EUR"; } catch (e) { }
const fmtC = (v, c) => (c === "INR" ? inr(v) : eur(v, Math.abs(v) < 100 && v % 1 ? 2 : 0));
const shiftAnchor = (dir) => {
  const d = new Date(MONEY.anchor);
  if (MONEY.period === "day") d.setDate(d.getDate() + dir);
  else if (MONEY.period === "week") d.setDate(d.getDate() + 7 * dir);
  else if (MONEY.period === "month") d.setMonth(d.getMonth() + dir, 1);
  else d.setFullYear(d.getFullYear() + dir);
  MONEY.anchor = d.toISOString().slice(0, 10);
};
function periodLabel(s) {
  const a = new Date(s.start), b = new Date(s.end);
  if (s.period === "day") return a.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  if (s.period === "week") return `${a.getDate()} ${MON[a.getMonth()]} – ${b.getDate()} ${MON[b.getMonth()]}`;
  if (s.period === "month") return `${["January","February","March","April","May","June","July","August","September","October","November","December"][a.getMonth()]} ${a.getFullYear()}`;
  return String(a.getFullYear());
}
loaders.money = async () => {
  if (!MONEY.meta) MONEY.meta = await api("/money/meta");
  const q = new URLSearchParams({ period: MONEY.period, anchor: MONEY.anchor, display: MONEY.ccy }); if (MONEY.account) q.set("account", MONEY.account);
  const [acc, sum] = await Promise.all([api("/money/accounts"), api("/money/summary?" + q)]);
  MONEY.accts = acc.accounts;
  $$("#ccySeg button").forEach((b) => b.classList.toggle("on", b.dataset.c === MONEY.ccy));
  $$("#perSeg button").forEach((b) => b.classList.toggle("on", b.dataset.p === MONEY.period));
  // account groups
  const grp = (country, ccy, flag, label) => {
    const list = acc.accounts.filter((a) => a.country === country);
    const tot = list.filter((a) => a.currency === ccy).reduce((s, a) => s + a.balance, 0);
    return `<div class="acct-group ${country}"><h4>${flag} ${label} · ${ccy}<span class="tot">${fmtC(tot, ccy)}</span></h4><div class="acct-row">
      ${list.map((a) => `<div class="acct ${a.currency} ${String(a.id) === MONEY.account ? "sel" : ""}" onclick="pickAccount(${a.id})" tabindex="0">
        <button class="edit" onclick="event.stopPropagation();editAccount(${a.id})" aria-label="Edit account">✎</button>
        <div class="ty">${esc(a.type)}${a.institution ? " · " + esc(a.institution) : ""}</div><div class="nm">${esc(a.name)}</div>
        <div class="bal ${a.balance < 0 ? "neg" : ""}">${fmtC(a.balance, a.currency)}</div>
        <div class="io">+${fmtC(a.income, a.currency)} · −${fmtC(a.expense, a.currency)}</div></div>`).join("")}
      <div class="acct add" onclick="editAccount(null,'${country}')" tabindex="0">＋ Add ${country === "DE" ? "German" : "Indian"} account</div></div></div>`;
  };
  $("#acctGroups").innerHTML = grp("DE", "EUR", "🇩🇪", "Germany") + grp("IN", "INR", "🇮🇳", "India");
  // selects
  const opts = acc.accounts.map((a) => `<option value="${a.id}">${esc(a.name)} (${a.currency})</option>`).join("");
  $("#acctFilter").innerHTML = `<option value="">All accounts</option>` + opts; $("#acctFilter").value = MONEY.account;
  const f = $("#txForm");
  const keepA = f.account_id.value, keepT = f.to_account_id.value;
  f.account_id.innerHTML = opts || `<option value="">Add an account first</option>`; f.to_account_id.innerHTML = opts;
  if (keepA) f.account_id.value = keepA; if (keepT) f.to_account_id.value = keepT;
  if (!f.date.value) f.date.value = new Date().toISOString().slice(0, 10);
  setKind(MONEY.kind, true);
  // kpis
  $("#perLabel").textContent = periodLabel(sum);
  const c = MONEY.ccy, bc = sum.by_currency;
  $("#perKpis").innerHTML = kpi(`<span class="dot good"></span>Money in`, `<span class="pos">${fmtC(sum.income, c)}</span>`, `${eur(bc.EUR.income)} · ${inr(bc.INR.income)}`) +
    kpi(`<span class="dot" style="background:var(--bad)"></span>Money out`, fmtC(sum.expense, c), `${eur(bc.EUR.expense)} · ${inr(bc.INR.expense)}`) +
    kpi(`<span class="dot eur"></span>Left over`, `<span class="${sum.net >= 0 ? "pos" : "neg"}">${fmtC(sum.net, c)}</span>`, sum.income ? `${pct(Math.max(sum.net, 0) / sum.income, 0)} of income saved` : "") +
    kpi(`<span class="dot inr"></span>All accounts`, fmtC(c === "INR" ? acc.total_inr : acc.total_eur, c), `at ₹${acc.fx.toFixed(2)} per €`);
  // charts
  $("#trendSub").textContent = `last 6 ${MONEY.period}s · ${c}`;
  chart("chTrend", { type: "bar", data: { labels: sum.trend.map((t) => t.label), datasets: [
      { label: "In", data: sum.trend.map((t) => t.income), backgroundColor: "#34d399", borderRadius: 6, maxBarThickness: 26 },
      { label: "Out", data: sum.trend.map((t) => t.expense), backgroundColor: "#fb7185", borderRadius: 6, maxBarThickness: 26 }] },
    options: { plugins: { legend: { position: "bottom", labels: { boxWidth: 10, usePointStyle: true } }, tooltip: { callbacks: { label: (x) => ` ${x.dataset.label}: ${fmtC(x.raw, c)}` } } },
      scales: { x: { grid: { display: false } }, y: { ticks: { maxTicksLimit: 5, callback: (v) => c === "INR" ? lakh(v) : "€" + (v >= 1000 ? Math.round(v / 1000) + "k" : v) } } } } });
  const cats = Object.entries(sum.by_category);
  if (cats.length) chart("chCats", doughnut(cats.map((x) => x[0]), cats.map((x) => x[1]), [fmtC(sum.expense, c), "spent"]));
  else { charts.chCats?.destroy(); delete charts.chCats; }
  // transactions
  $("#txCount").textContent = sum.transactions.length ? `${sum.transactions.length} in this ${MONEY.period}` : "";
  let day = "";
  $("#txList").innerHTML = sum.transactions.map((t) => {
    const d = new Date(t.date), head = t.date !== day ? `<div class="txday"><span>${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span></div>` : ""; day = t.date;
    const sign = t.kind === "income" ? "+" : t.kind === "expense" ? "−" : "⇄ ";
    const title = t.kind === "transfer" ? `${esc(t.account)} → ${esc(t.to_account)}` : esc(t.note || t.category || (t.kind === "income" ? "Income" : "Expense"));
    const sub = t.kind === "transfer" ? `<span>Transfer</span>${t.note ? `<span>· ${esc(t.note)}</span>` : ""}` : `<span>${esc(t.category || "")}</span><span class="acctchip ${t.currency}">${esc(t.account)}</span>`;
    const conv = t.currency !== c && t.kind !== "transfer" ? `<small>≈ ${fmtC(t.currency === "EUR" ? t.amount * (MONEY.meta.fx) : t.amount / MONEY.meta.fx, c)}</small>` : t.kind === "transfer" ? `<small>→ ${fmtC(t.to_amount ?? t.amount, t.to_currency)}</small>` : "";
    return head + `<div class="tx ${t.kind}"><div class="ic">${t.kind === "transfer" ? "⇄" : CAT_ICON[t.category] || "•"}</div>
      <div><div class="t1">${title}</div><div class="t2">${sub}${t.recurring_id ? `<span class="rep">↻ repeating</span>` : ""}${t.doc_id ? `<span class="rep">📎</span>` : ""}</div></div>
      <div class="amt">${sign}${fmtC(t.amount, t.currency)}${conv}</div>
      ${t.recurring_id ? `<span></span>` : `<button class="del" onclick="delTx(${t.id})" aria-label="Delete" title="Delete">✕</button>`}</div>`;
  }).join("") || `<div class="empty">${acc.accounts.length ? `Nothing logged for this ${MONEY.period} yet — add an entry on the right.` : "Start by adding your accounts above, then log income and spending."}</div>`;
  drawRecurring(acc.recurring || []);
};
function drawRecurring(list) {
  const accts = Object.fromEntries(MONEY.accts.map((a) => [a.id, a]));
  $("#recList").innerHTML = list.map((r) => {
    const a = accts[r.account_id] || {}, fq = r.frequency[0].toUpperCase() + r.frequency.slice(1);
    return `<div class="recitem ${r.active ? "" : "paused"}"><div><div class="t1">${CAT_ICON[r.category] || (r.kind === "transfer" ? "⇄" : "•")} ${esc(r.note || r.category || r.kind)}</div>
      <div class="t2">${fq} · ${esc(a.name || "?")}${r.next ? ` · next ${new Date(r.next).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}${r.end_date ? ` · until ${r.end_date}` : ""}</div></div>
      <div class="amt ${r.kind === "income" ? "pos" : ""}">${r.kind === "income" ? "+" : r.kind === "expense" ? "−" : "⇄"}${fmtC(r.amount, a.currency)}</div>
      <div class="acts"><button class="sm ghost" onclick="toggleRec(${r.id})">${r.active ? "Pause" : "Resume"}</button><button class="sm ghost" onclick="delRec(${r.id})">Stop &amp; remove</button></div></div>`;
  }).join("") || `<p class="hint" style="margin:0">Salary, rent, SIPs, insurance… set "Repeats" when adding an entry and it's logged for you each time.</p>`;
}
window.pickAccount = (id) => { MONEY.account = String(MONEY.account) === String(id) ? "" : String(id); loaders.money(); };
window.delTx = async (id) => { await api("/api/transactions/" + id, { method: "DELETE" }); toast("Entry deleted"); loaders.money(); };
window.toggleRec = async (id) => { const r = (await api("/api/recurring")).find((x) => x.id === id); r.active = r.active ? 0 : 1; await api("/api/recurring", { method: "POST", body: r }); toast(r.active ? "Resumed" : "Paused"); loaders.money(); };
window.delRec = async (id) => { await api("/api/recurring/" + id, { method: "DELETE" }); toast("Repeating entry removed — past entries are kept"); loaders.money(); };
window.editAccount = (id, country) => {
  const row = MONEY.accts.find((a) => a.id === id) || { country: country || "DE", currency: country === "IN" ? "INR" : "EUR", type: country === "IN" ? "NRO account" : "Current account", opening_balance: 0, opening_date: new Date().toISOString().slice(0, 10), liquid: 1, in_networth: 1 };
  dialog(id ? "Edit account" : `Add ${row.country === "IN" ? "an Indian" : "a German"} account`, [["name", "Account name (e.g. Deutsche Bank Giro)"], ["institution", "Bank / broker"],
    ["country", "Country", "select", ["DE", "IN"]], ["currency", "Currency", "select", ["EUR", "INR"]], ["type", "Type", "select", MONEY.meta.account_types],
    ["opening_balance", "Balance on the start date", "number"], ["opening_date", "Start date", "date"],
    ["liquid", "Cash I can reach within a week", "checkbox"], ["in_networth", "Count in net worth", "checkbox"], ["archived", "Hide (closed account)", "checkbox"], ["note", "Note", "textarea"]], row,
    async (r) => { if (!r.name) throw new Error("Give the account a name"); await api("/api/accounts", { method: "POST", body: r }); loaders.money(); },
    async (i) => { await api("/api/accounts/" + i, { method: "DELETE" }); loaders.money(); });
};
function setKind(k, silent) {
  MONEY.kind = k;
  $$("#kindSeg button").forEach((b) => b.classList.toggle("on", b.dataset.k === k));
  const f = $("#txForm"), q = $(".quick");
  q.classList.toggle("transfer", k === "transfer");
  $("#acctLbl").textContent = k === "income" ? "Into account" : "From account";
  const cats = k === "income" ? MONEY.meta.income_categories : MONEY.meta.expense_categories;
  const keep = f.category.value;
  f.category.innerHTML = cats.map((x) => `<option>${x}</option>`).join("");
  if (cats.includes(keep)) f.category.value = keep;
  $("#txSubmit").textContent = { expense: "Add expense", income: "Add income", transfer: "Add transfer" }[k] + (f.frequency.value ? " (repeating)" : "");
  syncCcy();
}
function syncCcy() {
  const f = $("#txForm"), a = MONEY.accts.find((x) => String(x.id) === f.account_id.value);
  $("#amtCcy").textContent = a ? a.currency : "";
}
$$("#kindSeg button").forEach((b) => b.onclick = () => setKind(b.dataset.k));
$("#txForm").account_id.onchange = syncCcy;
$("#txForm").frequency.onchange = (e) => { $(".quick").classList.toggle("repeat", !!e.target.value); setKind(MONEY.kind); };
$$("#ccySeg button").forEach((b) => b.onclick = () => { MONEY.ccy = b.dataset.c; try { localStorage.setItem("fm-ccy", MONEY.ccy); } catch (e) { } loaders.money(); });
$$("#perSeg button").forEach((b) => b.onclick = () => { MONEY.period = b.dataset.p; loaders.money(); });
$("#perPrev").onclick = () => { shiftAnchor(-1); loaders.money(); };
$("#perNext").onclick = () => { shiftAnchor(1); loaders.money(); };
$("#acctFilter").onchange = (e) => { MONEY.account = e.target.value; loaders.money(); };
$("#txForm").onsubmit = async (e) => {
  e.preventDefault(); $("#txErr").textContent = "";
  const f = e.target, b = formData(f);
  const row = { kind: MONEY.kind, account_id: +b.account_id, amount: +b.amount, category: MONEY.kind === "transfer" ? null : b.category, note: b.note || null,
    to_account_id: MONEY.kind === "transfer" ? +b.to_account_id : null, to_amount: MONEY.kind === "transfer" && b.to_amount ? +b.to_amount : null };
  try {
    if (b.frequency) await api("/api/recurring", { method: "POST", body: { ...row, frequency: b.frequency, start_date: b.date, end_date: b.end_date || null, active: 1 } });
    else await api("/api/transactions", { method: "POST", body: { ...row, date: b.date, doc_id: f.dataset.doc ? +f.dataset.doc : null } });
    toast(b.frequency ? `Repeating ${MONEY.kind} set up` : `${MONEY.kind[0].toUpperCase() + MONEY.kind.slice(1)} added`);
    f.amount.value = ""; f.note.value = ""; f.to_amount.value = ""; f.frequency.value = ""; f.end_date.value = ""; delete f.dataset.doc;
    $(".quick").classList.remove("repeat"); setKind(MONEY.kind); loaders.money();
  } catch (err) { $("#txErr").textContent = err.message; }
};
window.prefillTx = async ({ amount, date, note, category, currency, doc }) => {
  go("money");
  await new Promise((r) => setTimeout(r, 450));
  setKind("expense");
  const f = $("#txForm");
  const acct = MONEY.accts.find((a) => a.currency === currency);
  if (acct) { f.account_id.value = acct.id; syncCcy(); }
  if (amount) f.amount.value = amount; if (date) f.date.value = date; if (note) f.note.value = note;
  if (category) f.category.value = category;
  if (doc) f.dataset.doc = doc;
  f.amount.focus(); toast("Check the details and press Add");
};

// ---------------- DOCUMENTS ----------------
const DOCS = { meta: null, lib: [], cat: "", q: "" };
const CAT_COLOR = { "Salary & payslips": "#34d399", "Tax — Germany": "#38bdf8", "Tax — India": "#a99bff", "Property — Gera flat": "#5b4bd6", "Bank statements": "#fbbf24",
  "Investments": "#2dd4bf", "Insurance": "#f472b6", "Receipts & bills": "#fb923c", "Social security & pension": "#94a3b8", "Employment": "#c4b5fd", "Career": "#e879f9", "Other": "#64748b" };
loaders.documents = async () => {
  DOCS.meta = await api("/docs/meta");
  const onDrive = DOCS.meta.source === "gdrive";
  $("#rootChip").textContent = (onDrive ? "☁ " : "📁 ") + DOCS.meta.source_label; $("#rootChip").title = DOCS.meta.root;
  $("#docsEyebrow").textContent = onDrive ? `Documents · from Google Drive${DOCS.meta.last_sync ? " · synced " + DOCS.meta.last_sync.slice(0, 16).replace("T", " ") : ""}` : "Documents · stored on this laptop";
  $("#docSync").hidden = !onDrive;
  DOCS.lib = await api("/docs/library");
  drawLibrary();
};
function drawLibrary() {
  const counts = {}; DOCS.lib.forEach((d) => counts[d.category] = (counts[d.category] || 0) + 1);
  $("#libCats").innerHTML = [["", `All (${DOCS.lib.length})`], ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, `${k} (${n})`])]
    .map(([k, l]) => `<button class="${DOCS.cat === k ? "on" : ""}" data-k="${esc(k)}">${k ? `<span class="catdot" style="background:${CAT_COLOR[k] || "#64748b"}"></span>` : ""}${esc(l)}</button>`).join("");
  $$("#libCats button").forEach((b) => b.onclick = () => { DOCS.cat = b.dataset.k; drawLibrary(); });
  const q = DOCS.q.toLowerCase();
  const rows = DOCS.lib.filter((d) => (!DOCS.cat || d.category === DOCS.cat) && (!q || d.path.toLowerCase().includes(q)));
  $("#libCount").textContent = `${rows.length} file${rows.length === 1 ? "" : "s"}`;
  $("#libTbl").innerHTML = `<thead><tr><th>File</th><th>Category</th><th>Folder</th><th class="n">Size</th></tr></thead><tbody>` + rows.slice(0, 300).map((d) => `<tr>
    <td><a href="/docs/open?path=${encodeURIComponent(d.path)}" target="_blank" rel="noopener" style="color:var(--ink)">${esc(d.name)}</a>${d.logged ? ` <span class="rep">filed here</span>` : ""}</td>
    <td data-l="Category"><span class="catdot" style="background:${CAT_COLOR[d.category] || "#64748b"}"></span>${esc(d.category)}</td>
    <td data-l="Folder" class="muted" style="font-size:12.5px">${esc(d.folder)}</td><td class="n" data-l="Size">${(d.size / 1024).toFixed(0)} KB</td></tr>`).join("") + "</tbody>";
}
$("#libSearch").oninput = (e) => { DOCS.q = e.target.value; drawLibrary(); };
const drop = $("#drop");
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => handleFiles([...e.dataTransfer.files]));
$("#fileIn").onchange = (e) => { const list = [...e.target.files]; e.target.value = ""; handleFiles(list); };
function readAsDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
async function handleFiles(files) {
  if (!DOCS.meta) DOCS.meta = await api("/docs/meta");
  for (const file of files) {
    const id = "q" + Math.random().toString(36).slice(2, 8);
    $("#queue").insertAdjacentHTML("afterbegin", `<div class="qcard" id="${id}"><div class="fileic">${esc((file.name.split(".").pop() || "").toUpperCase())}</div>
      <div><div class="qhead"><span class="nm">Reading ${esc(file.name)}…</span></div><div class="hint">Extracting text and working out what it is.</div></div></div>`);
    try {
      const a = await api("/docs/analyze", { method: "POST", body: { filename: file.name, data: await readAsDataURL(file) } });
      drawQueueCard(id, a);
    } catch (err) { $("#" + id).innerHTML = `<div class="fileic">!</div><div><div class="qhead"><span class="nm">${esc(file.name)}</span></div><p class="err">${esc(err.message)}</p></div>`; }
  }
}
function drawQueueCard(id, a) {
  const el = $("#" + id), c = a.confidence, col = c >= .85 ? "var(--good)" : c >= .6 ? "var(--gold)" : "var(--bad)";
  const F = a.fields || {}, chips = [];
  if (F.dates?.length) chips.push(["date", F.dates[0]]);
  if (F.amount) chips.push(["amount", (F.currency === "EUR" ? eur(F.amount, 2) : inr(F.amount))]);
  ["invoice_no", "ack_no", "cin", "bank_ref", "period", "tax_year", "assessment_year", "certificate_no"].forEach((k) => F[k] && chips.push([k.replace("_", " "), F[k]]));
  const folders = DOCS.meta.folders.includes(a.folder) ? DOCS.meta.folders : [a.folder, ...DOCS.meta.folders];
  el.innerHTML = `<div class="fileic">${esc((a.filename.split(".").pop() || "").toUpperCase())}</div><div>
    <div class="qhead"><span class="nm">${esc(a.label)}</span>${a.country ? `<span class="tag ${a.country}">${a.country === "IN" ? "India" : "Germany"}</span>` : ""}
      <span class="conf"><i><b style="width:${c * 100}%;background:${col}"></b></i>${Math.round(c * 100)}% sure · ${esc(a.matched_on)}</span></div>
    <div class="qhead"><span class="orig">${esc(a.method)} · ${(a.size / 1024).toFixed(0)} KB</span></div>
    ${chips.length ? `<div class="fchips">${chips.map(([k, v]) => `<span class="fchip"><b>${esc(k)}</b>${esc(v)}</span>`).join("")}</div>` : ""}
    ${a.duplicate_of ? `<div class="warnline dup">This exact file is already filed at <b>${esc(a.duplicate_of)}</b>.</div>` : ""}
    ${!a.has_text ? `<div class="warnline">No readable text (scan or photo) — I went by the file name${a.confidence ? "" : " and couldn't tell"}. Check the category and folder.</div>` : ""}
    <div class="qform">
      <label>Category <select data-f="category">${DOCS.meta.categories.map((x) => `<option ${x === a.category ? "selected" : ""}>${x}</option>`).join("")}</select></label>
      <label>Folder <input data-f="folder" list="fl-${id}" value="${esc(a.folder)}"><datalist id="fl-${id}">${folders.map((x) => `<option value="${esc(x)}">`).join("")}</datalist></label>
      <label>File name <input data-f="filename" value="${esc(a.filename)}"></label></div>
    ${a.excerpt ? `<details><summary class="hint">What I read</summary><div class="excerpt">${esc(a.excerpt)}</div></details>` : ""}
    <div class="qacts"><button class="sm" data-act="file">File it</button>
      ${F.amount ? `<button class="sm ghost" data-act="filetx">File + log as expense</button>` : ""}
      <button class="sm ghost" data-act="skip">Discard</button><span class="okline"></span></div></div>`;
  const get = (k) => $(`[data-f="${k}"]`, el).value.trim();
  const doFile = async () => {
    const r = await api("/docs/file", { method: "POST", body: { ...a, original_name: a.filename, category: get("category"), folder: get("folder"), filename: get("filename") } });
    el.classList.add("done"); $(".okline", el).textContent = `✓ Saved to ${r.path}${r.drive === "uploaded" ? " · uploaded to Google Drive" : ""}${r.facts_refreshed ? " · planner numbers refreshed" : ""}`;
    if (r.drive && r.drive !== "uploaded") toast(r.drive);
    toast("Filed"); DOCS.lib = await api("/docs/library"); drawLibrary(); return r;
  };
  $$("[data-act]", el).forEach((b) => b.onclick = async () => {
    try {
      if (b.dataset.act === "skip") { el.remove(); return; }
      const r = await doFile();
      if (b.dataset.act === "filetx") prefillTx({ amount: F.amount, date: F.dates?.[0], currency: F.currency || (a.country === "IN" ? "INR" : "EUR"),
        note: a.label + " — " + get("filename"), category: a.category === "Property — Gera flat" ? "Gera flat payment" : a.category.startsWith("Tax") ? "Taxes & fees" : "Other", doc: r.id });
    } catch (err) { $(".okline", el).innerHTML = `<span class="err">${esc(err.message)}</span>`; }
  });
}
$("#reviewBtn").onclick = async () => {
  $("#reviewOut").innerHTML = `<p class="hint">Reading every document… this can take a few seconds.</p>`;
  try {
    const r = await api("/docs/review");
    $("#reviewOut").innerHTML = `<p class="hint">Checked ${r.checked} files.</p>` + (r.suggestions.map((s, i) => `<div class="revitem"><b>${esc(s.label)}</b>
      <span class="from">now: ${esc(s.path)}</span><span class="to">suggested: ${esc(s.suggested_folder)}/${esc(s.suggested_name)}</span>
      <div><button class="sm" data-i="${i}">Move it</button></div></div>`).join("") || `<div class="okline">✓ Everything looks like it's in the right place.</div>`);
    $$("#reviewOut button[data-i]").forEach((b) => b.onclick = async () => {
      const s = r.suggestions[+b.dataset.i];
      try { const m = await api("/docs/move", { method: "POST", body: { path: s.path, folder: s.suggested_folder, filename: s.suggested_name } });
        b.parentElement.innerHTML = `<span class="okline">✓ Moved to ${esc(m.path)}</span>`; DOCS.lib = await api("/docs/library"); drawLibrary(); }
      catch (err) { toast(err.message); }
    });
  } catch (err) { $("#reviewOut").innerHTML = `<p class="err">${esc(err.message)}</p>`; }
};

// re-draw when crossing a layout breakpoint so charts and legends re-flow
let lastBp = innerWidth < 760 ? "m" : innerWidth < 1024 ? "t" : "d";
addEventListener("resize", () => {
  const bp = innerWidth < 760 ? "m" : innerWidth < 1024 ? "t" : "d";
  if (bp !== lastBp) { lastBp = bp; const a = $(".tab.on")?.id; if (a && a !== "chat") loaders[a]?.(); }
});

// ---------------- GOOGLE DRIVE ----------------
async function loadDrive() {
  const g = await api("/gdrive/status");
  const st = (id, done, off) => { $(id).classList.toggle("done", !!done); $(id).classList.toggle("off", !!off); };
  st("#gStep1", g.client_set); st("#gStep2", g.connected, !g.client_set); st("#gStep3", g.active, !g.connected);
  $("#gClientHint").textContent = g.client_set ? `Client saved (${g.client_id_hint}).` : "No client saved yet.";
  $("#gConnect").textContent = g.connected ? "Reconnect" : "Connect Google Drive";
  $("#gConnect").disabled = !g.client_set;
  $("#gDisconnect").hidden = !g.connected;
  $("#gAccount").textContent = g.connected ? `Signed in as ${g.account || "your Google account"}.` : "Opens Google's sign-in page; you'll come straight back here.";
  $("#gFolderHint").textContent = g.folder_id ? `Folder: ${g.folder_name || g.folder_id}` : "No folder chosen yet.";
  $("#gSync").disabled = !(g.connected && g.folder_id);
  $("#gUse").checked = g.active; $("#gUse").disabled = !g.files;
  $("#gSyncHint").textContent = g.last_sync ? `Last sync ${g.last_sync.replace("T", " ")} · ${g.files} files in the working copy.` : "";
  $("#gdState").innerHTML = g.active ? `<span class="chip done">Using Google Drive</span>` : g.connected ? `<span class="chip">Connected</span>` : "";
}
$("#gClientForm").onsubmit = async (e) => {
  e.preventDefault();
  try { await api("/gdrive/client", { method: "POST", body: { json: e.target.json.value } }); e.target.json.value = ""; toast("Google client saved"); }
  catch (err) { toast(err.message); }
  loadDrive();
};
$("#gConnect").onclick = () => { location.href = "/gdrive/connect"; };
$("#gDisconnect").onclick = async () => { await api("/gdrive/disconnect", { method: "POST" }); toast("Google Drive disconnected — using local documents"); loadDrive(); };
$("#gFolderForm").onsubmit = async (e) => {
  e.preventDefault();
  try { const g = await api("/gdrive/folder", { method: "POST", body: { folder: e.target.folder.value } }); e.target.folder.value = ""; toast("Folder: " + g.folder_name); }
  catch (err) { toast(err.message); }
  loadDrive();
};
async function driveSync(btn) {
  const old = btn.textContent; btn.disabled = true; btn.textContent = "Syncing…";
  try {
    const r = await api("/gdrive/sync", { method: "POST" });
    toast(`Synced: ${r.downloaded} new/changed, ${r.unchanged} unchanged${r.removed ? `, ${r.removed} removed` : ""}${r.google_docs_skipped ? ` · ${r.google_docs_skipped} Google Docs skipped` : ""}`);
  } catch (err) { toast(err.message); }
  btn.disabled = false; btn.textContent = old;
}
$("#gSync").onclick = async (e) => { await driveSync(e.currentTarget); loadDrive(); };
$("#docSync").onclick = async (e) => { await driveSync(e.currentTarget); loaders.documents(); };
$("#gUse").onchange = async (e) => {
  try { await api("/gdrive/source", { method: "POST", body: { source: e.target.checked ? "gdrive" : "local" } }); toast(e.target.checked ? "Documents now come from Google Drive" : "Documents now come from this laptop"); }
  catch (err) { toast(err.message); }
  loadDrive();
};
{ // back from Google sign-in
  const q = new URLSearchParams(location.search);
  if (q.get("gdrive")) {
    setTimeout(() => toast(q.get("gdrive") === "connected" ? "Google Drive connected — now choose the folder" : (q.get("msg") || "Google sign-in failed")), 300);
    history.replaceState(null, "", "/" + location.hash);
  }
}

// ---------------- ANALYSIS & RECOMMENDATIONS ----------------
const TAB_OF = { Position: "position", Money: "money", Plan: "plan", Goals: "goals", Invest: "invest", Tax: "tax", Documents: "documents" };
let ANALYSIS_POLL = null;
async function loadAnalysis(reportId) {
  const el = $("#analysis"); if (!el) return;
  let a;
  try { a = await api("/analysis" + (reportId ? `?report_id=${reportId}` : "")); } catch (e) { el.innerHTML = ""; return; }
  const r = a.report, d = r?.data;
  const head = `<h3>Analysis &amp; recommendations ${r ? `<span class="sub">${esc(new Date(r.created).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }))} · ${esc(r.provider_label || "")}${r.trigger === "weekly" ? " · weekly" : ""}</span>` : ""}
    <span class="right">${a.history.length > 1 ? `<select id="anHist" aria-label="Earlier reports">${a.history.map((h) => `<option value="${h.id}" ${r && h.id === r.id ? "selected" : ""}>${esc(h.created.slice(0, 10))}${h.status === "failed" ? " (failed)" : ""}</option>`).join("")}</select>` : ""}
    <button class="sm" id="anRun" ${a.running || !a.ready ? "disabled" : ""}>${a.running ? "Analysing…" : r ? "Run again" : "Run analysis"}</button></span></h3>`;
  let body;
  if (!a.ready) body = `<div class="empty">Choose an AI assistant in <a href="#" onclick="go('settings');return false">Settings → AI assistant</a> to get a written analysis of your finances.</div>`;
  else if (a.running && !r) body = `<div class="empty"><span class="chip run">Reviewing your numbers — this takes a minute or two</span></div>`;
  else if (!r) body = `<div class="empty">No analysis yet. The assistant reviews everything in the app — cash, goals, deadlines, gaps — and writes a ranked to-do list.</div>`;
  else if (r.status === "failed" || !d) body = `<p class="err">⚠ ${esc(r.headline || "The last run failed.")}</p>`;
  else body = `<p class="an-head">${esc(d.headline)}</p><p class="muted">${esc(d.summary || "")}</p>
    ${(d.actions || []).length ? `<ol class="an-actions">${d.actions.map((x) => `<li><div><b>${esc(x.title)}</b><span>${esc(x.why || "")}</span></div>
      <div class="meta">${x.due ? `<span class="chip">${esc(x.due)}</span>` : ""}${TAB_OF[x.tab] ? `<button class="sm ghost" onclick="go('${TAB_OF[x.tab]}')">${esc(x.tab)} →</button>` : ""}</div></li>`).join("")}</ol>` : ""}
    <div class="an-cols">
      ${(d.risks || []).length ? `<div><h4>Risks</h4><ul>${d.risks.map((x) => `<li><span class="sev ${esc(x.severity || "")}">${esc(x.severity || "")}</span> <b>${esc(x.title)}</b> — ${esc(x.detail || "")}</li>`).join("")}</ul></div>` : ""}
      ${(d.gaps || []).length ? `<div><h4>Missing data</h4><ul>${d.gaps.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      ${(d.changes || []).length ? `<div><h4>Since last time</h4><ul>${d.changes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
    </div>${a.running ? `<p class="hint"><span class="chip run">Running a new analysis…</span></p>` : ""}`;
  el.innerHTML = head + body + (a.ready ? `<label class="hint an-auto"><input type="checkbox" id="anAuto" ${a.auto === "weekly" ? "checked" : ""}> Run automatically once a week (while the app is open)</label>` : "");
  if ($("#anRun")) $("#anRun").onclick = async () => { try { await api("/analysis/run", { method: "POST" }); loadAnalysis(); } catch (e) { toast(e.message); } };
  if ($("#anHist")) $("#anHist").onchange = (e) => loadAnalysis(+e.target.value);
  if ($("#anAuto")) $("#anAuto").onchange = async (e) => { await api("/analysis/auto", { method: "POST", body: { auto: e.target.checked ? "weekly" : "off" } }); toast(e.target.checked ? "Weekly analysis on" : "Weekly analysis off"); };
  clearTimeout(ANALYSIS_POLL);
  if (a.running) ANALYSIS_POLL = setTimeout(() => { if ($("#position.on")) loadAnalysis(); }, 4000);
}

// ---------------- USERS & ONBOARDING ----------------
let PROFILE = null, PROFILES = null, HAS_GERA = true;
const initials = (n) => (n || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
function setUserChip() {
  $("#userAv").textContent = initials(PROFILE?.name); $("#userName").textContent = PROFILE?.name || "—";
  HAS_GERA = !!PROFILE?.legacy;
  document.body.classList.toggle("no-in", !(PROFILE?.countries || []).includes("IN"));
}
async function loadProfiles() {
  PROFILES = await api("/profiles");
  PROFILE = PROFILES.profiles.find((p) => p.id === PROFILES.active) || null;
  setUserChip();
  return PROFILE;
}
function showGate(html) { const g = $("#gate"); g.innerHTML = `<div class="gate-card">${html}</div>`; g.hidden = false; document.body.classList.add("gated"); }
function hideGate() { $("#gate").hidden = true; $("#gate").innerHTML = ""; document.body.classList.remove("gated"); }
function showPicker() {
  const list = PROFILES.profiles;
  showGate(`<div class="gate-head"><span class="mark" aria-hidden="true"></span><h2>Who's using Finance Manager?</h2>
      <p class="muted">Each person's money, documents and settings are kept separately on this laptop.</p></div>
    <div class="users">${list.map((p) => `<button class="user" data-id="${esc(p.id)}"><span class="av">${esc(initials(p.name))}</span><b>${esc(p.name)}</b>
      <small>${p.onboarded ? esc((p.countries || []).map((c) => PROFILES.countries[c] || c).join(" · ") || "") : "setup not finished"}</small></button>`).join("")}
      <form class="user add" id="addUser"><span class="av">＋</span><input name="name" placeholder="Add a person" aria-label="New person's name" required maxlength="40"><button class="sm">Add</button></form></div>
    ${PROFILE ? `<p style="text-align:center;margin:14px 0 0"><button class="ghost sm" id="gateClose">Back to ${esc(PROFILE.name)}</button></p>` : ""}`);
  $$("#gate .user[data-id]").forEach((b) => b.onclick = async () => { await api(`/profiles/${b.dataset.id}/activate`, { method: "POST" }); location.reload(); });
  $("#addUser").onsubmit = async (e) => { e.preventDefault(); try { await api("/profiles", { method: "POST", body: { name: e.target.name.value } }); await loadProfiles(); showOnboarding(); } catch (err) { toast(err.message); } };
  if ($("#gateClose")) $("#gateClose").onclick = hideGate;
}
$("#userBtn").onclick = async () => { await loadProfiles(); showPicker(); };

const OB = { step: 0, data: null };
function showOnboarding() {
  const C = PROFILES.countries, CUR = PROFILES.currency_of;
  OB.step = 0;
  OB.data = { name: PROFILE.name, countries: [], currencies: [], home_currency: "EUR", monthly_income: "", monthly_spending: "",
    fx_inr_per_eur: "", accounts: [{ name: "", currency: "", balance: "", country: "" }], goal: { name: "Emergency fund", target: "", date: "" }, ai_provider: "none" };
  const steps = ["You", "Money", "Accounts", "Goal", "Assistant"];
  const draw = async () => {
    const d = OB.data, st = OB.step;
    let body = "";
    if (st === 0) body = `<h3>Hi ${esc(d.name)} — where do you have money or taxes?</h3>
      <p class="muted">Pick every country where you earn, save, own property or may owe tax. You can change this later.</p>
      <label>Your name <input id="obName" value="${esc(d.name)}" maxlength="40"></label>
      <div class="chips">${Object.entries(C).map(([k, v]) => `<label class="chipbox"><input type="checkbox" value="${k}" ${d.countries.includes(k) ? "checked" : ""}> ${esc(v)}</label>`).join("")}</div>
      <p class="hint">Tax rules and deadlines are built in for Germany and India. For other countries the app tracks money and goals, but not tax.</p>`;
    if (st === 1) {
      const sug = [...new Set(d.countries.map((c) => CUR[c]).filter(Boolean))];
      if (!d.currencies.length) d.currencies = sug.length ? sug : ["EUR"];
      if (!d.currencies.includes(d.home_currency)) d.home_currency = d.currencies[0];
      body = `<h3>Your monthly money</h3>
      <p class="muted">Rough numbers are fine — you can refine them in Plan and Money later.</p>
      <label>Currencies you use <input id="obCcy" value="${esc(d.currencies.join(", "))}" placeholder="EUR, INR"></label>
      <label>Home currency (the one you spend in) <select id="obHome">${d.currencies.map((c) => `<option ${c === d.home_currency ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      <div class="row2"><label>Take-home pay per month <input id="obInc" inputmode="decimal" value="${esc(d.monthly_income)}" placeholder="e.g. 3800"></label>
      <label>Spending per month (rent, food, everything) <input id="obSpend" inputmode="decimal" value="${esc(d.monthly_spending)}" placeholder="e.g. 2600"></label></div>
      ${d.currencies.includes("INR") ? `<label>Euro → rupee rate <input id="obFx" inputmode="decimal" value="${esc(d.fx_inr_per_eur)}" placeholder="e.g. 108.99"></label>` : ""}
      ${d.currencies.some((c) => !["EUR", "INR"].includes(c)) ? `<p class="hint warn">Heads-up: totals currently convert only euros and rupees. Balances in ${esc(d.currencies.filter((c) => !["EUR", "INR"].includes(c)).join(", "))} are stored correctly but counted as euros in net worth until multi-currency support lands.</p>` : ""}
      <p class="hint">Take-home pay is what reaches your bank after tax. Spending is everything that leaves it in a normal month.</p>`;
    }
    if (st === 2) body = `<h3>Your bank accounts</h3>
      <p class="muted">Add the accounts where your money sits today, with today's balance. Skip any you don't want to track.</p>
      <div id="obAccts">${d.accounts.map((a, i) => `<div class="row4" data-i="${i}">
        <input data-k="name" placeholder="Name, e.g. ING Girokonto" value="${esc(a.name)}" aria-label="Account name">
        <select data-k="country" aria-label="Country">${d.countries.map((c) => `<option value="${c}" ${c === a.country ? "selected" : ""}>${esc(C[c])}</option>`).join("")}</select>
        <select data-k="currency" aria-label="Currency">${d.currencies.map((c) => `<option ${c === (a.currency || d.home_currency) ? "selected" : ""}>${c}</option>`).join("")}</select>
        <input data-k="balance" inputmode="decimal" placeholder="Balance" value="${esc(a.balance)}" aria-label="Balance"></div>`).join("")}</div>
      <button class="ghost sm" id="obAddAcct" type="button">＋ Another account</button>`;
    if (st === 3) body = `<h3>One thing you're saving for</h3>
      <p class="muted">A good first goal is an emergency fund: 3–6 months of spending you can reach quickly${d.monthly_spending ? ` — about ${esc(String(Math.round(+String(d.monthly_spending).replace(/,/g, "") * 4)))} ${esc(d.home_currency)} for you` : ""}. Leave blank to skip.</p>
      <label>Goal <input id="obGName" value="${esc(d.goal.name)}"></label>
      <div class="row2"><label>Amount (${esc(d.home_currency)}) <input id="obGTarget" inputmode="decimal" value="${esc(d.goal.target)}"></label>
      <label>By when <input id="obGDate" type="date" value="${esc(d.goal.date)}"></label></div>`;
    if (st === 4) {
      body = `<h3>Do you want an AI assistant?</h3>
      <p class="muted">Optional. It answers questions in plain English using your numbers. You can change this any time in Settings.</p>
      <div id="obProv" class="provlist" role="radiogroup" aria-label="AI assistant"></div>`;
    }
    showGate(`<div class="wiz-steps">${steps.map((t, i) => `<span class="${i === st ? "on" : i < st ? "done" : ""}">${i + 1}. ${t}</span>`).join("")}</div>
      <form id="obForm" class="form wiz">${body}<p class="err" id="obErr"></p>
      <div class="wiz-nav">${st ? `<button type="button" class="ghost" id="obBack">Back</button>` : `<button type="button" class="ghost" id="obPick">Switch user</button>`}
      <button id="obNext">${st === steps.length - 1 ? "Finish" : "Next"}</button></div></form>`);
    if (st === 4) { const meta = await api("/ai/status").catch(() => null); if (meta) { meta.provider = d.ai_provider; drawProviders($("#obProv"), meta, null, (v) => { d.ai_provider = v; }); } }
    if ($("#obAddAcct")) $("#obAddAcct").onclick = () => { collect(); d.accounts.push({ name: "", currency: "", balance: "", country: d.countries[0] }); draw(); };
    if ($("#obBack")) $("#obBack").onclick = () => { collect(); OB.step--; draw(); };
    if ($("#obPick")) $("#obPick").onclick = showPicker;
    $("#obForm").onsubmit = async (e) => {
      e.preventDefault(); collect();
      const err = validate(); if (err) { $("#obErr").textContent = err; return; }
      if (OB.step < steps.length - 1) { OB.step++; draw(); return; }
      try {
        $("#obNext").disabled = true;
        await api("/onboarding", { method: "POST", body: d });
        location.hash = "position"; location.reload();
      } catch (er) { $("#obErr").textContent = er.message; $("#obNext").disabled = false; }
    };
  };
  const collect = () => {
    const d = OB.data;
    if (OB.step === 0) { d.name = $("#obName").value.trim() || d.name; d.countries = $$("#gate .chips input:checked").map((i) => i.value); }
    if (OB.step === 1) {
      d.currencies = $("#obCcy").value.split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{3}$/.test(c));
      d.home_currency = $("#obHome").value; d.monthly_income = $("#obInc").value; d.monthly_spending = $("#obSpend").value;
      if ($("#obFx")) d.fx_inr_per_eur = $("#obFx").value;
    }
    if (OB.step === 2) d.accounts = $$("#obAccts .row4").map((r) => Object.fromEntries($$("[data-k]", r).map((x) => [x.dataset.k, x.value])));
    if (OB.step === 3) d.goal = { name: $("#obGName").value, target: $("#obGTarget").value, date: $("#obGDate").value };
  };
  const isNum = (v) => !String(v || "").trim() || !isNaN(+String(v).replace(/[,\s]/g, ""));
  const validate = () => {
    const d = OB.data;
    if (OB.step === 0 && !d.countries.length) return "Pick at least one country.";
    if (OB.step === 1) {
      if (!d.currencies.length) return "Enter at least one currency code, e.g. EUR.";
      if (!isNum(d.monthly_income) || !isNum(d.monthly_spending) || !isNum(d.fx_inr_per_eur)) return "Use numbers only, e.g. 3800.";
    }
    if (OB.step === 2 && d.accounts.some((a) => !isNum(a.balance))) return "Balances must be numbers.";
    if (OB.step === 3 && !isNum(d.goal.target)) return "The goal amount must be a number.";
    return "";
  };
  draw();
}

// AI provider chooser (Settings, chat, onboarding)
function drawProviders(el, meta, after, onPick) {
  const P = meta.providers, cli = meta.cli || {};
  const note = {
    none: "Everything except the Assistant tab works.",
    api: meta.key_set ? "Key saved on this laptop." : "Needs a key from platform.claude.com (billed separately from Claude Pro).",
    claude_cli: cli.claude_cli?.installed ? "Found on this laptop — sign in once by running  claude  in a terminal." : `Not installed. Run: ${cli.claude_cli?.install || ""}`,
    gemini_cli: cli.gemini_cli?.installed ? "Found on this laptop — sign in once by running  gemini  in a terminal." : `Not installed. Run: ${cli.gemini_cli?.install || ""}`,
  };
  el.innerHTML = Object.entries(P).map(([k, v]) => {
    const [title, sub] = v.split(" — ");
    const off = (k === "claude_cli" || k === "gemini_cli") && !cli[k]?.installed;
    return `<label class="prov ${meta.provider === k ? "on" : ""} ${off ? "off" : ""}"><input type="radio" name="prov_${el.id}" value="${k}" ${meta.provider === k ? "checked" : ""}>
      <span><b>${esc(title)}</b> <small>${esc(sub || "")}</small><em>${esc(note[k])}</em></span></label>`;
  }).join("");
  $$("input", el).forEach((i) => i.onchange = async () => {
    $$(".prov", el).forEach((l) => l.classList.toggle("on", l.contains(i)));
    if (onPick) { onPick(i.value); return; }
    try { await api("/ai/provider", { method: "POST", body: { provider: i.value } }); toast("Assistant: " + P[i.value].split(" — ")[0]); }
    catch (e) { toast(e.message); }
    after && after();
  });
}

// start: pick a user (or finish onboarding) before anything loads
(async () => {
  let p = null;
  try { p = await loadProfiles(); } catch (e) { }
  if (!p) { showPicker(); return; }
  if (!p.onboarded) { showOnboarding(); return; }
  const start = location.hash.slice(1) || "position";
  ($(`#tabs button[data-tab="${start}"]`) || $("#tabs button")).click();
})();
