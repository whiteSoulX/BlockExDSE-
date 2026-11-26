
/* ═══════════════ icons ═══════════════ */
const I = {
  home: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.2 2.8 11h2.7v9h5v-6h3v6h5v-9h2.7z"/></svg>',
  markets: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5.5-5.5 4 4L21 7"/><path d="M15 7h6v6"/></svg>',
  trade: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16M7 4 3.5 7.5M7 4l3.5 3.5M17 20V4m0 16-3.5-3.5M17 20l3.5-3.5"/></svg>',
  orders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 6h14M5 12h14M5 18h9"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 9h14a4 4 0 0 1 4 4v0"/><circle cx="16.5" cy="13.5" r="1.4" fill="currentColor"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="7.5" cy="12" r="3.8"/><path d="M11.3 12H21m-3 0v3m-3-3v2.4"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#8FAADC" stroke-width="2" stroke-linejoin="round"><path d="m12 3.5 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 17l-5.4 3 1.2-6-4.5-4.2 6.1-.7z"/></svg>',
  starOn: '<svg viewBox="0 0 24 24" width="24" height="24" fill="#ED7D31" stroke="#ED7D31" stroke-width="2" stroke-linejoin="round"><path d="m12 3.5 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 17l-5.4 3 1.2-6-4.5-4.2 6.1-.7z"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  bigcheck: '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="13" height="13" fill="#fff"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  buy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v13m0 0-5-5m5 5 5-5M5 20h14"/></svg>',
  sell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17V4m0 0-5 5m5-5 5 5M5 20h14"/></svg>',
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h12m0 0-4.5-4.5M16 12l-4.5 4.5M20 5v14"/></svg>',
  shield: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3 5 6v6c0 4.3 3 7.6 7 9 4-1.4 7-4.7 7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10" stroke-linecap="round"/></svg>',
};
const PAY_COLOR = { bkash: "#E2136E", nagad: "#F6921E", rocket: "#8C3494", bank: "#1F3864", card: "#2F5597" };

/* ═══════════════ guest: sign in / sign up ═══════════════ */
function langBtn() { return `<button class="lang" id="bLang">${S.lang === "bn" ? "EN" : "বাংলা"}</button>`; }
function bindLang() { const b = $("#bLang"); if (b) b.onclick = () => setLang(S.lang === "bn" ? "en" : "bn"); }
async function mountGuest() {
  $("#main").innerHTML = `<div class="top"><span></span><div class="topr">${langBtn()}<button class="lang" id="bTour">${t("tour")}</button></div></div>
    <div class="ghero"><div class="logo">${BRAND.letter}</div><h1>${esc(BRAND.name)}</h1><p>${t("tagline")}</p>
      <div class="pills3"><span class="chip"><span class="dot"></span>DSE · LSE</span><span class="chip">${I.key.replace("<svg", '<svg width="14" height="14"')} ${t("key_ok").split(" ")[0]}…</span><span class="chip">${t("sim_only")}</span></div></div>
    <div class="card"><div class="seg"><button id="tIn" class="${S.tab === "in" ? "on" : ""}">${t("signin")}</button><button id="tUp" class="${S.tab === "up" ? "on" : ""}">${t("create")}</button></div><div id="gform"></div></div>`;
  $(".pills3 .chip:nth-child(2)").innerHTML = `${I.key.replace("<svg", '<svg width="14" height="14"')} ${S.lang === "bn" ? "ফোনে সই" : "Signed on your phone"}`;
  bindLang(); $("#bTour").onclick = () => openTour(0);
  $("#tIn").onclick = () => { S.tab = "in"; mountGuest(); }; $("#tUp").onclick = () => { S.tab = "up"; mountGuest(); };
  S.tab === "in" ? formSignIn() : formSignUp();
}
async function formSignIn() {
  $("#gform").innerHTML = `<label>${t("email")}</label><input id="em" type="email" autocomplete="username" placeholder="you@example.com">
    <label>${t("password")}</label><input id="pw" type="password" autocomplete="current-password">
    <div id="err" class="err"></div><button class="btn" id="go">${t("signin")}</button>
    <div class="sub" style="margin-top:14px;font-weight:600">${t("demo_accts")}</div><div class="dchips" id="chips"></div>`;
  $("#go").onclick = () => doLogin($("#em").value, $("#pw").value, $("#go"));
  $("#pw").onkeydown = e => { if (e.key === "Enter") $("#go").click(); };
  try { S.demo = await api("/api/demo-accounts"); } catch (e) {}
  if (!$("#chips")) return;
  $("#chips").innerHTML = S.demo.map((d, i) => `<button class="chip" data-i="${i}">${esc(d.label)} · ${esc(d.role)}</button>`).join("");
  $$("#chips .chip").forEach(c => c.onclick = () => { const d = S.demo[+c.dataset.i]; doLogin(d.email, d.password, null); });
}
function keepDemoKey(r) { if (r.demo_key) sessionStorage.setItem("bx_demo_key", r.demo_key); else sessionStorage.removeItem("bx_demo_key"); }
async function doLogin(email, password, btn) {
  busy(btn, true);
  try { const r = await api("/api/auth/login", { method: "POST", body: { email, password } }); setToken(r.token); keepDemoKey(r); await loadMe(); S.itab = "home"; route(); }
  catch (e) { const el = $("#err"); if (el) el.textContent = e.message; else toast(e.message); }
  busy(btn, false);
}
function formSignUp() {
  $("#gform").innerHTML = `<div class="demo-note">${t("signup_note")}</div>
    <label>${t("name")}</label><input id="nm" autocomplete="name">
    <label>${t("email")}</label><input id="em" type="email" autocomplete="email">
    <label>${t("mobile")}</label><input id="mo" type="tel" placeholder="01712345678" autocomplete="tel">
    <label>${t("pw_rule")}</label><input id="pw" type="password" autocomplete="new-password">
    <div id="err" class="err"></div><button class="btn" id="go">${t("create")}</button>`;
  $("#go").onclick = async () => {
    busy($("#go"), true);
    try {
      const r = await api("/api/auth/signup", { method: "POST", body: { name: $("#nm").value, email: $("#em").value, mobile: $("#mo").value, password: $("#pw").value } });
      setToken(r.token); sessionStorage.removeItem("bx_demo_key"); S.otpDemo = r.otp_demo; await loadMe(); route();
    } catch (e) { $("#err").textContent = e.message; }
    busy($("#go"), false);
  };
}

/* ═══════════════ onboarding wizard ═══════════════ */
function mountOnboard() {
  const u = S.me.user, st = u.status;
  const idx = { otp_pending: 1, kyc_pending: 2, rejected: 2, approval_pending: 3 }[st] ?? 1;
  const bar = [0, 1, 2, 3].map(i => `<div class="${i < idx ? "ok" : i === idx ? "on" : ""}"></div>`).join("");
  let body = "", addr = "";
  if (st === "otp_pending") body = `<h3 style="color:var(--navy);margin:0">${t("step2")}</h3><p class="sub">${t("step2s")}</p>
    ${S.otpDemo ? `<div class="demo-note">${t("democode")} <b class="mono" style="font-size:20px">${esc(S.otpDemo)}</b><br>${t("sms")}</div>` : ""}
    <label>${t("code")}</label><input id="otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" style="font-size:22px;letter-spacing:6px;text-align:center">
    <div id="err" class="err"></div><button class="btn" id="go">${t("verify")}</button><button class="btn ghost" id="again" style="margin-top:8px">${t("newcode")}</button>`;
  else if (st === "kyc_pending" || st === "rejected") {
    addr = BXSign.addressOf(ensureKey());
    body = `<h3 style="color:var(--navy);margin:0">${t("step3")}</h3><p class="sub">${t("step3s")}</p>
    ${st === "rejected" ? `<div class="warnbox">${t("notapproved")}: ${esc(u.reject_reason)}. ${t("again")}</div>` : ""}
    <label>${t("nid")}</label><input id="nid" inputmode="numeric" autocomplete="off">
    <label>${t("photo")}</label><input id="ph" type="file" accept="image/*">
    <p class="sub">${t("nid_note")}</p>
    <div class="infobox" id="keynote">${I.key.replace("<svg", '<svg width="16" height="16" style="vertical-align:-3px"')} ${t("keynote")}<div class="sub" style="margin-top:4px">${H(addr)}</div></div>
    <div id="err" class="err"></div><button class="btn" id="go">${t("submit_ap")}</button>`;
  } else body = `<h3 style="color:var(--navy);margin:0"><span class="spin"></span>${t("waiting")}</h3><p class="sub">${t("step4s")} ${t("id_end")} <b>${esc(u.nid_last4)}</b>.</p>
    <div class="demo-note">${t("broker_tip")}</div>`;
  $("#main").innerHTML = `<div class="top"><div class="brand"><div class="logo">${BRAND.letter}</div>${esc(BRAND.name)}</div><div class="topr">${langBtn()}<button class="lang" id="bOut2">${t("signout")}</button></div></div>
    <div class="card"><div class="prog">${bar}</div>${body}</div>`;
  bindLang(); $("#bOut2").onclick = async () => { try { await api("/api/auth/logout", { method: "POST" }); } catch (e) {} signOutLocal(); };
  if (st === "otp_pending") {
    $("#go").onclick = () => act($("#go"), () => api("/api/auth/otp/verify", { method: "POST", body: { code: $("#otp").value } }), t("contact_ok"));
    $("#again").onclick = async () => { try { const r = await api("/api/auth/otp/resend", { method: "POST" }); S.otpDemo = r.otp_demo; mountOnboard(); } catch (e) { $("#err").textContent = e.message; } };
  } else if (st === "kyc_pending" || st === "rejected") {
    $("#go").onclick = () => act($("#go"), async () => {
      let ph = null; const f = $("#ph").files[0];
      if (f && window.crypto && crypto.subtle) { const d = await crypto.subtle.digest("SHA-256", await f.arrayBuffer()); ph = [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join(""); }
      return api("/api/kyc", { method: "POST", body: { nid: $("#nid").value, photo_hash: ph, wallet: addr } });
    }, t("submitted"));
  }
}

/* ═══════════════ investor app ═══════════════ */
const ITABS = [["home", "home"], ["markets", "markets"], ["trade", "trade"], ["orders", "orders"], ["wallet", "wallet"]];
function renderInv() {
  const u = S.me.user, initials = u.name.split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase();
  $("#itop").innerHTML = `<div class="top"><div class="brand"><div class="logo">${BRAND.letter}</div><div>${esc(BRAND.name)}<small>${esc(BRAND.project)}</small></div></div>
      <div class="topr">${langBtn()}<button class="avatar" id="bMe" title="${esc(t("profile"))}">${esc(initials)}</button></div></div>
    <div class="chiprow"><button class="chip" id="cMk"><span class="dot ${isLive() ? "" : "off"}" id="liveDot"></span>${esc(S.market)} ${t("market_chip")} ⇄</button>
      <span class="chip" id="cKey" style="${S.key ? "" : "color:var(--bad)"}">${I.key.replace("<svg", '<svg width="15" height="15"')} ${S.key ? t("key_ok") : t("key_no")}</span></div>`;
  bindLang(); $("#bMe").onclick = () => goTab("me");
  $("#cMk").onclick = () => { const ks = Object.keys(S.info.markets); S.market = ks[(ks.indexOf(S.market) + 1) % ks.length]; sessionStorage.setItem("bx_mk", S.market); S.cur = null; S.form.price = null; route(); };
  $("#cKey").onclick = () => goTab("me");
  const tabOf = S.itab === "stock" ? "markets" : S.itab;
  const nActive = S.orders.filter(isActive).length;
  $("#itabs").innerHTML = ITABS.map(([k, ic]) => `<button class="tab ${tabOf === k ? "on" : ""}" data-t="${k}">${I[ic]}${t(k)}${k === "orders" && nActive ? `<span class="cnt">${nActive}</span>` : ""}</button>`).join("");
  $$("#itabs .tab").forEach(b => b.onclick = () => goTab(b.dataset.t));
  ({ home: mountHome, markets: mountMarkets, stock: mountStock, trade: mountTrade, orders: mountIOrders, wallet: mountWallet, me: mountMe })[S.itab]();
  if (S.guide.on) showCoach();
}
function goTab(k) { if (S.guide.on && k !== "trade") endGuide(); S.itab = k; window.scrollTo(0, 0); renderInv(); tick(); }
function refreshLive() {
  if (S.view === "inv") {
    const d = $("#liveDot"); if (d) d.className = "dot " + (isLive() ? "" : "off");
    if (S.itab === "home") refreshHome(); else if (S.itab === "markets") refreshMarkets(); else if (S.itab === "stock") refreshStock(); else if (S.itab === "trade") syncTrade();
    return;
  }
  if ($("#strip")) { $("#strip").innerHTML = stripHTML(); $$("#strip .trow").forEach(r => r.onclick = () => { S.tk[S.market] = r.dataset.t; refreshLive(); }); }
  if ($("#ladder")) $("#ladder").innerHTML = ladderHTML();
  if ($("#tape")) $("#tape").innerHTML = tapeHTML();
  if ($("#liveDot")) $("#liveDot").className = "live " + (isLive() ? "on" : "");
}

/* ───────── portfolio maths ───────── */
function pf(m) {
  const p = S.portfolios && S.portfolios[m]; if (!p) return null;
  const tks = S.info.markets[m].tickers; let val = p.cash + p.locked_cash, refv = val; const rows = [];
  for (const [k, q0] of Object.entries(p.shares)) {
    const q = q0 + (p.locked_shares[k] || 0); if (!q) continue;
    const last = lastOf(m, k), ref = tks[k].ref; val += q * last; refv += q * ref;
    rows.push({ k, q, last, ref, value: q * last, chg: (last - ref) / ref * 100, locked: p.locked_shares[k] || 0 });
  }
  return { val, refv, chg: refv ? (val - refv) / refv * 100 : 0, rows, cash: p.cash, locked: p.locked_cash };
}
async function loadHist(m, tk) {
  const k = m + ":" + tk; if (S.hist[k]) return S.hist[k];
  try { S.hist[k] = await api(`/api/history/${m}/${tk}`); } catch (e) { S.hist[k] = null; }
  return S.hist[k];
}
async function loadAllHist(m) { await Promise.all(Object.keys(S.info.markets[m].tickers).map(tk => loadHist(m, tk))); }
function spark(vals, w, h, color, area) {
  if (!vals || vals.length < 2) vals = [1, 1];
  const mn = Math.min(...vals), mx = Math.max(...vals), sp = mx - mn || 1;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * (w - 4) + 2, h - 3 - ((v - mn) / sp) * (h - 6)]);
  const d = "M" + pts.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L");
  const id = "g" + Math.random().toString(36).slice(2, 7);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${area ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${d} L${w - 2} ${h} L2 ${h}Z" fill="url(#${id})"/>` : ""}<path d="${d}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function portfolioSeries(m) {
  const p = S.portfolios && S.portfolios[m]; if (!p) return null;
  const rows = Object.entries(p.shares).map(([k, q]) => [k, q + (p.locked_shares[k] || 0)]).filter(r => r[1]);
  const hs = rows.map(([k]) => S.hist[m + ":" + k]); if (hs.some(h => !h)) return null;
  const n = hs.length ? hs[0].daily.length : 0, base = p.cash + p.locked_cash;
  const out = []; for (let i = 0; i < n; i++) out.push(base + rows.reduce((s, [k, q], j) => s + q * hs[j].daily[i].close, 0));
  const v = pf(m); if (v) out.push(v.val);
  return out;
}

/* ───────── order helpers ───────── */
const ACTIVE = ["submitted", "edge_validated", "consensus", "open", "partial", "held"];
const isActive = o => ACTIVE.includes(o.status);
function stepState(o) {
  const st = o.stages || {}, fail = o.status === "rejected", held = o.status === "held";
  const done = [true, !!(st.edge_validated || st.consensus || o.place_tx), !!(st.consensus || o.place_tx), !!o.place_tx,
                !!(st.matched || st.settled || (o.trades && o.trades.length)), o.status === "settled"];
  let cur = done.indexOf(false); const cls = done.map(d => d ? "done" : "");
  if (cur >= 0) { if (fail) cls[cur] = "fail"; else if (held) cls[cur] = "hold"; else if (!["cancelled", "part_filled"].includes(o.status)) cls[cur] = "now"; }
  if (["cancelled", "part_filled"].includes(o.status) && cur >= 0) cls[cur] = "fail";
  return { cls, done, cur };
}
function stepsHTML(o) {
  const lab = [t("s_signed"), t("s_edge"), o && o.votes ? ofN(o.votes.agree, S.info.validators) : t("s_votes"), t("s_chain"), t("s_match"), t("s_settle")];
  if (!o) return `<div class="steps">${lab.map(l => `<div class="st"><i></i>${l}</div>`).join("")}</div>`;
  const s = stepState(o), n = s.done.filter(Boolean).length, w = Math.max(0, n - 1) / 5 * 100;
  return `<div class="steps"><div class="bar" style="width:calc((100% - 36px) * ${w / 100})"></div>${lab.map((l, i) => `<div class="st ${s.cls[i]}"><i>${s.cls[i] === "done" ? I.check : s.cls[i] === "fail" ? I.x : s.cls[i] === "hold" ? I.pause : ""}</i>${esc(l)}</div>`).join("")}</div>`;
}
function vchips(o) {
  const n = S.info.validators, det = (o && o.votes && o.votes.detail) || [];
  return `<div class="vals">${Array.from({ length: n }, (_, i) => { const d = det.find(x => x.node === i + 1);
    const cls = !d ? "" : d.agree ? "y" : d.verdict === "not-asked" ? "" : "n"; return `<div class="v ${cls}" title="${esc(d ? d.reason || d.verdict || "" : "")}">V${i + 1}${cls === "y" ? " ✓" : ""}</div>`; }).join("")}</div>`;
}
function statusTag(o) {
  const cls = { settled: "ok", rejected: "bad", cancelled: "bad", part_filled: "bad", held: "wait", open: "wait", partial: "wait" }[o.status] || "";
  return `<span class="tag ${cls}">${esc(t("st_" + o.status))}</span>`;
}
function riskTag(o) { return o.risk && o.risk.level ? `<span class="tag ${o.risk.level === "ESCALATED" ? "esc" : ""}">${o.risk.level === "ESCALATED" ? t("escalated") : t("routine")} · s ${num(o.risk.score_bps)}</span>` : ""; }
function plainOf(o) {
  if (o.status === "rejected") return `${t("p_rejected")}: ${esc(o.error || "")}`;
  if (o.status === "settled") return t("p_settled");
  if (o.status === "open") return t("p_open");
  if (o.status === "partial") return t("p_partial");
  if (o.status === "held") return t("p_held");
  if (o.status === "cancelled" || o.status === "part_filled") return t("p_cancelled");
  return t("p_checking");
}
function orderLine(o) { return `<b class="${o.side === "BUY" ? "b" : "s"}">${o.side === "BUY" ? t("buy_o") : t("sell_o")}</b> ${num(o.qty)} ${esc(o.ticker)} ${o.otype === "MARKET" ? "· " + t("market_o") : "@ " + price$(o.market, o.price)}`; }
function liveOrderHTML(o) {
  if (!o) return `<div class="card"><div class="empty">${t("no_orders")}</div>${stepsHTML(null)}</div>`;
  const off = ((o.votes && o.votes.detail) || []).filter(d => !d.agree && d.verdict !== "not-asked").map(d => "V" + d.node);
  const anchored = o.trades && o.trades.length && o.trades.every(x => x.record_hash);
  const wait = o.status === "open" || o.status === "partial" ? (o.side === "BUY" ? t("waiting_match") : t("waiting_match_s")) : "";
  return `<div class="card"><div class="ord"><span>${orderLine(o)}</span>${riskTag(o) || statusTag(o)}</div>${stepsHTML(o)}${vchips(o)}
    <div class="foot"><span>${off.length ? `${off.join(", ")} ${t("offline")}${o.place_tx ? " · " + t("quorum_met") : ""}` : wait || esc(plainOf(o))}</span>${anchored ? `<b>${t("anchored")}</b>` : o.status === "rejected" ? `<span class="dn">${t("st_rejected")}</span>` : ""}</div>
    ${o.status === "rejected" || o.status === "held" ? `<div class="oc plain" style="box-shadow:none;margin:8px 0 0;padding:8px 10px;background:${o.status === "held" ? "var(--warnbg)" : "var(--badbg)"}">${esc(plainOf(o))}</div>` : ""}</div>`;
}
function latestOrder() { return S.orders.find(x => x.id === S.cur) || S.orders.filter(o => o.market === S.market)[0] || S.orders[0] || null; }

/* ───────── home ───────── */
function mountHome() {
  $("#main").innerHTML = `<div class="card hero" id="hero"></div>
    <div class="qa"><button data-a="buy">${I.buy}${t("buy")}</button><button data-a="sell">${I.sell}${t("sell")}</button><button data-a="add">${I.add}${t("add_money")}</button><button data-a="out">${I.out}${t("withdraw")}</button></div>
    <div id="startcard"></div>
    <div class="sec"><b>${t("live_order")}</b><a data-go="orders">${t("see_all")}</a></div><div id="liveord"></div>
    <div class="sec"><b>${t("watchlist")}</b><a data-go="markets">${t("markets")}</a></div><div class="card" id="watch"></div>
    <div class="sec"><b>${t("holdings")}</b><span>${esc(S.market)}</span></div><div class="card" id="holds"></div>`;
  $$(".qa button").forEach(b => b.onclick = () => {
    const a = b.dataset.a;
    if (a === "buy" || a === "sell") { S.side = a.toUpperCase(); goTab("trade"); }
    else if (a === "add") { goTab("wallet"); openDeposit(); } else { goTab("wallet"); openWithdraw(); }
  });
  $$("[data-go]").forEach(b => b.onclick = () => goTab(b.dataset.go));
  refreshHome();
  loadAllHist(S.market).then(() => { if (S.itab === "home") refreshHome(); });
}
function refreshHome() {
  if (!$("#hero")) return;
  const v = pf(S.market), ser = portfolioSeries(S.market);
  $("#hero").innerHTML = v ? `<div class="lbl">${t("pv")} · ${esc(S.market)}</div><div class="val">${cash$(S.market, v.val)}</div>
      <div class="chg ${v.chg < 0 ? "neg" : ""}">${v.chg >= 0 ? "▲" : "▼"} ${pct(Math.abs(v.chg)).replace("+", "")} ${t("today")}</div>
      <div class="note2">${t("hist_note")}</div>${spark(ser, 130, 46, "#A8E6C1", false)}` : `<div class="lbl">${t("pv")}</div><div class="val"><span class="spin"></span></div>`;
  const none = !S.orders.some(o => !o.sim);
  $("#startcard").innerHTML = none && !S.guide.on ? `<div class="card" style="border:1.5px dashed var(--sky)"><b style="color:var(--navy);font-size:16px">${t("start_title")}</b><div class="sub" style="margin:4px 0 10px;font-size:13.5px">${t("start_text")}</div><button class="btn" id="bGuide">${t("start_btn")}</button></div>` : "";
  if ($("#bGuide")) $("#bGuide").onclick = startGuide;
  $("#liveord").innerHTML = liveOrderHTML(latestOrder());
  const wl = (S.watch[S.market] || []).filter(k => MK().tickers[k]);
  $("#watch").innerHTML = wl.length ? wl.map(stockRow).join("") : `<div class="empty">${t("watch_empty")}</div>`;
  $("#holds").innerHTML = v && v.rows.length ? v.rows.map(r => `<div class="lrow" data-s="${esc(r.k)}"><div class="l"><div class="tk">${esc(r.k.slice(0, 4))}</div><div style="min-width:0"><div class="nm">${esc(MK().tickers[r.k].name)}</div><small>${num(r.q)} ${t("shares")}${r.locked ? ` · ${num(r.locked)} 🔒` : ""}</small></div></div>
      <div class="r"><b>${cash$(S.market, r.value)}</b><br>${pcHTML(r.chg)}</div></div>`).join("") : `<div class="empty">—</div>`;
  $$("#watch .lrow, #holds .lrow").forEach(r => r.onclick = () => openStock(r.dataset.s));
}
function stockRow(k) {
  const m = S.market, x = MK().tickers[k], sn = snap(), v = sn && sn.tickers[k], last = v ? v.last : x.ref, chg = v ? v.chg : 0, h = S.hist[m + ":" + k];
  const vals = h ? h.daily.map(d => d.close).concat([last]) : null;
  return `<div class="lrow" data-s="${esc(k)}"><div class="l"><div class="tk">${esc(k.slice(0, 4))}</div><div style="min-width:0"><div class="nm">${esc(x.name)}</div><small>${esc(k)} · ${esc(x.sector || "")}</small></div></div>
    <div style="flex:none">${vals ? spark(vals.slice(-20), 58, 26, vals[vals.length - 1] < vals[Math.max(0, vals.length - 20)] ? "#C0392B" : "#2E9E5B", false) : ""}</div>
    <div class="r"><b>${price$(m, last)}</b><br>${pcHTML(chg)}</div></div>`;
}

/* ───────── markets ───────── */
function mountMarkets() {
  const sectors = [...new Set(Object.values(MK().tickers).map(x => x.sector).filter(Boolean))];
  const mks = Object.keys(S.info.markets);
  $("#main").innerHTML = `<div class="seg">${mks.map(m => `<button data-m="${m}" class="${m === S.market ? "on" : ""}">${esc(m)} · ${esc(S.info.markets[m].name.replace(" Stock Exchange", ""))}</button>`).join("")}</div>
    <div class="search">${I.search}<input id="q" placeholder="${esc(t("search"))}" value="${esc(S.q)}" autocomplete="off"></div>
    <div class="hscroll" id="mf"><button class="chip ${S.mfilter === "all" ? "on" : ""}" data-f="all">${t("all")}</button><button class="chip ${S.mfilter === "watch" ? "on" : ""}" data-f="watch">★ ${t("watchlist")}</button>${sectors.map(s => `<button class="chip ${S.mfilter === s ? "on" : ""}" data-f="${esc(s)}">${esc(s)}</button>`).join("")}</div>
    <div class="card" id="mlist"></div><div class="sub" style="text-align:center">${esc(MK().hours)}</div>`;
  $$(".seg button[data-m]").forEach(b => b.onclick = () => { S.market = b.dataset.m; sessionStorage.setItem("bx_mk", S.market); S.mfilter = "all"; route(); });
  $("#q").oninput = () => { S.q = $("#q").value; refreshMarkets(); };
  $$("#mf .chip").forEach(b => b.onclick = () => { S.mfilter = b.dataset.f; $$("#mf .chip").forEach(c => c.classList.toggle("on", c === b)); refreshMarkets(); });
  refreshMarkets();
  loadAllHist(S.market).then(() => { if (S.itab === "markets") refreshMarkets(); });
}
function refreshMarkets() {
  if (!$("#mlist")) return;
  const q = S.q.trim().toLowerCase(), wl = S.watch[S.market] || [];
  const ks = Object.entries(MK().tickers).filter(([k, x]) => (!q || k.toLowerCase().includes(q) || x.name.toLowerCase().includes(q)) &&
    (S.mfilter === "all" || (S.mfilter === "watch" ? wl.includes(k) : x.sector === S.mfilter))).map(e => e[0]);
  $("#mlist").innerHTML = ks.map(stockRow).join("") || `<div class="empty">—</div>`;
  $$("#mlist .lrow").forEach(r => r.onclick = () => openStock(r.dataset.s));
}
function openStock(k) { S.stock = k; S.tk[S.market] = k; S.itab = "stock"; window.scrollTo(0, 0); renderInv(); }

/* ───────── stock page ───────── */
function mountStock() {
  const k = S.stock, x = MK().tickers[k]; if (!x) { S.itab = "markets"; return mountMarkets(); }
  const on = (S.watch[S.market] || []).includes(k);
  $("#main").innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><button class="back" id="bBack">${I.back} ${t("markets")}</button>
      <button class="star" id="bStar" title="${esc(on ? t("following") : t("follow"))}">${on ? I.starOn : I.star}</button></div>
    <div style="margin:2px 2px 10px"><div class="sub" style="font-weight:700">${esc(k)} · ${esc(x.sector)}</div><div style="font-size:20px;font-weight:800;color:var(--navy)">${esc(x.name)}</div><div class="sub">${esc(x.about)}</div></div>
    <div class="card"><div id="sprice"></div><div class="seg sm" style="margin:10px 0 6px;max-width:220px"><button data-r="1D" class="${S.histRange === "1D" ? "on" : ""}">${t("chart_1d")}</button><button data-r="1M" class="${S.histRange === "1M" ? "on" : ""}">${t("chart_1m")}</button></div>
      <div id="chart"></div><div class="sub" id="chartnote"></div></div>
    <div class="card"><div class="stats" id="sstats"></div><div id="srange"></div></div>
    <div class="card"><div class="book" id="sbook"></div></div>
    <div class="sec"><b>${t("recent")}</b></div><div class="card" id="stape"></div><div style="height:70px"></div>
    <div class="sticky"><div class="in row2"><button class="btn buy" id="sBuy">${t("buy")}</button><button class="btn sell" id="sSell">${t("sell")}</button></div></div>`;
  $("#bBack").onclick = () => goTab("markets");
  $("#bStar").onclick = async () => { try { S.watch = await api("/api/watchlist", { method: "POST", body: { market: S.market, ticker: k, on: !on } }); mountStock(); } catch (e) { toast(e.message); } };
  $$("[data-r]").forEach(b => b.onclick = () => { S.histRange = b.dataset.r; mountStock(); });
  $("#sBuy").onclick = () => { S.side = "BUY"; S.form.price = null; goTab("trade"); };
  $("#sSell").onclick = () => { S.side = "SELL"; S.form.price = null; goTab("trade"); };
  refreshStock(); loadHist(S.market, k).then(() => { if (S.itab === "stock") refreshStock(); });
}
function refreshStock() {
  if (!$("#sprice")) return;
  const m = S.market, k = S.stock, x = MK().tickers[k], sn = snap(), v = sn && sn.tickers[k];
  const last = v ? v.last : x.ref, chg = v ? v.chg : 0, h = S.hist[m + ":" + k];
  $("#sprice").innerHTML = `<div class="big">${price$(m, last)}</div><div>${pcHTML(chg)} <span class="sub">${t("today")}</span></div>`;
  let vals, note;
  if (S.histRange === "1M") { vals = h ? h.daily.map(d => d.close).concat([last]) : null; note = t("ill"); }
  else { const tr = h ? h.today.map(p => p.price) : []; const live = (sn ? sn.tape : []).filter(q => q.ticker === k).map(q => q.price).reverse();
    vals = [x.ref].concat(live.length ? live : tr); note = vals.length > 1 ? t("today_trades") : t("no_trades_today"); if (vals.length < 2) vals = [x.ref, x.ref]; }
  $("#chart").innerHTML = vals ? `<div style="width:100%">${spark(vals, 340, 150, vals[vals.length - 1] < vals[0] ? "#C0392B" : "#2F5597", true).replace('width="340"', 'width="100%"').replace('height="150"', 'height="150" preserveAspectRatio="none"')}</div>` : `<div style="height:150px;display:flex;align-items:center;justify-content:center"><span class="spin"></span></div>`;
  $("#chartnote").textContent = note;
  const lo = x.lo, hi = x.hi, posOf = p => Math.max(0, Math.min(100, (p - lo) / (hi - lo) * 100));
  $("#sstats").innerHTML = `<div><small>${t("ref")}</small><b>${price$(m, x.ref)}</b></div><div><small>${t("dayrange")}</small><b>${v && v.low != null ? `${price$(m, v.low)} – ${price$(m, v.high)}` : "—"}</b></div>
    <div><small>${t("band")} ±${num(x.band)}%</small><b>${price$(m, lo)} – ${price$(m, hi)}</b></div><div><small>${t("volume")}</small><b>${num(v ? v.volume : 0)}</b></div>`;
  $("#srange").innerHTML = `<div class="rangebar"><i style="left:${posOf(last)}%"></i></div><div class="foot"><span>${price$(m, lo)}</span><span>${t("allowed")}</span><span>${price$(m, hi)}</span></div>`;
  const bids = v ? v.bids : [], asks = v ? v.asks : [], mx = Math.max(1, ...bids.map(a => a[1]), ...asks.map(a => a[1]));
  $("#sbook").innerHTML = `<div><div class="h"><span>${t("buyers")}</span><span>${t("qty")}</span></div>${bids.map(a => `<div class="lv bid"><i style="width:${a[1] / mx * 100}%"></i><span class="up">${price$(m, a[0])}</span><span>${num(a[1])}</span></div>`).join("") || `<div class="empty">${t("none_side")}</div>`}</div>
    <div><div class="h"><span>${t("sellers")}</span><span>${t("qty")}</span></div>${asks.map(a => `<div class="lv ask"><i style="width:${a[1] / mx * 100}%"></i><span class="dn">${price$(m, a[0])}</span><span>${num(a[1])}</span></div>`).join("") || `<div class="empty">${t("none_side")}</div>`}</div>`;
  const tape = (sn ? sn.tape : []).filter(q => q.ticker === k).slice(0, 6);
  $("#stape").innerHTML = tape.map(q => `<div class="lrow" style="cursor:default;padding:7px 0"><span>${num(q.qty)} @ <b>${price$(m, q.price)}</b></span><span class="sub">${new Date(q.t).toLocaleTimeString(loc())}</span></div>`).join("") || `<div class="empty">${t("none_yet")}</div>`;
}

/* ───────── trade ───────── */
function defaultPrice(tk) { const e = expectPrice(tk, S.side); return e != null ? e : lastOf(S.market, tk); }
function mountTrade() {
  const cfg = MK(), tk = selTicker();
  if (S.form.ticker !== tk || S.form.market !== S.market || !S.form.price) { S.form.ticker = tk; S.form.market = S.market; S.form.price = defaultPrice(tk); }
  $("#main").innerHTML = `<div class="sec"><b>${t("new_order")}</b><span>${t("checked_by")}</span></div>
    <div class="card" id="tcard">
      <div class="seg side" id="side"><button class="${S.side === "BUY" ? "on" : ""}" data-s="BUY">${t("buy")}</button><button class="sell ${S.side === "SELL" ? "on" : ""}" data-s="SELL">${t("sell")}</button></div>
      <div class="f" id="f-tk" style="margin-bottom:8px"><small>${t("stock")}</small><select id="tk">${Object.entries(cfg.tickers).map(([k, v]) => `<option value="${esc(k)}" ${k === tk ? "selected" : ""}>${esc(k)} · ${esc(v.name)}</option>`).join("")}</select></div>
      <div class="seg sm" id="otype" style="max-width:260px"><button class="${S.otype === "LIMIT" ? "on" : ""}" data-o="LIMIT">${t("limit")}</button><button class="${S.otype === "MARKET" ? "on" : ""}" data-o="MARKET">${t("market_o")}</button></div>
      <div class="row2" style="margin-bottom:8px">
        <div class="f" id="f-qty"><small>${t("quantity")}</small><input id="qty" type="number" inputmode="numeric" min="1" value="${esc(S.form.qty)}"></div>
        <div class="f" id="f-px"><small>${S.otype === "MARKET" ? t("market_o") : t("limit")} (${esc(cfg.currency === "GBX" ? "p" : "Tk")})<button class="help" id="hLim" type="button">?</button></small><input id="px" type="number" inputmode="numeric" min="1" value="${S.otype === "MARKET" ? "" : esc(S.form.price)}" ${S.otype === "MARKET" ? "disabled placeholder=\"best\"" : ""}></div>
      </div>
      <div class="hint" id="hint"></div><div id="cost"></div><div id="risk"></div><div id="warn"></div>
      <button class="btn ${S.side === "BUY" ? "buy" : "sell"}" id="go">${I.key} ${t("sign_submit")}</button>
      <div class="sub" style="margin-top:8px;text-align:center" id="keyline">${S.key ? `${t("signed_with")} ${H(S.me.user.wallet)}` : `<span class="dn">${t("nokey_trade")}</span>`}</div>
    </div>
    <div class="sec"><b>${t("live_order")}</b><span id="curId"></span></div><div id="liveord"></div>`;
  $$("#side button").forEach(b => b.onclick = () => { S.side = b.dataset.s; S.form.price = defaultPrice($("#tk").value); mountTrade(); });
  $$("#otype button").forEach(b => b.onclick = () => { S.otype = b.dataset.o; mountTrade(); });
  $("#tk").onchange = () => { S.tk[S.market] = $("#tk").value; S.form.ticker = $("#tk").value; S.form.price = defaultPrice($("#tk").value); mountTrade(); };
  $("#qty").oninput = () => { S.form.qty = $("#qty").value; syncTrade(); };
  if (S.otype === "LIMIT") $("#px").oninput = () => { S.form.price = $("#px").value; syncTrade(); };
  $("#hLim").onclick = () => toast(t("limit_help"));
  $("#go").onclick = submitOrder;
  if (S.prefill) {
    const p = S.prefill; S.prefill = null; S.side = p.side; S.otype = p.otype || "LIMIT"; if (p.ticker) { S.tk[S.market] = p.ticker; S.form.ticker = p.ticker; }
    S.form.qty = p.qty; S.form.price = p.price || defaultPrice(p.ticker); return mountTrade();
  }
  syncTrade();
}
function syncTrade() {
  if (!$("#risk")) return;
  const cfg = MK(), m = S.market, tk = $("#tk").value, q = Math.floor(+$("#qty").value), mkt = S.otype === "MARKET";
  const x = cfg.tickers[tk], p = mkt ? (S.side === "BUY" ? x.hi : x.lo) : Math.floor(+$("#px").value);
  const best = expectPrice(tk, S.side), pfm = S.portfolios && S.portfolios[m];
  $("#hint").innerHTML = `${S.side === "BUY" ? t("best_seller") : t("best_buyer")}: <b>${best != null ? price$(m, best) : t("none_side")}</b> · ${t("ref")} ${price$(m, x.ref)} · ${t("allowed")} ${price$(m, x.lo)}–${price$(m, x.hi)}`;
  let warn = "", block = !S.key;
  if (!(q > 0) || (!mkt && !(p > 0))) { block = true; $("#risk").innerHTML = ""; $("#cost").innerHTML = ""; $("#warn").innerHTML = ""; busy($("#go"), true); return; }
  const r = riskOf(tk, q, p, S.otype), estPx = mkt ? (best ?? x.ref) : p, total = q * estPx;
  const have = pfm ? (S.side === "BUY" ? pfm.cash : (pfm.shares[tk] || 0)) : null;
  $("#cost").innerHTML = `<div class="cost"><span>${S.side === "BUY" ? t("you_pay") : t("you_get")}<br><b>${cash$(m, total)}</b></span><span style="text-align:right">${S.side === "BUY" ? t("available") : t("avail_sh")}<br><b>${have == null ? "…" : S.side === "BUY" ? cash$(m, have) : num(have) + " " + t("shares")}</b></span></div>`;
  const qn = cfg.quorum, n = S.info.validators, pin = Math.min(r.score / 100, 100);
  $("#risk").innerHTML = `<div class="risk ${r.esc ? "esc" : ""}"><div class="rt"><span>${t("risk_t")}</span><span>${num(r.score)} / ${num(10000)}</span></div>
    <div class="meter"><div class="thr"></div><div class="pin" style="left:${pin}%"></div></div>
    <div class="msg">${needQ(r.esc, qn, n)}</div>
    <div class="sub" style="margin-top:3px">${r.esc ? t("risk_esc") : t("risk_routine")}</div></div>`;
  if (r.out && !mkt) { warn = `<div class="warnbox">${t("out_band")}</div>`; block = true; }
  else if (r.big) { warn = `<div class="warnbox">${t("too_big")}</div>`; block = true; }
  else if (mkt && best == null) { warn = `<div class="warnbox soft">${t("no_side_mkt")}</div>`; }
  else if (have != null && S.side === "BUY" && (mkt ? q * x.hi : total) > have) { warn = `<div class="warnbox">${t("no_cash")} <button class="btn sm ghost" id="toW" style="margin-left:6px">${t("go_wallet")}</button></div>`; block = true; }
  else if (have != null && S.side === "SELL" && q > have) { warn = `<div class="warnbox">${t("no_shares")}</div>`; block = true; }
  if (mkt && !warn) warn = `<div class="sub" style="margin-bottom:10px">${t("mkt_note")}</div>`;
  $("#warn").innerHTML = warn; if ($("#toW")) $("#toW").onclick = () => { goTab("wallet"); openDeposit(); };
  if (!$("#go").dataset.sending) busy($("#go"), block);
  const o = S.orders.find(z => z.id === S.cur) || null;
  $("#liveord").innerHTML = liveOrderHTML(o); $("#curId").textContent = o ? o.id : "";
  if (S.guide.on && S.guide.step === GUIDE.length - 1 && o && o.status !== S.guide.seen) { S.guide.seen = o.status; showCoach(); }
}
async function submitOrder() {
  const b = $("#go"); b.dataset.sending = "1"; busy(b, true);
  try {
    const cfg = MK(), tk = $("#tk").value, q = Math.floor(+$("#qty").value);
    const price = S.otype === "LIMIT" ? Math.floor(+$("#px").value) : (S.side === "BUY" ? cfg.tickers[tk].hi : cfg.tickers[tk].lo);
    if (!S.key) throw new Error(t("nokey_trade"));
    const order = { trader: S.me.user.wallet, ticker: tk, qty: q, price, side: S.side, otype: S.otype, nonce: BXSign.randomNonce(), expiry: Math.floor(Date.now() / 1000) + 1800 };
    const sig = BXSign.sign(S.key, BXSign.orderDigest(domainOf(S.market), order));      // signed here; only the signature leaves the device
    const r = await api("/api/order", { method: "POST", body: { market: S.market, ticker: tk, qty: q, price, side: S.side, otype: S.otype, nonce: order.nonce, expiry: order.expiry, sig } });
    S.cur = r.id; toast(t("sent"));
    S.orders = await api("/api/orders").catch(() => S.orders);
    if (S.guide.on) { S.guide.step = 6; showCoach(); }
    syncTrade(); $("#liveord").scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (e) { toast(e.message); }
  setTimeout(() => { delete b.dataset.sending; syncTrade(); }, 600);
}

/* ───────── guided first trade ───────── */
const GUIDE = [["g1t", "g1", "#f-tk"], ["g2t", "g2", "#side"], ["g3t", "g3", "#f-qty"], ["g4t", "g4", "#f-px"], ["g5t", "g5", "#risk"], ["g6t", "g6", "#go"], ["g7t", "g7", "#liveord"]];
function startGuide() {
  const tks = Object.keys(MK().tickers), sn = snap(), hasAsk = k => sn && sn.tickers[k] && sn.tickers[k].asks.length;
  const pick = hasAsk("GP") ? "GP" : tks.find(hasAsk) || (tks.includes("GP") ? "GP" : tks[0]);
  const qty = hasAsk(pick) ? Math.max(1, Math.min(10, sn.tickers[pick].asks[0][1])) : 10;
  S.guide = { on: true, step: 0 }; S.side = "BUY"; S.otype = "LIMIT"; S.tk[S.market] = pick; S.form = { qty, price: null, ticker: null }; S.cur = null;
  S.itab = "trade"; window.scrollTo(0, 0); renderInv();
}
function hideCoach() { const c = $("#coach"); if (c) c.style.display = "none"; $$(".glow").forEach(x => x.classList.remove("glow")); const sh = $(".shell"); if (sh) sh.style.paddingBottom = ""; }
function endGuide() { S.guide = { on: false, step: 0 }; hideCoach(); }
function showCoach() {
  if (S.itab !== "trade") return hideCoach();
  const i = S.guide.step, [tt, tx, sel] = GUIDE[i], c = $("#coach");
  $$(".glow").forEach(x => x.classList.remove("glow"));
  const el = $(sel); if (el) { el.classList.add("glow"); setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 60); }
  const sh = $(".shell"); if (sh) sh.style.paddingBottom = "260px";
  const last = i === GUIDE.length - 1, signStep = i === 5;
  const co = last && S.orders.find(z => z.id === S.cur), body = co && (co.status === "open" || co.status === "partial") ? t("g7w") : t(tx);
  c.innerHTML = `<div class="cb"><div class="cs"><span>${t("guided")} · ${t("step")} ${num(i + 1)}/${num(GUIDE.length)}</span><span>${esc(BRAND.name)}</span></div><h4>${t(tt)}</h4><p>${body}</p>
    <div class="cbtn">${i > 0 && !last ? `<button class="pv" id="cPv">${t("back")}</button>` : ""}<button class="nx" id="cNx" ${signStep && !S.key ? "disabled" : ""}>${last ? t("finish") : signStep ? t("sign_submit") : t("next")}</button>${last ? "" : `<button class="x" id="cX">${t("skip")}</button>`}</div></div>`;
  c.style.display = "block";
  if ($("#cPv")) $("#cPv").onclick = () => { S.guide.step--; showCoach(); };
  if ($("#cX")) $("#cX").onclick = endGuide;
  $("#cNx").onclick = () => { if (last) return endGuide(); if (signStep) { if (!$("#go").disabled) submitOrder(); else toast(($("#warn") && $("#warn").textContent) || t("nokey_trade")); return; } S.guide.step++; showCoach(); };
}

/* ───────── orders ───────── */
function mountIOrders() {
  $("#main").innerHTML = `<div class="sec"><b>${t("orders")}</b><span>DSE · LSE</span></div>
    <div class="seg" id="of"><button data-f="active" class="${S.ofilter === "active" ? "on" : ""}">${t("active")}</button><button data-f="done" class="${S.ofilter === "done" ? "on" : ""}">${t("completed")}</button><button data-f="all" class="${S.ofilter === "all" ? "on" : ""}">${t("all")}</button></div><div id="olist2"></div>`;
  $$("#of button").forEach(b => b.onclick = () => { S.ofilter = b.dataset.f; mountIOrders(); });
  refreshIOrders();
}
function refreshIOrders() {
  const el = $("#olist2"); if (!el) return;
  if (el.querySelector("details[open]") || (document.activeElement && el.contains(document.activeElement) && document.activeElement.tagName === "SUMMARY")) return;
  const list = S.orders.filter(o => S.ofilter === "all" || (S.ofilter === "active" ? isActive(o) : !isActive(o)));
  el.innerHTML = list.map(o => {
    const s = stepState(o), canCx = o.status === "open" || o.status === "partial";
    return `<div class="oc"><div class="t1"><b>${orderLine(o)}</b>${statusTag(o)}</div>
      <div class="t2">${esc(o.id)} · ${esc(o.market)} · ${new Date(o.ts).toLocaleString(loc(), { dateStyle: "short", timeStyle: "short" })} · ${num(o.filled)}/${num(o.qty)}${o.risk && o.risk.level ? " · " + (o.risk.level === "ESCALATED" ? t("escalated") : t("routine")) : ""}</div>
      <div class="mini">${s.cls.map(c => `<i class="${c === "done" ? "d" : c === "fail" ? "f" : c === "hold" ? "h" : ""}"></i>`).join("")}</div>
      <div class="plain">${esc(plainOf(o))}</div>
      <details><summary>${t("details")}</summary><div class="dl">${o.votes ? `<div>${t("validators")}: ${num(o.votes.agree)}/${num(o.votes.required ?? 0)}${o.votes.compliance ? " + reviewer" : ""}</div>${vchips(o)}` : ""}
        ${o.place_tx ? `<div>${t("tx")}: ${H(o.place_tx)}</div>` : ""}${(o.trades || []).map(x => `<div>${t("receipt")} #${x.trade_id}: ${num(x.qty)} @ ${price$(o.market, x.price)} · ${H(x.tx)} · ${t("anchored")} ${H("0x" + x.record_hash)}</div>`).join("")}</div></details>
      ${canCx ? `<button class="btn ghost sm cx" data-id="${esc(o.id)}" style="margin-top:8px">${t("cancel")}</button>` : ""}</div>`;
  }).join("") || `<div class="card"><div class="empty">${t("no_orders")}</div></div>`;
  $$("#olist2 .cx").forEach(b => b.onclick = async () => { busy(b, true); try { await cancelOrder(b.dataset.id); toast(t("cancel_ok")); } catch (e) { toast(e.message); busy(b, false); } });
}

/* ───────── wallet ───────── */
function mountWallet() {
  const mks = Object.keys(S.info.markets);
  $("#main").innerHTML = `<div class="sec"><b>${t("wallet")}</b><span>${t("practice")}</span></div><div id="wbal"></div>
    <div class="row2" style="margin-bottom:14px"><button class="btn" id="bDep">${I.add} ${t("add_money")}</button><button class="btn ghost" id="bWd">${I.out} ${t("withdraw")}</button></div>
    <div class="sec"><b>${t("history")}</b></div><div class="card" id="whist"><span class="spin"></span></div>`;
  $("#bDep").onclick = () => openDeposit(); $("#bWd").onclick = () => openWithdraw();
  refreshWallet(); loadWallet();
}
async function loadWallet() { try { S.wallet = await api("/api/wallet"); } catch (e) {} if (S.itab === "wallet") refreshWallet(); }
function refreshWallet() {
  if (!$("#wbal")) return;
  $("#wbal").innerHTML = Object.keys(S.info.markets).map(m => { const p = S.portfolios && S.portfolios[m];
    return `<div class="card wcard"><div><div class="sub" style="font-weight:700">${esc(m)} · ${t("cash_av")}</div><div class="amt">${p ? cash$(m, p.cash) : "…"}</div>${p && p.locked_cash ? `<div class="sub">${t("locked")}: ${cash$(m, p.locked_cash)}</div>` : ""}</div><div class="tag">${esc(S.info.markets[m].currency === "GBX" ? "GBP" : "BDT")}</div></div>`; }).join("");
  const h = S.wallet ? S.wallet.history : null;
  $("#whist").innerHTML = !h ? `<span class="spin"></span>` : h.length ? h.map(x => `<div class="hist"><div class="ic ${x.type === "deposit" ? "in" : "out"}">${x.type === "deposit" ? "+" : "−"}</div>
      <div class="m"><b>${x.type === "deposit" ? t("added_via") : t("sent_to")} ${esc(x.method_name)}</b><small>${new Date(x.t).toLocaleString(loc(), { dateStyle: "medium", timeStyle: "short" })} · ${esc(x.id)} · ${H(x.tx)}</small></div>
      <div class="a ${x.type === "deposit" ? "up" : "dn"}">${x.type === "deposit" ? "+" : "−"}${cash$(x.market, x.amount)}</div></div>`).join("") : `<div class="empty">${t("no_hist")}</div>`;
}
function openSheet(html) { const s = $("#sheet"); s.innerHTML = `<div class="bg"></div><div class="pn"><div class="grab"></div>${html}</div>`; s.style.display = "block"; $("#sheet .bg").onclick = closeSheet; }
function closeSheet() { const s = $("#sheet"); if (s) { s.style.display = "none"; s.innerHTML = ""; } }
function unitOf(m) { return S.info.markets[m].fmt.div; }
function moneyForm(kind, m) {
  const w = S.info.markets[m].wallet, methods = w.methods, div = unitOf(m), p = S.portfolios && S.portfolios[m];
  const quick = m === "DSE" ? [1000, 5000, 10000, 50000] : [50, 100, 500, 1000];
  const sel = (S.payMethod && methods.includes(S.payMethod)) ? S.payMethod : methods[0]; S.payMethod = sel;
  const names = { bkash: "bKash", nagad: "Nagad", rocket: "Rocket", bank: S.lang === "bn" ? "ব্যাংক" : "Bank", card: S.lang === "bn" ? "ডেবিট কার্ড" : "Debit card" };
  return `<h3>${kind === "dep" ? t("am_title") : t("wd_title")}</h3>
    <div class="seg sm" style="margin:8px 0 4px">${Object.keys(S.info.markets).map(x => `<button data-wm="${x}" class="${x === m ? "on" : ""}">${esc(x)}</button>`).join("")}</div>
    <label>${kind === "dep" ? t("pay_with") : t("send_to")}</label><div class="pm">${methods.map(x => `<button data-pm="${x}" class="${x === sel ? "on" : ""}"><i style="background:${PAY_COLOR[x] || "#888"}"></i>${esc(names[x] || x)}</button>`).join("")}</div>
    <label>${t("amount")} (${m === "DSE" ? "Tk" : "£"})</label><input id="amt" type="number" inputmode="decimal" min="1" placeholder="${quick[1]}">
    <div class="quick">${quick.map(q => `<button data-q="${q}">${m === "DSE" ? "Tk " + q.toLocaleString("en-IN") : "£" + q}</button>`).join("")}</div>
    <div class="sub" style="margin-top:8px">${kind === "dep" ? `${t("min_max")} ${cash$(m, w.min)} ${t("and")} ${cash$(m, w.max)}` : `${t("free_cash")}: <b>${p ? cash$(m, p.cash) : "…"}</b>`}</div>
    <div class="infobox" style="margin-top:12px">${kind === "dep" ? t("am_note") : `${I.key.replace("<svg", '<svg width="15" height="15" style="vertical-align:-3px"')} ${t("wd_note")}`}</div>
    <div id="err" class="err"></div><button class="btn ${kind === "dep" ? "ok" : ""}" id="mgo">${kind === "dep" ? t("confirm_pay") : I.key + " " + t("sign_wd")}</button>`;
}
function bindMoney(kind, m) {
  $$("#sheet [data-wm]").forEach(b => b.onclick = () => (kind === "dep" ? openDeposit : openWithdraw)(b.dataset.wm));
  $$("#sheet [data-pm]").forEach(b => b.onclick = () => { S.payMethod = b.dataset.pm; $$("#sheet [data-pm]").forEach(x => x.classList.toggle("on", x === b)); });
  $$("#sheet [data-q]").forEach(b => b.onclick = () => { $("#amt").value = b.dataset.q; });
  $("#mgo").onclick = async () => {
    const btn = $("#mgo"), v = +$("#amt").value, amount = Math.round(v * unitOf(m));
    if (!(amount > 0)) { $("#err").textContent = t("amount") + "?"; return; }
    busy(btn, true); $("#err").textContent = "";
    try {
      let r;
      if (kind === "dep") r = await api("/api/wallet/deposit", { method: "POST", body: { market: m, amount, method: S.payMethod } });
      else {
        if (!S.key) throw new Error(t("nokey_trade"));
        const nonce = BXSign.randomNonce(), expiry = Math.floor(Date.now() / 1000) + 600;
        const sig = BXSign.sign(S.key, BXSign.withdrawDigest(domainOf(m), S.me.user.wallet, amount, nonce, expiry));   // signed on this device
        r = await api("/api/wallet/withdraw", { method: "POST", body: { market: m, amount, method: S.payMethod, nonce, expiry, sig } });
      }
      if (S.portfolios) S.portfolios[m] = r.balance;
      openSheet(`<div style="text-align:center"><div class="okmark">${I.bigcheck}</div><h3>${kind === "dep" ? t("done_dep") : t("done_wd")}</h3>
        <div class="big" style="margin:6px 0">${cash$(m, r.entry.amount)}</div><div class="sub">${esc(r.entry.method_name)} · ${t("ref_id")} ${esc(r.entry.id)}</div>
        <div class="sub" style="margin:4px 0 14px">${t("tx")} ${H(r.entry.tx)} · block ${num(r.entry.block)}</div><button class="btn" id="mclose">${t("close")}</button></div>`);
      $("#mclose").onclick = closeSheet; loadWallet(); if (S.itab === "home") refreshHome();
    } catch (e) { const el = $("#err"); if (el) el.textContent = e.message; busy(btn, false); }
  };
}
function openDeposit(m) { m = m || S.market; openSheet(moneyForm("dep", m)); bindMoney("dep", m); }
function openWithdraw(m) { m = m || S.market; openSheet(moneyForm("wd", m)); bindMoney("wd", m); }

/* ───────── me ───────── */
function mountMe() {
  const u = S.me.user;
  $("#main").innerHTML = `<button class="back" id="bBack">${I.back} ${t("home")}</button>
    <div class="card" style="display:flex;gap:12px;align-items:center"><div class="avatar" style="width:54px;height:54px;font-size:19px">${esc(u.name.split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase())}</div>
      <div style="min-width:0"><div style="font-weight:800;font-size:17px;color:var(--navy)">${esc(u.name)}</div><div class="sub">${esc(u.email)}${u.nid_last4 ? ` · ${t("id_end")} ${esc(u.nid_last4)}` : ""}</div><div class="sub">${H(u.wallet)}</div></div></div>
    <div class="card"><div class="mrow" style="cursor:default"><b>${t("language")}</b><div class="seg sm" style="margin:0;width:170px"><button data-l="en" class="${S.lang === "en" ? "on" : ""}">English</button><button data-l="bn" class="${S.lang === "bn" ? "on" : ""}">বাংলা</button></div></div>
      <div class="mrow" id="rGuide"><div><b>${t("guided")}</b><br><span>${t("guided_s")}</span></div>›</div>
      <div class="mrow" id="rTour"><div><b>${t("tour")}</b></div>›</div></div>
    <div class="sec"><b>${t("key")}</b></div><div class="card" id="keycard"></div>
    <div class="sec"><b>${t("check")}</b></div><div class="card"><div class="mrow" id="rAudit"><div>${I.shield.replace("<svg", '<svg style="vertical-align:-5px;color:var(--blue)"')} <b>${t("run_audit")} · ${esc(S.market)}</b><br><span>${t("audit_s")}</span></div>›</div><div id="iaudit"></div></div>
    <div class="sec"><b>${t("how")}</b></div><div class="card how"><div>${t("how1")}</div><div>${t("how2")}</div><div>${t("how3")}</div><div>${t("how4")}</div></div>
    <div class="sec"><b>${t("roadmap")}</b></div><div class="card" id="iroad"></div>
    <button class="btn ghost" id="bOut" style="margin-top:6px">${t("signout")}</button>`;
  $("#bBack").onclick = () => goTab("home");
  $$("[data-l]").forEach(b => b.onclick = () => setLang(b.dataset.l));
  $("#rGuide").onclick = startGuide; $("#rTour").onclick = () => openTour(0);
  $("#rAudit").onclick = async () => { $("#iaudit").innerHTML = `<span class="spin"></span>`; try { const rep = await api("/api/audit/" + S.market);
    $("#iaudit").innerHTML = `<div class="${rep.ok ? "pass" : "fail"}" style="margin-top:6px">${rep.ok ? t("audit_ok") : t("audit_bad")}</div><div class="sub">${num(rep.orders)} orders · ${num(rep.trades)} trades · ${num(rep.signatures_checked)} signatures</div>` +
      rep.checks.map(c => `<div class="sub" style="padding:3px 0"><span class="${c.ok ? "pass" : "fail"}">${c.ok ? "✓" : "✗"}</span> ${esc(c.name)}</div>`).join(""); } catch (e) { $("#iaudit").textContent = e.message; } };
  $("#bOut").onclick = async () => { try { await api("/api/auth/logout", { method: "POST" }); } catch (e) {} signOutLocal(); };
  $("#iroad").innerHTML = Object.entries(ROAD).map(([k, v], i) => `<details ${i === 0 ? "" : ""}><summary style="cursor:pointer;font-weight:700;color:${["var(--ok)", "var(--warn)", "var(--mut)"][i]};padding:6px 0">${esc(k)} (${v.length})</summary>${v.map(x => `<div class="sub" style="padding:3px 0 3px 10px">• ${esc(x)}</div>`).join("")}</details>`).join("");
  renderKeyCard();
}
function renderKeyCard() {
  const u = S.me.user, el = $("#keycard"); if (!el) return;
  if (S.key) {
    el.innerHTML = `<div class="sub" style="font-size:13.5px;color:var(--ink)">${t("key_have")}</div>
      <div class="${S.keyDemo ? "demo-note" : "infobox"}" style="margin-top:8px">${S.keyDemo ? t("key_demo") : t("key_backup")}</div>
      <button class="btn ghost sm" id="kShow">${t("backup")}</button><div class="keybox mono" id="kOut"></div>`;
    $("#kShow").onclick = () => { const o = $("#kOut"); o.textContent = o.textContent ? "" : S.key; $("#kShow").textContent = o.textContent ? t("hidekey") : t("backup"); };
  } else {
    el.innerHTML = `<div class="warnbox soft">${t("key_missing")}</div><input id="kIn" class="mono" autocomplete="off" spellcheck="false" placeholder="0x…"><button class="btn sm" id="kImp" style="margin-top:8px">${t("import")}</button>`;
    $("#kImp").onclick = () => {
      const k = $("#kIn").value.trim();
      if (!BXSign.validKey(k)) return toast("That is not a valid key.");
      if (BXSign.addressOf(k).toLowerCase() !== String(u.wallet).toLowerCase()) return toast("This key belongs to another address.");
      keyStore.set(u.email, k.startsWith("0x") ? k : "0x" + k); S.tmpKey = k; loadKey(); toast("Key imported on this device."); renderInv();
    };
  }
}
async function cancelOrder(id) {
  const o = S.orders.find(x => x.id === id);
  if (!o || !o.chain_id) throw new Error("This order is not on the ledger.");
  if (!S.key) throw new Error(t("nokey_trade"));
  const sig = BXSign.sign(S.key, BXSign.cancelDigest(domainOf(o.market), o.chain_id));   // the contract cancels only with the investor's signature
  await api(`/api/orders/${id}/cancel`, { method: "POST", body: { sig } });
}
