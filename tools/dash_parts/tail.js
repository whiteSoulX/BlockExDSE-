
/* ═══════════════ polling ═══════════════ */
let busyTick = false, tickN = 0, watchFor = "";
async function tick() {
  if (busyTick) return; busyTick = true; tickN++;
  try {
    S.info = S.info || await api("/api/info");
    if (S.token && !S.me) await loadMe();
    const u = S.me && S.me.user; if (!u) { busyTick = false; return; }
    if (S.view === "onboard") {
      const before = u.status; await loadMe();
      if (S.me.user.status !== before) { if (S.me.user.status === "active") { toast(t("approved_msg")); S.view = null; S.itab = "home"; } route(); }
    } else if (S.view === "inv") {
      const it = S.itab;
      if (!isLive()) { S.snap[S.market] = await api("/api/market/" + S.market); refreshLive(); }
      if (watchFor !== S.token) { S.watch = await api("/api/watchlist"); watchFor = S.token; }
      if (["home", "trade", "orders"].includes(it) || tickN % 4 === 0) S.orders = await api("/api/orders");
      if (tickN % 2 === 0 || !S.portfolios) { const m = await api("/api/me"); S.portfolios = m.portfolios; }
      if (it === "wallet" && tickN % 5 === 0) await loadWallet();
      if (S.itab !== it) { busyTick = false; return; }
      if (it === "home") refreshHome(); else if (it === "trade") syncTrade(); else if (it === "orders") refreshIOrders(); else if (it === "wallet") refreshWallet();
      const n = S.orders.filter(isActive).length, tb = $('#itabs .tab[data-t="orders"]');
      if (tb) { let c = tb.querySelector(".cnt"); if (n && !c) { c = document.createElement("span"); c.className = "cnt"; tb.appendChild(c); } if (c) { if (n) c.textContent = n; else c.remove(); } }
    } else {
      const v = S.view;
      if (["market"].includes(v) && !isLive()) { S.snap[S.market] = await api("/api/market/" + S.market); refreshLive(); }
      if (v === "orders") { S.orders = await api("/api/orders"); refreshOrders(); }
      if (v === "market") { [S.nodes, S.info] = await Promise.all([api("/api/nodes"), api("/api/info")]); if (u.role === "admin") S.sim = await api("/api/admin/sim"); refreshMarket(); }
      if (v === "requests") { S.req = await api("/api/admin/requests"); refreshRequests(); }
      if (v === "accounts") { S.accounts = await api("/api/balances?market=" + S.market); refreshAccounts(); }
      { const n = S.review.length; S.review = await api("/api/review"); if (S.review.length !== n) renderNav(); if (v === "review") refreshReview(); }
      if (S.lab.benchJob) { const st = await api("/api/admin/bench/" + S.lab.benchJob); S.lab.bench = st; if (st.state !== "running") S.lab.benchJob = null; if (v === "proof") refreshProof(); }
    }
  } catch (e) {}
  busyTick = false;
}

(async function init() {
  document.documentElement.lang = S.lang === "bn" ? "bn" : "en";
  if (!window.BXSign) { $("#root").innerHTML = `<div class="gwrap"><div class="warnbox">${t("no_sign")}</div></div>`; return; }
  if ("serviceWorker" in navigator && (location.hostname === "localhost" || location.protocol === "https:")) navigator.serviceWorker.register("/sw.js").catch(() => {});
  try { S.info = await api("/api/info"); if (!S.info.markets[S.market]) S.market = Object.keys(S.info.markets)[0]; if (S.token) await loadMe(); }
  catch (e) { $("#root").innerHTML = `<div class="gwrap"><div class="warnbox">${t("no_gateway")}</div></div>`; return; }
  route(); setInterval(tick, 1000);
})();
</script>
</body>
</html>
