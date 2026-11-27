
/* ═══════════════ v2.1 demo-day features ═══════════════
   Market tools like an exchange home page (ticker tape, demo index, breadth, heatmap, movers, notice board),
   the practice challenge, achievements, "Try it now" quick start, app install, and the big-screen live board (#board).
   Everything shown here comes from this system's own state: no outside market data, no invented news. */
Object.assign(I, {
  dl: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg>',
  board: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4" stroke-linecap="round"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4m-4 3h8l-1-3H9z"/></svg>',
});
const num2 = v => Number(v).toLocaleString(loc(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const absPct = c => pct(Math.abs(c)).replace("+", "");
const sgn = c => c > 0 ? "+" : c < 0 ? "−" : "";

/* ───────── per-user flags kept on this device (Bangla used, audit run, money added) ───────── */
const uidKey = () => (S.me && S.me.user ? S.me.user.id + ":" + S.me.user.email : "anon");
function flags() { try { return JSON.parse(localStorage.getItem("bx_flags_" + uidKey()) || "{}"); } catch (e) { return {}; } }
function setFlag(k) {
  try { const f = flags(); if (!f[k]) { f[k] = 1; localStorage.setItem("bx_flags_" + uidKey(), JSON.stringify(f)); } } catch (e) {}
  if (S.view === "inv") setTimeout(checkBadges, 50);
}

/* ───────── data ───────── */
async function loadOverview(m) { try { S.ov[m] = await api("/api/overview/" + m); } catch (e) {} return S.ov[m]; }
async function loadLeaderboard() { try { S.lb = await api("/api/leaderboard"); } catch (e) {} return S.lb; }
function tapeRows(m) {            // the live stream when there is one, else the last overview
  const tks = S.info.markets[m].tickers, sn = S.snap[m], ov = S.ov[m];
  return Object.keys(tks).map(k => {
    const v = sn && sn.tickers[k], r = ov && ov.rows.find(x => x.ticker === k), ref = tks[k].ref;
    const last = v ? v.last : r ? r.last : ref;
    return { k, last, ref, chg: (last - ref) / ref * 100, volume: v ? v.volume : r ? r.volume : 0, trades: r ? r.trades : v ? v.trades : 0, turnover: r ? r.turnover : 0 };
  });
}

/* ───────── scrolling ticker tape, as on an exchange home page ───────── */
function tapeInner(m) {
  let rows = tapeRows(m); while (rows.length && rows.length < 12) rows = rows.concat(rows);
  const one = rows.map(r => `<span class="ti" data-s="${esc(r.k)}"><b>${esc(r.k)}</b><span class="p">${price$(m, r.last)}</span><span class="${r.chg > 0 ? "up" : r.chg < 0 ? "dn" : "fl"}">${r.chg > 0 ? "▲" : r.chg < 0 ? "▼" : "•"} ${absPct(r.chg)}</span></span>`).join("");
  return one + one;               // two copies: the track slides by half its width, so the loop is seamless
}
function tickerTapeHTML(m) { return `<div class="tape" data-m="${esc(m)}" role="marquee" aria-label="${esc(t("live"))}"><div class="trk">${tapeInner(m)}</div></div>`; }
let tapeAt = 0;
function refreshTape(force) {
  if (!force && Date.now() - tapeAt < 2500) return; tapeAt = Date.now();
  $$(".tape[data-m]").forEach(el => { const tr = el.firstElementChild; if (tr) tr.innerHTML = tapeInner(el.dataset.m); });
}
document.addEventListener("click", e => {
  if (S.view !== "inv") return;
  const x = e.target.closest(".tape .ti, .hx, .mv[data-s]"); if (x && x.dataset.s && MK().tickers[x.dataset.s]) openStock(x.dataset.s);
});

/* ───────── charts ───────── */
function lineChart(vals, o = {}) {
  const w = o.w || 600, h = o.h || 140;
  if (!vals || vals.length < 2) { const v = vals && vals.length ? vals[0] : 1; vals = [v, v]; }
  let mn = Math.min(...vals), mx = Math.max(...vals);
  if (o.base != null) { mn = Math.min(mn, o.base); mx = Math.max(mx, o.base); }
  const pad = ((mx - mn) || Math.abs(mx) * 0.01 || 1) * 0.12; mn -= pad; mx += pad;
  const X = i => (i / (vals.length - 1) * w).toFixed(1), Y = v => (h - (v - mn) / (mx - mn) * h).toFixed(1);
  const d = vals.map((v, i) => (i ? "L" : "M") + X(i) + " " + Y(v)).join(" ");
  const up = vals[vals.length - 1] >= (o.base ?? vals[0]), col = o.color || (up ? "#2E9E5B" : "#C0392B"), id = "lc" + Math.random().toString(36).slice(2, 8);
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity="${o.op ?? 0.24}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    ${o.base != null ? `<line x1="0" x2="${w}" y1="${Y(o.base)}" y2="${Y(o.base)}" stroke="${o.grid || "#8FAADC"}" stroke-dasharray="5 5" stroke-width="1" vector-effect="non-scaling-stroke"/>` : ""}
    <path d="${d} L${w} ${h} L0 ${h}Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${o.sw || 2.2}" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}

/* ───────── demo index card: value, intraday chart, turnover, breadth ───────── */
function idxCardHTML(m, board) {
  const ov = S.ov[m]; if (!ov) return `<div style="height:120px;display:flex;align-items:center;justify-content:center"><span class="spin"></span></div>`;
  const ix = ov.index, sm = ov.summary, up = ix.chg >= 0, n = Object.keys(S.info.markets[m].tickers).length;
  const vals = ix.history.map(p => p[1]).concat([ix.value]);
  const br = [["a", sm.adv], ["u", sm.unch], ["d", sm.dec]].filter(x => x[1] > 0).map(([c, v]) => `<i class="${c}" style="flex:${v}"></i>`).join("");
  return `<div class="ih"><div style="min-width:0"><div class="sub" style="font-weight:700"><span class="ldot"></span>${t("live")} · ${esc(t("idx_name"))} · ${esc(m)}</div>
      <div class="iv">${num2(ix.value)}</div><div class="ic ${up ? "up" : "dn"}">${up ? "▲" : "▼"} ${num2(Math.abs(ix.chg))} (${absPct(ix.chg_pct)})</div></div>
      <div class="ist">${esc(t("mkt_open"))}<b>● ${esc(t("live"))}</b><span>H ${num2(ix.high)}</span><br><span>L ${num2(ix.low)}</span></div></div>
    <div class="ichart">${lineChart(vals, { base: 1000, grid: board ? "rgba(255,255,255,.35)" : "#8FAADC", color: board ? (up ? "#7BE0A5" : "#FF9C8F") : null, op: board ? 0.3 : 0.24 })}</div>
    <div class="sum3"><div><small>${t("turnover")}</small><b>${cash$(m, sm.turnover)}</b></div><div><small>${t("volume")}</small><b>${num(sm.volume)}</b></div><div><small>${t("trades_n")}</small><b>${num(sm.trades)}</b></div></div>
    <div class="breadth">${br}</div>
    <div class="foot"><span class="up">▲ ${num(sm.adv)} ${t("adv")}</span><span>• ${num(sm.unch)} ${t("unch")}</span><span class="dn">▼ ${num(sm.dec)} ${t("dec")}</span></div>
    ${board ? "" : `<div class="sub" style="margin-top:8px">${tf("idx_note", { n: num(n) })} ${tf("status_note", { h: esc(ov.status.hours) })}</div>`}`;
}

/* ───────── heatmap: one tile per stock, grouped by sector, coloured by today's change ───────── */
const HPREV = {};
function heatColor(c, board) {
  if (!c) return board ? ["rgba(255,255,255,.1)", "#fff"] : ["#EEF2FA", "#1F3864"];
  const a = Math.min(Math.abs(c) / 4, 1), to = c > 0 ? [46, 158, 91] : [192, 57, 43], from = board ? [40, 64, 110] : [238, 242, 250];
  const k = 0.3 + 0.7 * a, mix = from.map((x, i) => Math.round(x + (to[i] - x) * k));
  return [`rgb(${mix.join(",")})`, board || k > 0.5 ? "#fff" : "#16202f"];
}
function heatHTML(m, board) {
  const tks = S.info.markets[m].tickers, rows = tapeRows(m), secW = {};
  rows.forEach(r => { const s = tks[r.k].sector || ""; secW[s] = (secW[s] || 0) + (tks[r.k].w || 1); });
  rows.sort((a, b) => { const sa = tks[a.k].sector || "", sb = tks[b.k].sector || ""; return secW[sb] - secW[sa] || sa.localeCompare(sb) || (tks[b.k].w || 1) - (tks[a.k].w || 1); });
  return `<div class="heat">${rows.map(r => {
    const [bg, fg] = heatColor(Math.round(r.chg * 100) / 100, board), key = m + ":" + r.k, fl = HPREV[key] != null && HPREV[key] !== r.last; HPREV[key] = r.last;
    return `<button class="hx ${(tks[r.k].w || 1) >= 10 ? "w2" : ""} ${fl ? "flash" : ""}" data-s="${esc(r.k)}" style="background:${bg};color:${fg}" title="${esc(tks[r.k].name)}"><b>${esc(r.k)}</b><span>${sgn(r.chg)}${absPct(r.chg)}</span><small>${esc(tks[r.k].sector || "")}</small></button>`;
  }).join("")}</div>`;
}

/* ───────── top movers ───────── */
function moversTabs(id) {
  return `<div class="seg sm" id="${id}" style="margin-bottom:6px">${[["gainers", "gainers"], ["losers", "losers"], ["active", "active_m"]].map(([k, l]) => `<button data-mv="${k}" class="${S.mvtab === k ? "on" : ""}">${t(l)}</button>`).join("")}</div>`;
}
function bindMoversTabs(id, after) { $$(`#${id} [data-mv]`).forEach(b => b.onclick = () => { S.mvtab = b.dataset.mv; $$(`#${id} [data-mv]`).forEach(x => x.classList.toggle("on", x === b)); after(); }); }
function moversHTML(m) {
  const ov = S.ov[m]; if (!ov) return `<span class="spin"></span>`;
  const list = ov.movers[S.mvtab] || [];
  return list.map(r => `<div class="mv" data-s="${esc(r.ticker)}"><div class="tk">${esc(r.ticker.slice(0, 4))}</div><div class="m"><b>${esc(r.name)}</b><small>${esc(r.ticker)} · ${S.mvtab === "active" ? `${t("turnover")} ${cash$(m, r.turnover)}` : `${t("volume")} ${num(r.volume)}`}</small></div><div class="r"><b>${price$(m, r.last)}</b><br>${pcHTML(r.chg)}</div></div>`).join("")
    || `<div class="empty">${t("no_movers")}</div>`;
}

/* ───────── live notice board: built only from real events in this system ───────── */
function agoText(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  return s < 60 ? tf("ago_s", { n: num(s) }) : s < 3600 ? tf("ago_m", { n: num(Math.floor(s / 60)) }) : tf("ago_h", { n: num(Math.floor(s / 3600)) });
}
function noticeText(n) {
  const m = n.market || "DSE", bn = S.lang === "bn", tk = esc(n.ticker || ""), P = v => price$(m, v), Q = v => num(v);
  switch (n.kind) {
    case "circuit": return { ic: n.up ? "▲" : "▼", cls: "k-circuit", tx: bn ? `${tk} দামের ${n.up ? "ঊর্ধ্ব" : "নিম্ন"}সীমা ${P(n.price)}-এ পৌঁছেছে` : `${tk} hit its ${n.up ? "upper" : "lower"} price limit at ${P(n.price)}` };
    case "block": return { ic: "◆", cls: "k-block", tx: bn ? `ব্লক লেনদেন: ${tk}-এর ${Q(n.qty)}টি শেয়ার ${P(n.price)} দামে` : `Block trade: ${Q(n.qty)} ${tk} at ${P(n.price)}`, hash: n.tx };
    case "held": return { ic: "⏸", cls: "k-held", tx: bn ? `${tk}-এর ${Q(n.qty)}টি শেয়ারের ${n.side === "BUY" ? "ক্রয়" : "বিক্রয়"} অর্ডার ব্রোকারের পর্যালোচনায় (${ofN(n.have, n.need)} অনুমোদন)` : `${n.side === "BUY" ? "Buy" : "Sell"} order for ${Q(n.qty)} ${tk} held for broker review (${num(n.have)} of ${num(n.need)} approvals)` };
    case "escalated": return { ic: "★", cls: "k-escalated", tx: bn ? `উচ্চ ঝুঁকির অর্ডার: ${tk}-এর ${Q(n.qty)}টি শেয়ার ${num(n.votes)}টি ভ্যালিডেটরের অনুমোদনে নিষ্পন্ন${n.reviewer ? ", সঙ্গে ব্রোকারের পর্যালোচনা" : ""}` : `High-risk order: ${Q(n.qty)} ${tk} settled after ${num(n.votes)} validator approvals${n.reviewer ? " and a broker review" : ""}` };
    case "joined": return { ic: "+", cls: "k-joined", tx: bn ? `${esc(n.name)} অনুশীলন প্রতিযোগিতায় যোগ দিয়েছেন` : `${esc(n.name)} joined the practice challenge` };
    case "validator": return { ic: n.faulty ? "!" : "✓", cls: "k-validator" + (n.faulty ? "" : " ok"), tx: bn ? (n.faulty ? `ভ্যালিডেটর V${num(n.node)} বন্ধ (সিমুলেটেড ত্রুটি)। বাকিরা লেনদেন চালু রাখছে।` : `ভ্যালিডেটর V${num(n.node)} আবার চালু`) : (n.faulty ? `Validator V${n.node} is down (simulated fault). The others keep trading going.` : `Validator V${n.node} is back online`) };
    default: return { ic: "•", cls: "k-block", tx: esc(n.kind) };
  }
}
const NSEEN = new Set(); let nseenInit = false;
function noticesHTML(list, lim) {
  const out = (list || []).slice(0, lim || 12).map(n => {
    const x = noticeText(n), key = n.t + ":" + n.kind + ":" + (n.ticker || n.name || n.node || ""), fresh = nseenInit && !NSEEN.has(key); NSEEN.add(key);
    return `<div class="nt ${fresh ? "new" : ""}"><div class="ni ${x.cls}">${x.ic}</div><div class="nb">${x.tx}<small>${agoText(n.t)}${x.hash ? " · " + H(x.hash) : ""}</small></div></div>`;
  }).join("");
  nseenInit = true;
  return out || `<div class="empty">${t("no_notices")}</div>`;
}

/* ───────── practice challenge (leaderboard) ───────── */
function chalHTML(lb, lim, board) {
  if (!lb) return `<span class="spin"></span>`;
  const me = !board && S.me && S.me.user ? S.me.user.id : null, mine = me && lb.rows.find(r => r.id === me);
  const row = r => `<div class="lb ${r.id === me ? "me" : ""}"><div class="rk ${r.rank <= 3 ? "g" + r.rank : ""}">${num(r.rank)}</div>
    <div class="nm">${esc(r.name)}${r.id === me ? `<small>(${t("you")})</small>` : ""}<small>${num(r.trades)} ${r.trades === 1 ? t("trade_1") : t("trades_w")}</small></div>
    <b class="${r.ret > 0 ? "up" : r.ret < 0 ? "dn" : ""}">${sgn(r.ret)}${absPct(r.ret)}</b></div>`;
  let top = lb.rows.slice(0, lim || 5); if (mine && mine.rank > (lim || 5)) top = top.concat([mine]);
  const head = board ? "" : mine
    ? `<div class="myrank"><div><small>${t("your_rank")}</small><b>#${num(mine.rank)}</b> <span style="opacity:.8">/ ${num(lb.n)}</span></div><div style="text-align:right"><small>${t("chal")}</small><b>${sgn(mine.ret)}${absPct(mine.ret)}</b></div></div>`
    : `<div class="infobox">${t("chal_join")}</div>`;
  return head + (top.map(row).join("") || `<div class="empty">${t("chal_empty")}</div>`) + (board ? "" : `<div class="sub" style="margin-top:6px">${t("chal_rule")}</div>`);
}

/* ───────── achievements ───────── */
const BADGES = [["first_order", "✎"], ["first_trade", "✓"], ["escalated", "4"], ["market", "⚡"], ["watch3", "★"], ["funded", "৳"], ["bangla", "অ"], ["audit", "⛭"], ["lse", "£"], ["cancel", "↺"]];
function badgeState() {
  const own = (S.orders || []).filter(o => !o.sim), f = flags(), traded = o => o.trades && o.trades.length;
  return {
    first_order: own.length > 0, first_trade: own.some(traded), escalated: own.some(o => o.risk && o.risk.level === "ESCALATED" && traded(o)),
    market: own.some(o => o.otype === "MARKET"), watch3: Object.values(S.watch || {}).some(l => (l || []).length >= 3),
    funded: !!f.funded || !!(S.wallet && S.wallet.history && S.wallet.history.some(x => x.type === "deposit")),
    bangla: !!f.bangla || S.lang === "bn", audit: !!f.audit, lse: own.some(o => o.market === "LSE"),
    cancel: own.some(o => o.status === "cancelled" && o.otype !== "MARKET"),
  };
}
let badgeSig = "";
function badgesHTML() {
  const st = badgeState(), n = Object.values(st).filter(Boolean).length, pop = S.popBadge || []; S.popBadge = null;
  return `<div class="sec" style="margin-top:0"><b>${t("badges")}</b><span>${num(n)} / ${num(BADGES.length)}</span></div>
    <div class="badges">${BADGES.map(([k, ic]) => `<button class="bd ${st[k] ? "on" : ""} ${pop.includes(k) ? "pop" : ""}" data-b="${k}" title="${esc(t("b_" + k + "_d"))}"><i>${ic}</i>${esc(t("b_" + k))}</button>`).join("")}</div>`;
}
function renderBadges(force) {
  const el = $("#badges"); if (!el) return;
  const sig = JSON.stringify(badgeState()) + S.lang; if (!force && sig === badgeSig && el.innerHTML) return; badgeSig = sig;
  el.innerHTML = badgesHTML(); $$("#badges [data-b]").forEach(b => b.onclick = () => toast(`${t("b_" + b.dataset.b)}: ${t("b_" + b.dataset.b + "_d")}`));
}
function checkBadges() {
  if (S.view !== "inv" || !S.me || !S.ordersLoaded) return;
  const st = badgeState(), key = "bx_badges_" + uidKey(), on = Object.keys(st).filter(k => st[k]); let seen = null;
  try { seen = JSON.parse(localStorage.getItem(key)); } catch (e) {}
  if (!Array.isArray(seen)) { try { localStorage.setItem(key, JSON.stringify(on)); } catch (e) {} return; }   // first visit on this device: no fanfare for old progress
  const fresh = on.filter(k => !seen.includes(k));
  if (!fresh.length) return;
  try { localStorage.setItem(key, JSON.stringify([...new Set(seen.concat(on))])); } catch (e) {}
  toast(`${t("b_unlocked")}: ${fresh.map(k => t("b_" + k)).join(", ")}`); confetti(80); S.popBadge = fresh; renderBadges(true);
}

/* ───────── celebrate a settled trade ───────── */
function afterOrders() {
  const prev = S.prevOrd; S.prevOrd = {};
  for (const o of S.orders) S.prevOrd[o.id] = o.filled || 0;
  if (prev) for (const o of S.orders) {
    if (o.sim) continue;
    const p = prev[o.id], f = o.filled || 0;
    if ((p != null && f > p) || (p == null && f > 0 && Date.now() - o.ts < 20000)) { toast(tf(o.side === "BUY" ? "cel_buy" : "cel_sell", { q: num(f - (p || 0)), tk: o.ticker })); confetti(); break; }
  }
  S.ordersLoaded = true; checkBadges();
}
const FX = { ps: [], run: false };
function confetti(n = 150) {
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cv = $("#fx"); if (!cv || !cv.getContext) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), W = innerWidth * dpr, Hh = innerHeight * dpr;
  if (cv.width !== W || cv.height !== Hh) { cv.width = W; cv.height = Hh; }
  const cols = ["#1F3864", "#2F5597", "#8FAADC", "#ED7D31", "#2E9E5B", "#F7D774", "#C0392B"];
  for (let i = 0; i < n; i++) FX.ps.push({ x: W * (0.25 + Math.random() * 0.5), y: Hh * (0.3 + Math.random() * 0.12), vx: (Math.random() - 0.5) * 15 * dpr, vy: (-Math.random() * 15 - 5) * dpr,
    r: (5 + Math.random() * 5) * dpr, c: cols[i % cols.length], a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, life: 150 + Math.random() * 40 });
  if (FX.run) return; FX.run = true;
  const ctx = cv.getContext("2d"), g = 0.42 * dpr;
  (function step() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    FX.ps = FX.ps.filter(p => --p.life > 0 && p.y < cv.height + 40);
    for (const p of FX.ps) { p.vy += g; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); }
    if (FX.ps.length) requestAnimationFrame(step); else { FX.run = false; ctx.clearRect(0, 0, cv.width, cv.height); }
  })();
}

/* ───────── "Try it now": a practice account in one step (the key is still made here, in the browser) ───────── */
function tryCardHTML() {
  const d = S.info.markets.DSE, cash = d ? cash$("DSE", d.new_cash) : "";
  return `<div class="card try" id="tryc"><h2>${t("try_t")}</h2><p>${t("try_s")}</p>
    <div class="tryrow"><input id="qn" maxlength="24" autocomplete="nickname" autocapitalize="words" placeholder="${esc(t("nick"))}" enterkeyhint="go"><button class="btn" id="qgo">${t("try_go")}</button></div>
    <div class="err" id="qerr"></div><div class="perks"><span>${esc(cash)} · ${t("perk1")}</span><span>${t("perk2")}</span><span>${t("perk3")}</span></div></div>
    <div class="orline">${t("or_sign")}</div>`;
}
function bindTry() {
  if (!$("#qgo")) return;
  $("#qgo").onclick = doQuick; $("#qn").onkeydown = e => { if (e.key === "Enter") doQuick(); };
  if (/[?&]try\b/.test(location.search) && !("ontouchstart" in window)) $("#qn").focus();
}
async function doQuick() {
  const nm = $("#qn").value.trim(), btn = $("#qgo"), er = $("#qerr");
  if ([...nm].length < 2 || [...nm].length > 24) { er.textContent = t("nick_bad"); return; }
  busy(btn, true); er.style.color = "#fff"; er.innerHTML = `<span class="spin"></span>${t("try_wait")}`;
  try {
    const k = BXSign.newKey(), addr = BXSign.addressOf(k);                 // created here; only the address leaves the phone
    const r = await api("/api/auth/quickstart", { method: "POST", body: { name: nm, wallet: addr } });
    keyStore.set(r.user.email, k); S.tmpKey = k; setToken(r.token); try { localStorage.setItem("bx_qtoken", r.token); } catch (e) {}
    sessionStorage.removeItem("bx_demo_key"); await loadMe(); S.itab = "home"; S.welcome = { name: r.user.name, tx: r.tx };
    if (location.search) history.replaceState(null, "", location.pathname);
    route();
  } catch (e) { er.style.color = ""; er.textContent = e.message; busy(btn, false); }
}
function showWelcome() {
  const w = S.welcome; S.welcome = null; if (!w) return; const d = S.info.markets.DSE;
  openSheet(`<div style="text-align:center"><div class="okmark">${I.bigcheck}</div><h3>${esc(tf("welcome_t", { name: w.name }))}</h3><p class="sub" style="margin:4px 0 12px">${t("welcome_s")}</p>
    <div class="infobox" style="text-align:left">${tf("welcome_get", { cash: cash$("DSE", d.new_cash), n: num(d.new_shares) })}<div class="sub" style="margin-top:4px">${t("tx")} ${H(w.tx)}</div></div>
    <button class="btn" id="wGuide">${t("start_btn")}</button><button class="btn ghost" id="wX" style="margin-top:8px">${t("explore")}</button></div>`);
  $("#wGuide").onclick = () => { closeSheet(); startGuide(); }; $("#wX").onclick = closeSheet;
  setTimeout(() => confetti(), 150);
}

/* ───────── install as an app (PWA) ───────── */
let INSTALL = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); INSTALL = e; refreshInstall(); });
window.addEventListener("appinstalled", () => { INSTALL = null; toast(t("installed")); refreshInstall(); });
const standalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const canInstall = () => !standalone() && (!!INSTALL || isIOS());
function installSlot(cls) { return `<span data-install-slot="${esc(cls || "lang")}">${canInstall() ? `<button class="${esc(cls || "lang")} inst" data-install>${I.dl} ${t("install")}</button>` : ""}</span>`; }
function refreshInstall() { $$("[data-install-slot]").forEach(el => { el.outerHTML = installSlot(el.dataset.installSlot); }); }
document.addEventListener("click", e => { if (e.target.closest("[data-install]")) doInstall(); });
async function doInstall() {
  if (INSTALL) { const ev = INSTALL; INSTALL = null; ev.prompt(); try { await ev.userChoice; } catch (e) {} refreshInstall(); return; }
  openSheet(`<h3>${t("ios_t")}</h3><div class="how" style="margin:10px 0 14px">${isIOS() ? `<div>${t("ios_1")} ${I.share.replace("<svg", '<svg style="vertical-align:-4px;color:var(--blue)"')}</div><div>${t("ios_2")}</div><div>${t("ios_3")}</div>` : `<div>${t("inst_other")}</div>`}</div><button class="btn" id="iX">${t("close")}</button>`);
  $("#iX").onclick = closeSheet;
}

/* ───────── QR code to join (vendor/qrcode.js, MIT) ───────── */
let QRP = null;
function loadQR() {
  if (window.qrcode) return Promise.resolve();
  if (!QRP) QRP = new Promise((res, rej) => { const s = document.createElement("script"); s.src = "/vendor/qrcode.js"; s.onload = res; s.onerror = () => { QRP = null; rej(new Error("qr")); }; document.head.appendChild(s); });
  return QRP;
}
function joinURL() { const base = (S.info && S.info.public_url) || location.origin; return base.replace(/\/+$/, "") + "/?try=1"; }
const isLocalURL = u => /\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(u);
async function qrSVG(text) { await loadQR(); const q = qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }
async function openShare() {
  const u = joinURL();
  openSheet(`<h3>${t("share_app")}</h3><p class="sub" style="margin:4px 0 10px">${t("share_s")}</p><div class="qrbox" id="qrS"><span class="spin"></span></div><div class="urlline mono">${esc(u)}</div>
    ${isLocalURL(u) ? `<div class="bwarn">${t("local_warn")}</div>` : ""}<div class="row2" style="margin-top:12px"><button class="btn ghost" id="shCopy">${t("copy_link")}</button><button class="btn" id="shX">${t("close")}</button></div>`);
  $("#shX").onclick = closeSheet;
  $("#shCopy").onclick = () => { if (navigator.share) navigator.share({ title: BRAND.name, url: u }).catch(() => {}); else if (navigator.clipboard) navigator.clipboard.writeText(u).then(() => toast(t("copied"))); };
  try { const svg = await qrSVG(u); if ($("#qrS")) $("#qrS").innerHTML = svg; } catch (e) { if ($("#qrS")) $("#qrS").textContent = u; }
}

/* ───────── desktop sidebar footer ───────── */
function renderNfoot() {
  const el = $("#nfoot"); if (!el) return;
  el.innerHTML = `<div class="sub">${t("sim_banner")}</div><a class="btn ghost" href="/#board" target="_blank" rel="noopener">${I.board} ${t("board")}</a><button class="btn ghost" id="nShare">${I.share} ${t("share_app")}</button>${installSlot("btn ghost")}`;
  $("#nShare").onclick = openShare;
}

/* ═══════════════ big-screen live board (#board): no sign-in, read-only ═══════════════ */
let BOARD = null;
function stopBoard() { if (BOARD) { clearInterval(BOARD.t1); clearInterval(BOARD.t2); BOARD = null; } }
function feedRowHTML(o, fresh) {
  const n = S.info.validators, det = (o.votes && o.votes.detail) || [];
  const chips = Array.from({ length: n }, (_, i) => { const d = det.find(x => x.node === i + 1), c = !d ? "" : d.agree ? "y" : d.verdict === "not-asked" ? "" : "n"; return `<i class="${c}">V${i + 1}${c === "y" ? " ✓" : c === "n" ? " ✗" : ""}</i>`; }).join("");
  const stc = { settled: "ok", rejected: "bad", cancelled: "bad", part_filled: "bad", held: "wait", open: "wait", partial: "wait" }[o.status] || "";
  const big = o.risk && o.risk.level === "ESCALATED";
  return `<div class="fr ${fresh ? "new" : ""}"><div class="av">${esc([...(o.name || "?")][0])}</div><div style="min-width:0">
      <div class="ft">${esc(o.name)} <span class="${o.side === "BUY" ? "b" : "s"}">${o.side === "BUY" ? t("buy_o") : t("sell_o")}</span> ${num(o.qty)} ${esc(o.ticker)} <span style="font-weight:600;opacity:.85">${o.otype === "MARKET" ? "· " + t("market_o") : "@ " + price$(o.market, o.price)}</span></div>
      <div class="fs"><span class="vv">${chips}</span>${o.votes && o.votes.agree != null ? `<span>${ofN(o.votes.agree, n)}</span>` : ""}${big ? `<span class="st2 esc">${t("escalated")}</span>` : ""}${o.anchored ? `<span>⛓ ${t("anchored")}</span>` : ""}<span>${esc(o.market)} · ${agoText(o.ts)}</span></div></div>
    <span class="st2 ${stc}">${esc(t("st_" + o.status))}</span></div>`;
}
async function mountBoard() {
  stopBoard();
  if (!S.info) { try { S.info = await api("/api/info"); } catch (e) { $("#main").innerHTML = `<div class="bwarn">${t("no_gateway")}</div>`; return; } }
  const m = S.info.markets.DSE ? "DSE" : Object.keys(S.info.markets)[0];
  document.body.classList.toggle("bn", S.lang === "bn");
  $("#main").innerHTML = `<div class="bh"><div class="brand"><div class="logo">${BRAND.letter}</div><div>${esc(BRAND.name)} · ${t("board")}<small>${esc(BRAND.long)} · ${esc(BRAND.project)}</small></div></div>
      <div class="bmeta"><span class="bpill"><span class="ldot"></span>${t("live")}</span><span class="bpill">${t("sim_banner")}</span><button class="lang" id="bLang">${S.lang === "bn" ? "EN" : "বাংলা"}</button><span class="clock" id="bclk"></span></div></div>
    ${tickerTapeHTML(m)}
    <div class="bg3">
      <div class="bcol"><div class="bc idx" id="bidx"></div><div class="bc"><h3>${t("heatmap")}<span>${t("heat_note")}</span></h3><div id="bheat"></div></div></div>
      <div class="bcol"><div class="bc" style="flex:1;min-height:0;display:flex;flex-direction:column"><h3>${t("feed")}<span>${t("feed_s")}</span></h3><div class="bfeed" id="bfeed"><div class="empty">${t("feed_empty")}</div></div></div></div>
      <div class="bcol"><div class="bc bqr"><h3>${t("scan")}</h3><div class="qrbox" id="bqr"><span class="spin"></span></div><div class="sub" style="margin-top:6px">${t("scan_s")}</div><div class="urlline mono" id="burl"></div><div id="bwarn"></div></div>
        <div class="bc"><h3>${t("chal")}<span id="bplayers"></span></h3><div id="blb"></div></div>
        <div class="bc" style="min-height:0;overflow:hidden;flex:1"><h3>${t("notices")}</h3><div id="bnot"></div></div></div>
    </div>`;
  $("#bLang").onclick = () => setLang(S.lang === "bn" ? "en" : "bn");
  const B = BOARD = { n: 0, seen: new Set(), url: "" };
  const drawQR = () => {
    const u = joinURL(); if (u === B.url) return; B.url = u;
    $("#burl").textContent = u.replace(/^https?:\/\//, "").replace(/\/\?try=1$/, "");
    $("#bwarn").innerHTML = isLocalURL(u) ? `<div class="bwarn">${t("local_warn")}</div>` : "";
    qrSVG(u).then(svg => { if ($("#bqr")) $("#bqr").innerHTML = svg; }).catch(() => { if ($("#bqr")) $("#bqr").textContent = u; });
  };
  const clock = () => { const c = $("#bclk"); if (c) c.textContent = new Date().toLocaleTimeString(loc(), { hour: "2-digit", minute: "2-digit", second: "2-digit" }); };
  const run = async () => {
    if (BOARD !== B) return; B.n++;
    try {
      if (B.n % 10 === 1) { S.info = await api("/api/info"); drawQR(); }
      const [ov, feed] = await Promise.all([api("/api/overview/" + m), api("/api/board/feed")]);
      if (BOARD !== B) return; S.ov[m] = ov;
      if (B.n % 4 === 1) S.lb = await api("/api/leaderboard").catch(() => S.lb);
      $("#bidx").innerHTML = idxCardHTML(m, true); $("#bheat").innerHTML = heatHTML(m, true); refreshTape(true);
      $("#bnot").innerHTML = noticesHTML(ov.notices, 7);
      const first = B.n === 1;
      $("#bfeed").innerHTML = feed.length ? feed.map(o => { const fresh = !first && !B.seen.has(o.id); B.seen.add(o.id); return feedRowHTML(o, fresh); }).join("") : `<div class="empty">${t("feed_empty")}</div>`;
      if (S.lb) { $("#blb").innerHTML = chalHTML(S.lb, 6, true); $("#bplayers").textContent = tf("players", { n: num(S.lb.players ?? S.lb.n) }); }
    } catch (e) {}
  };
  drawQR(); clock(); run();
  B.t1 = setInterval(run, 2000); B.t2 = setInterval(clock, 1000);
}
