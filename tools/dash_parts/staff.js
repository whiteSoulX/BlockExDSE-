
/* ═══════════════ staff console (broker and admin) ═══════════════ */
const TABS = {
  broker: [["requests", "Requests"], ["review", "Review"], ["orders", "Orders"], ["accounts", "Accounts"], ["market", "Market"], ["proof", "Proof"], ["roadmap", "Roadmap"]],
  admin:  [["requests", "Requests"], ["review", "Review"], ["orders", "Orders"], ["accounts", "Accounts"], ["market", "Market"], ["proof", "Proof"], ["roadmap", "Roadmap"]],
};
function renderNav() {
  const u = S.me.user, tabs = TABS[u.role];
  $("#nav").innerHTML = tabs.map(t => `<button data-v="${t[0]}" class="${S.view === t[0] ? "on" : ""}">${t[1]}${t[0] === "review" && S.review.length ? `<span class="cnt">${S.review.length}</span>` : ""}</button>`).join("");
  $("#nav").querySelectorAll("button").forEach(b => b.onclick = () => { S.view = b.dataset.v; route(); });
}
function renderMarketBar() {
  const bar = $("#mkbar"); bar.style.display = "flex";
  bar.innerHTML = Object.values(S.info.markets).map(m => `<button data-m="${m.code}" class="${m.code === S.market ? "on" : ""}">${esc(m.code)} · ${esc(m.name)}</button>`).join("") +
    `<span class="sub" id="mkinfo">${esc(MK().hours)}. Simulation: orders are accepted at any time.</span>`;
  bar.querySelectorAll("button").forEach(b => b.onclick = () => { S.market = b.dataset.m; sessionStorage.setItem("bx_mk", S.market); S.cur = null; route(); });
}
function renderWho() {
  const u = S.me && S.me.user;
  $("#who").innerHTML = (u ? `<span class="nm">${esc(u.name)}</span><span class="badge">${esc(u.role)}</span><button class="btn ghost sm" id="bOut">Sign out</button>` : "") + `<button class="btn ghost sm" id="bTour">Tour</button>`;
  $("#bTour").onclick = () => openTour(0);
  if (u) $("#bOut").onclick = async () => { try { await api("/api/auth/logout", { method: "POST" }); } catch (e) {} signOutLocal(); };
}
function stripHTML() {
  const sn = snap(); if (!sn) return `<div class="sub">Loading market data…</div>`;
  const sel = selTicker();
  return Object.entries(sn.tickers).map(([t, v]) => `<div class="trow ${t === sel ? "on" : ""}" data-t="${esc(t)}"><span><b>${esc(t)}</b> <span class="sub">${esc(v.name)}</span></span><span>${px(S.market, v.last)} ${chgHTML(v.chg)}</span></div>`).join("");
}
function ladderHTML() {
  const sn = snap(); if (!sn) return "";
  const v = sn.tickers[selTicker()], asks = v.asks.slice().reverse(), bids = v.bids;
  const row = (a, cls) => `<div class="${cls}">${a ? px(S.market, a[0]) : ""}</div><div class="r ${cls}">${a ? fmt(a[1]) : ""}</div>`;
  return `<div class="lad"><div class="h">Price</div><div class="h r">Quantity</div>${asks.map(a => row(a, "a")).join("") || `<div class="sub" style="grid-column:1/-1">No sellers</div>`}
    <div style="grid-column:1/-1;border-top:1px solid var(--line);border-bottom:1px solid var(--line);text-align:center;padding:6px"><b>${px(S.market, v.last)}</b> ${chgHTML(v.chg)}<span class="sub"> · vol ${fmt(v.volume)}${v.high != null ? ` · H ${px(S.market, v.high)} L ${px(S.market, v.low)}` : ""}</span></div>
    ${bids.map(a => row(a, "b")).join("") || `<div class="sub" style="grid-column:1/-1">No buyers</div>`}</div>`;
}
function tapeHTML() {
  const sn = snap(); if (!sn) return "";
  return sn.tape.slice(0, 8).map(t => `<div class="item"><b>${esc(t.ticker)}</b> ${fmt(t.qty)} @ ${px(S.market, t.price)} <span class="sub">${esc(t.buyer)} ← ${esc(t.seller)} · ${new Date(t.t).toLocaleTimeString()}</span></div>`).join("") || `<div class="sub">No trades yet.</div>`;
}
function marketCard() {
  return `<div class="card"><h2><span class="live" id="liveDot"></span>${esc(MK().code)} live market</h2><div id="strip"></div>
    <h2 style="margin-top:12px">Depth (top 5)</h2><div id="ladder"></div><h2 style="margin-top:12px">Recent trades</h2><div id="tape"></div></div>`;
}
function stageDone(o, s) { return s === "onchain" ? !!o.place_tx : s === "matched" ? !!(o.stages.matched || o.stages.settled) : !!o.stages[s]; }
function pipeHTML(o) {
  if (!o) return `<div class="pipe">${STAGES.map(s => `<div class="st">${LABEL[s]}</div>`).join("")}</div><div class="sub">Place an order to follow it: your signature, the edge validators, the contract's own checks, then matching and settlement.</div>`;
  const failed = o.status === "rejected", cx = o.status === "cancelled" || o.status === "part_filled", held = o.status === "held";
  return `<div class="pipe">${STAGES.map(s => `<div class="st ${stageDone(o, s) ? "done" : ""}">${LABEL[s]}</div>`).join("")}${held ? `<div class="st hold">Held for review</div>` : ""}${failed ? `<div class="st fail">Rejected</div>` : ""}${cx ? `<div class="st fail">Cancelled ${o.cancelled_qty ?? ""}</div>` : ""}</div>`;
}
function votesHTML(o) {
  if (!o.votes || !o.votes.detail || !o.votes.detail.length) return "";
  const word = d => d.agree ? "signed" : d.verdict === "not-asked" ? "not asked" : d.verdict === "no-response" ? "no answer" : d.verdict === "accept" ? "useless signature" : "refused";
  return `<div class="chips">${o.votes.detail.map(d => `<span class="vchip ${d.agree ? "y" : d.verdict === "not-asked" ? "" : "n"}" title="${esc(d.reason || "")}">Validator ${d.node}: ${word(d)}</span>`).join("")}${o.votes.compliance ? `<span class="vchip y">Reviewer: approved</span>` : ""}</div>`;
}
function riskLine(o) {
  if (!o.risk || o.risk.required == null) return "";
  return `<div class="sub">Risk score <b>${Math.round(o.risk.score_bps / 100)}</b> of 100 (${esc(o.risk.level)}): needs <b>${o.risk.required}</b> validator signatures${o.votes ? `, has <b>${o.votes.agree}</b>` : ""}.</div>${votesHTML(o)}`;
}
function detailHTML(o) {
  if (!o) return "";
  const where = { edge: "Stopped at the edge, before any blockchain transaction", consensus: "Stopped by the validators", contract: "Refused by the contract", review: "Rejected by the reviewer" }[o.rejected_by] || "";
  let h = riskLine(o);
  if (o.status === "rejected") return h + `<div class="note" style="border-color:var(--bad);color:var(--bad);margin-top:8px">${where ? esc(where) + ": " : ""}${esc(o.error)}</div>`;
  if (o.status === "held") return h + `<div class="note" style="border-color:var(--warn);color:var(--txt);margin-top:8px">A risky order needs every validator and one signature is missing, so a person decides. It waits in the Review tab of a broker or admin. The contract accepts one reviewer signature in place of one validator, for a risky order only.</div>`;
  h += `<div class="sub" style="margin-top:6px">${esc(o.market)} · ${o.otype === "MARKET" ? "market order (protective limit " + px(o.market, o.price) + ")" : "limit order"}${o.place_tx ? ` · the contract verified the investor's signature and ${o.votes ? o.votes.agree : 0} validator signatures${o.votes && o.votes.compliance ? " plus the reviewer's" : ""}, then locked the ${o.side === "BUY" ? "cash" : "shares"}: tx ${H(o.place_tx)}${o.place_gas ? ` (gas ${fmt(Math.round(o.place_gas))})` : ""}` : ""}${o.status === "open" ? " · resting on-chain, waiting for a counterparty" : ""}${o.cancelled_qty ? ` · ${fmt(o.cancelled_qty)} unfilled and cancelled` : ""}</div>`;
  if (o.trades.length) h += `<h2 style="margin-top:12px">Receipt</h2>` + o.trades.map(t => `<div class="ocard"><b>${esc(t.buyer)}</b> bought ${fmt(t.qty)} ${esc(t.ticker)} @ ${px(o.market, t.price)} from <b>${esc(t.seller)}</b><div class="sub">Trade #${t.trade_id} · block ${t.block} · gas ${fmt(t.gas + t.anchor_gas)}<br>Settlement tx ${H(t.tx)}<br>Anchored record hash ${H("0x" + t.record_hash)}</div></div>`).join("");
  return h;
}
function orderCard(o) {
  const mine = S.me.user.role === "trader" && (o.status === "open" || o.status === "partial");
  return `<div class="ocard"><div class="top"><span><b>${esc(o.id)}</b> <span class="${o.side === "BUY" ? "buy-t" : "sell-t"}">${esc(o.side)}</span> ${fmt(o.qty)} ${esc(o.ticker)} ${o.otype === "MARKET" ? "at market" : "@ " + px(o.market, o.price)} <span class="tag">${esc(o.market)}</span><span class="tag">${esc(o.otype)}</span></span><span class="pill s-${esc(o.status)}">${esc(o.status.replace("_", " "))}</span></div>
    <div class="sub">${esc(o.trader_name)} · filled ${o.filled}/${o.qty}${o.cancelled_qty ? ` · ${o.cancelled_qty} cancelled` : ""}${o.votes && o.risk ? ` · signatures ${o.votes.agree}/${o.votes.required} ${esc(o.risk.level)}${o.votes.compliance ? " + reviewer" : ""}` : ""}${o.gas_total ? ` · gas ${fmt(Math.round(o.gas_total))}` : ""}${o.total_ms != null ? ` · ${o.total_ms} ms` : ""}</div>
    ${o.error ? `<div class="sub" style="color:var(--bad)">${esc(o.error)}</div>` : ""}<div class="sub">Order tx ${H(o.place_tx)}${o.cancel_tx ? ` · cancel tx ${H(o.cancel_tx)}` : ""}</div>
    ${o.trades.map(t => `<div class="sub">Trade #${t.trade_id}: ${fmt(t.qty)} @ ${px(o.market, t.price)} · tx ${H(t.tx)} · hash ${H("0x" + t.record_hash)}</div>`).join("")}
    ${mine ? `<button class="btn ghost sm cx" data-id="${esc(o.id)}" style="margin-top:8px">Sign and cancel</button>` : ""}</div>`;
}
function mountOrders() { $("#main").innerHTML = `<div class="card"><h2>${S.me.user.role === "trader" ? "My orders" : "All orders"} (all markets)</h2><div id="olist"></div></div>`; }
function refreshOrders() {
  if (!$("#olist")) return;
  $("#olist").innerHTML = S.orders.map(orderCard).join("") || `<div class="sub">No orders yet.</div>`;
  $("#olist").querySelectorAll(".cx").forEach(b => b.onclick = async () => { busy(b, true); try { await cancelOrder(b.dataset.id); toast("Cancel signed; the contract released the locked funds"); } catch (e) { toast(e.message); busy(b, false); } });
}
function mountMarket() {
  const admin = S.me.user.role === "admin";
  $("#main").innerHTML = `<div class="grid">${marketCard()}<div class="card"><h2>Edge validators</h2><div id="nodes"></div><div class="sub" style="margin-top:8px" id="faultnote"></div>
    ${admin ? `<h2 style="margin-top:14px">Market simulation · ${esc(S.market)}</h2><div class="sub">Three demo traders sign and post orders so the market moves. Their orders pass the same validators and settle on-chain.</div><button class="btn ghost" id="simBtn" style="margin-top:8px"></button>` : ""}
    <h2 style="margin-top:14px">Blockchain</h2><div id="chain" class="sub"></div></div></div>`;
  if (admin) $("#simBtn").onclick = async () => { try { S.sim = await api(`/api/admin/sim/${S.market}/${S.sim[S.market] ? "off" : "on"}`, { method: "POST" }); refreshMarket(); } catch (e) { toast(e.message); } };
  refreshLive();
}
function refreshMarket() {
  if (!$("#nodes")) return;
  const admin = S.me.user.role === "admin", q = MK().quorum;
  $("#nodes").innerHTML = S.nodes.map(n => n.up ? `<div class="node"><span><span class="ndot ${n.faulty ? "f" : "up"}"></span>Validator ${n.node} <span class="sub mono">:${n.port}${n.leader ? " + gateway" : ""}</span>${n.faulty ? ` <span class="tag">faulty</span>` : ""}</span><span class="sub">${n.votes_cast} signed · ${n.refused} refused · ${n.ping_ms} ms ${admin ? `<button class="btn ghost sm" data-n="${n.node}" data-on="${!n.faulty}">${n.faulty ? "heal" : "make faulty"}</button>` : ""}</span></div>` : `<div class="node"><span><span class="ndot"></span>Validator ${n.node}</span><span class="sub">DOWN</span></div>`).join("");
  $("#nodes").querySelectorAll("button").forEach(b => b.onclick = async () => { try { await api(`/api/fault/${b.dataset.n}/${b.dataset.on === "true" ? "on" : "off"}`, { method: "POST" }); } catch (e) { toast(e.message); } });
  $("#faultnote").textContent = (admin ? "A faulty validator returns a useless signature. " : "Only the admin can switch a validator to faulty for the demo. ") + `Routine orders still pass with ${q.routine} of ${S.info.validators}. Risky orders need ${q.risky} of ${S.info.validators}; one short, they are held for a reviewer.`;
  if ($("#simBtn")) $("#simBtn").textContent = S.sim[S.market] ? "Stop simulation" : "Start simulation";
  const c = S.info.chain;
  $("#chain").innerHTML = `${esc(c.name)} (chain id ${c.id}) · ${c.mode === "signed" ? "transactions signed with a configured key" : "local node, unlocked admin account"} · node ${esc(c.rpc_host)} · storage ${esc(S.info.storage)} · signature library ${esc(S.info.crypto)}<br>` +
    Object.values(S.info.markets).map(m => `${esc(m.code)} contract ${H(m.contract)} · ${m.counts.orders} orders, ${m.counts.trades} trades`).join("<br>");
}

/* ───────── staff: requests / review / accounts ───────── */
function mountRequests() { $("#main").innerHTML = `<div class="grid"><div class="card"><h2>Waiting for approval</h2><div id="pend"></div></div><div class="card"><h2>Recent decisions</h2><div id="dec"></div></div></div>`; }
function mountAccounts() { $("#main").innerHTML = `<div class="card"><h2>On-chain balances · ${esc(S.market)}</h2><div class="sub" style="margin-bottom:8px">Read from the contract. Numbers in brackets are locked in open orders.</div><div class="scroll" id="acc"></div></div>`; }
function refreshRequests() {
  if (!$("#pend") || !S.req) return;
  if (document.activeElement && document.activeElement.classList.contains("why")) return;
  $("#pend").innerHTML = S.req.pending.map(u => `<div class="ocard"><b>${esc(u.name)}</b> <span class="sub">${esc(u.email)} · ${esc(u.mobile)}</span><div class="sub">National ID ending <b>${esc(u.nid_last4)}</b> · photo fingerprint ${u.has_photo ? "provided" : "not provided"}</div>
    <input class="why" placeholder="Reason if rejecting" style="margin:8px 0"><div class="row"><button class="btn ok sm" data-a="1" data-id="${esc(u.id)}">Approve</button><button class="btn bad sm" data-a="0" data-id="${esc(u.id)}">Reject</button></div></div>`).join("") || `<div class="sub">No requests waiting.</div>`;
  $("#pend").querySelectorAll("button").forEach(b => b.onclick = async () => {
    busy(b, true); const why = b.closest(".ocard").querySelector(".why").value;
    try { await api("/api/admin/decision", { method: "POST", body: { user_id: b.dataset.id, approve: b.dataset.a === "1", reason: why } }); toast(b.dataset.a === "1" ? "Approved: the investor's own address is now registered on-chain" : "Rejected"); S.req = await api("/api/admin/requests"); refreshRequests(); }
    catch (e) { toast(e.message); busy(b, false); }
  });
  $("#dec").innerHTML = S.req.decided.slice().reverse().map(u => `<div class="item"><b>${esc(u.name)}</b> <span class="pill s-${esc(u.status)}">${esc(u.status)}</span><div class="sub">by ${esc(u.decided_by)}${u.reg_tx ? " · tx " : ""}${u.reg_tx ? H(u.reg_tx) : ""}${u.reject_reason ? " · " + esc(u.reject_reason) : ""}</div></div>`).join("") || `<div class="sub">None yet.</div>`;
}
function mountReview() {
  $("#main").innerHTML = `<div class="card"><h2>Risky orders held for review</h2><div class="sub" style="margin-bottom:10px">A risky order needs every validator. When exactly one signature is missing, the order is not lost: a person decides here. The contract counts one reviewer signature in place of one validator, and only for a risky order.</div><div id="rv"></div></div>`;
  refreshReview();
}
function refreshReview() {
  if (!$("#rv")) return;
  if (document.activeElement && document.activeElement.classList.contains("why")) return;
  $("#rv").innerHTML = S.review.map(r => `<div class="ocard"><div class="top"><span><b>${esc(r.id)}</b> <span class="${r.side === "BUY" ? "buy-t" : "sell-t"}">${esc(r.side)}</span> ${fmt(r.qty)} ${esc(r.ticker)} @ ${px(r.market, r.price)} <span class="tag">${esc(r.market)}</span></span><span class="pill s-held">held</span></div>
    <div class="sub">${esc(r.trader_name)} · value ${money(r.market, r.risk.notional)} · risk score ${Math.round(r.risk.score_bps / 100)} of 100 · validator signatures ${r.held.have} of ${r.held.need}</div>
    <input class="why" placeholder="Reason (optional)" style="margin:8px 0"><div class="row"><button class="btn ok sm" data-a="1" data-id="${esc(r.id)}">Approve and sign</button><button class="btn bad sm" data-a="0" data-id="${esc(r.id)}">Reject</button></div></div>`).join("") || `<div class="sub">Nothing is waiting.</div>`;
  $("#rv").querySelectorAll("button").forEach(b => b.onclick = async () => {
    busy(b, true); const why = b.closest(".ocard").querySelector(".why").value;
    try {
      const r = await api(`/api/review/${b.dataset.id}`, { method: "POST", body: { approve: b.dataset.a === "1", reason: why } });
      toast(r.status === "rejected" ? (r.error || "Rejected") : "Approved: the contract accepted the reviewer's signature");
      S.review = await api("/api/review"); renderNav(); refreshReview();
    } catch (e) { toast(e.message); busy(b, false); }
  });
}
function refreshAccounts() {
  if (!$("#acc")) return; const tk = Object.keys(MK().tickers);
  const lk = (a, b) => fmt(a) + (b ? ` <span class="sub">(${fmt(b)})</span>` : "");
  $("#acc").innerHTML = `<table><tr><th>Name</th><th>Cash</th>${tk.map(t => `<th>${esc(t)}</th>`).join("")}</tr>${S.accounts.map(b => `<tr><td>${esc(b.name)}</td><td>${money(S.market, b.cash)}${b.locked_cash ? ` <span class="sub">(${money(S.market, b.locked_cash)})</span>` : ""}</td>${tk.map(t => `<td>${lk(b.shares[t], b.locked_shares[t])}</td>`).join("")}</tr>`).join("")}</table>`;
}

/* ───────── proof: audit, attack tests, tamper demonstration, quick benchmark ───────── */
function mountProof() {
  const admin = S.me.user.role === "admin";
  $("#main").innerHTML = `<div class="grid">
    <div class="card"><h2>Independent audit · ${esc(S.market)}</h2><div class="sub">Re-checks the whole market from the ledger alone: every investor signature, every validator signature, the quorum for each risk tier, price-time priority, the balances, and the anchored trade records.</div>
      <button class="btn" id="bAudit" style="margin-top:10px">Run the audit</button><div id="audit" style="margin-top:10px"></div></div>
    ${admin ? `<div class="card"><h2>Attack tests · ${esc(S.market)}</h2><div class="sub">Each test sends a bad request to the real contract as a dry run, so nothing is written. Where signatures are needed they are made with the validators' own keys, which is the worst case.</div>
      <button class="btn" id="bLab" style="margin-top:10px">Run all nine tests</button><div id="lab" style="margin-top:10px"></div></div>
    <div class="card"><h2>Tamper demonstration · ${esc(S.market)}</h2><div class="sub">Changes one price in the gateway's own off-chain trade record. Run the audit again: the hash anchored on-chain no longer matches.</div>
      <button class="btn ghost" id="bTamper" style="margin-top:10px"></button></div>
    <div class="card" style="grid-column:1/-1"><h2>Quick benchmark · hidden test market</h2><div class="sub">Sends the same 40 simulated orders through five configurations. About a quarter of the orders are invalid. It takes under a minute, and the numbers describe this computer only.</div>
      <button class="btn ghost" id="bBench" style="margin-top:10px">Run the benchmark</button><div id="bench" class="scroll" style="margin-top:10px"></div></div>` :
    `<div class="card"><h2>What the contract refuses</h2><div class="item">An order that the investor did not sign</div><div class="item">An order with fewer validator signatures than its risk tier needs</div><div class="item">The same validator counted twice, or a signature from an unknown key</div><div class="item">A replayed or expired order, or a price outside the band</div><div class="item">A cancel that the investor did not sign</div><div class="sub" style="margin-top:8px">The admin account can run these nine attacks against the live contract from this tab.</div></div>`}
  </div>`;
  $("#bAudit").onclick = () => runAudit();
  if (admin) {
    $("#bLab").onclick = async () => { busy($("#bLab"), true); try { S.lab.results = await api(`/api/lab/attack/all?market=${S.market}`, { method: "POST" }); } catch (e) { toast(e.message); } busy($("#bLab"), false); refreshProof(); };
    $("#bTamper").onclick = async () => {
      busy($("#bTamper"), true);
      try { const r = await api(`/api/lab/tamper/${S.market}/${S.lab.tamper[S.market] ? "off" : "on"}`, { method: "POST" }); S.lab.tamper[S.market] = r.tampered; toast(r.tampered ? `Trade #${r.trade_id}: the off-chain record was changed` : "The record was restored"); await runAudit(); }
      catch (e) { toast(e.message); }
      busy($("#bTamper"), false); refreshProof();
    };
    $("#bBench").onclick = async () => {
      try { const r = await api("/api/admin/bench/start", { method: "POST", body: { modes: Object.keys(MODE_NAME), n: 40, seed: 7, label: "dashboard" } }); S.lab.benchJob = r.job; S.lab.bench = { state: "running", progress: "", results: [] }; }
      catch (e) { toast(e.message); }
      refreshProof();
    };
  }
  refreshProof();
}
async function runAudit() {
  busy($("#bAudit"), true);
  try { const rep = await api("/api/audit/" + S.market); S.lab.audit[S.market] = rep; S.lab.tamper[S.market] = rep.tamper_demo_on; } catch (e) { toast(e.message); }
  busy($("#bAudit"), false); refreshProof();
}
function refreshProof() {
  const rep = S.lab.audit[S.market];
  if ($("#audit")) $("#audit").innerHTML = !rep ? "" : `<div class="${rep.ok ? "pass" : "fail"}">${rep.ok ? "AUDIT PASSED" : "AUDIT FOUND PROBLEMS"}</div><div class="sub">Block ${rep.block} · ${rep.orders} orders · ${rep.trades} trades · ${rep.signatures_checked} signatures re-checked${rep.tamper_demo_on ? " · tamper demonstration is ON" : ""}</div>` +
    rep.checks.map(c => `<div class="item"><span class="${c.ok ? "pass" : "fail"}">${c.ok ? "PASS" : "FAIL"}</span> ${esc(c.name)} <span class="sub">(${esc(c.detail)})</span></div>`).join("") + rep.problems.map(p => `<div class="item" style="color:var(--bad)">${esc(p)}</div>`).join("");
  const rs = S.lab.results;
  if ($("#lab")) $("#lab").innerHTML = !rs ? "" : `<div class="${rs.every(r => r.blocked) ? "pass" : "fail"}">${rs.filter(r => r.blocked).length} of ${rs.length} attacks refused</div>` +
    rs.map(r => `<div class="item"><span class="${r.blocked ? "pass" : "fail"}">${r.blocked ? "REFUSED" : "ACCEPTED"}</span> <b>${esc(r.title)}</b><div class="sub">${esc(r.attempt)}${r.validators ? ` Honest validators asked: ${r.validators.asked}, refused: ${r.validators.refused}.` : ""}</div><div class="sub">Contract answer: <b>${esc(r.contract)}</b></div></div>`).join("");
  if ($("#bTamper")) $("#bTamper").textContent = S.lab.tamper[S.market] ? "Restore the record" : "Change one off-chain trade record";
  const b = S.lab.bench;
  if ($("#bench")) $("#bench").innerHTML = !b ? "" : b.state === "error" ? `<div class="fail">${esc(b.error || "The benchmark failed.")}</div>` :
    (b.state === "running" ? `<div class="sub"><span class="spin"></span>Running ${esc(MODE_NAME[b.progress] || "…")}</div>` : "") +
    (b.results.length ? `<table><tr><th>Configuration</th><th>Orders per second</th><th>Mean time (ms)</th><th>Invalid orders sent</th><th>Reached the ledger</th><th>Signatures per accepted order</th><th>Gas per accepted order</th></tr>${b.results.map(r => `<tr><td>${esc(MODE_NAME[r.mode] || r.mode)}</td><td>${r.throughput_ops}</td><td>${r.lat_mean_ms}</td><td>${r.invalid_orders}</td><td class="${r.invalid_reached_ledger ? "fail" : "pass"}">${r.invalid_reached_ledger}</td><td>${r.sigs_per_accepted}</td><td>${fmt(r.gas_per_accepted)}</td></tr>`).join("")}</table>` : "");
  if ($("#bBench")) busy($("#bBench"), !!S.lab.benchJob);
}

/* ───────── roadmap ───────── */
const ROAD = {
  "Built (works now)": ["Orders signed on the investor's own device (EIP-712); the contract checks the signature", "Four edge validators; the contract recovers and counts their signatures itself", "Risk rule computed by the contract: 3 of 4 signatures for routine orders, 4 of 4 for risky ones", "A risky order one signature short is held for a human reviewer instead of being lost", "Cash and shares locked at order entry, so every matched trade settles", "Price band enforced by the contract; size limit and restricted list enforced at the edge", "Independent audit from the ledger: signatures, quorums, price-time priority, balances, anchors", "Nine attack tests that the contract refuses", "Two simulated exchanges (DSE and LSE); limit and market orders; cancel with the investor's signature", "Live prices, depth and trade tape; sign-up, OTP, identity step and broker approval (simulated)", "Benchmark with fault injection and an energy proxy", "Any EVM chain through configuration; mobile-friendly and installable",
    "v2.1: phone-first investor app in English and Bangla, with a guided first trade", "v2.1: market explorer with stock pages, charts, order book and a watchlist",
    "v2.1: practice wallet: add money, and withdrawals signed on the investor's phone and re-checked by the contract and the audit"],
  "Demo only (simulated)": ["Reference prices are illustrative, not live market data", "The four validators run on one computer, not at four sites", "Demo accounts use published test keys; a real key belongs in a phone's secure hardware", "Identity checks are format checks; the OTP is shown on screen", "One gateway matches orders and relays transactions (its matching is audited, not yet decentralised)", "The local chain has one node; a real deployment needs four or more", "Orders are accepted at any time; prices are whole numbers", "Payments (bKash, Nagad, Rocket, bank, card) are simulated; no money moves", "The 30-day price charts are illustrative, not real history"],
  "Upcoming (not built)": ["Short netting windows, to cut the cash that instant settlement locks up", "Fair ordering, so that a gateway cannot reorder or front-run orders", "Gateway fail-over and validators at separate sites", "A four-validator QBFT ledger and a public test network run", "Energy measured in joules on real edge hardware", "Opening and closing auctions; stop orders", "Licensed live market data and price alerts", "Real bKash, Nagad and bank payment gateways; biometric login; IPO applications", "Privacy for order details"],
};
function mountRoadmap() {
  $("#main").innerHTML = `<div class="note" style="margin-bottom:12px">Honest status: only the first column works. The others are simulated or planned, and are shown so the board can see the direction. Nothing here connects to a real exchange.</div><div class="cols">` +
    Object.entries(ROAD).map(([k, v], i) => `<div class="card col"><h3 style="color:${["var(--ok)", "var(--warn)", "var(--mut)"][i]}">${k}</h3>${v.map(x => `<div class="item">${esc(x)}</div>`).join("")}</div>`).join("") + `</div>`;
}
/* ───────── guided tour ───────── */
const TOUR = [
  { t: "Welcome", x: "In " + BRAND.name + " (BlockExDSE v2.1) nobody acts alone. You sign each order on your own device, four edge validators check it, and the settlement contract verifies every signature before it locks funds and settles. This tour takes about five minutes. Everything is simulated.", go: null },
  { t: "1. Create an account", x: "Sign up, enter the demo code shown on screen, then submit an ID number (10 digits, any). At that step your browser creates your signing key. It never leaves the device.", go: ["Open sign-up", async () => { await logoutQuiet(); S.tab = "up"; route(); $("#tour").style.display = "none"; }] },
  { t: "2. Broker approves", x: "A broker approves the request. The address of the key you created is written into both exchange contracts as KYC-verified, with starting cash in each currency.", go: ["Sign in as Broker", () => demoLogin("Broker", "requests")] },
  { t: "3. Alice sells on the DSE", x: "Alice signs a limit sell for 100 GP at 300 BDT. Three of four validators sign it. The contract checks her signature and theirs, locks her shares, and the order rests on the book.", go: ["Sign in as Alice, prefill", () => demoLogin("Alice", "trade", { market: "DSE", side: "SELL", otype: "LIMIT", ticker: "GP", qty: 100, price: 300 })] },
  { t: "4. Bob sends a market order", x: "Bob buys 60 GP at the market. It takes the best price on the book (300) and settles in one transaction. The receipt shows the transaction and the anchored record hash.", go: ["Sign in as Bob, prefill", () => demoLogin("Bob", "trade", { market: "DSE", side: "BUY", otype: "MARKET", ticker: "GP", qty: 60 })] },
  { t: "5. A risky order", x: "Bob bids 320 for GP, more than half-way to the edge of the price band. The contract itself scores this order as ESCALATED, so all four validators must sign it.", go: ["Bob bids 320, prefill", () => demoLogin("Bob", "trade", { market: "DSE", side: "BUY", otype: "LIMIT", ticker: "GP", qty: 5, price: 320 })] },
  { t: "6. Break a validator", x: "As admin, open Market and make validator 3 faulty. A routine order still passes with 3 of 4. Repeat the risky order: it is now held, not lost.", go: ["Sign in as Admin", () => demoLogin("Admin", "market")] },
  { t: "7. A person decides", x: "Open Review as broker or admin and approve the held order. The contract accepts one reviewer signature in place of one validator, and only for a risky order.", go: ["Sign in as Broker, open Review", () => demoLogin("Broker", "review")] },
  { t: "8. Proof", x: "Open Proof as admin. Run the audit, then the nine attack tests. Each attack is refused by the contract, even when all the validator keys are used against it.", go: ["Sign in as Admin, open Proof", () => demoLogin("Admin", "proof")] },
  { t: "9. Switch to London", x: "Switch the exchange to LSE: different tickers, prices in pence, its own contract and its own balances. Alice sells 10 HSBA at 900p.", go: ["Alice on the LSE, prefill", () => demoLogin("Alice", "trade", { market: "LSE", side: "SELL", otype: "LIMIT", ticker: "HSBA", qty: 10, price: 900 })] },
  { t: "10. See the roadmap", x: "The roadmap separates what is built, what is simulated, and what is still planned.", go: ["Open roadmap", () => { if (S.me) { if (S.me.user.role === "trader") S.itab = "me"; else S.view = "roadmap"; route(); $("#tour").style.display = "none"; } else toast("Sign in first, then open Roadmap."); }] },
];
async function logoutQuiet() { if (S.token) { try { await api("/api/auth/logout", { method: "POST" }); } catch (e) {} signOutLocal(); } }
async function demoLogin(label, view, prefill) {
  try {
    await logoutQuiet(); if (!S.demo.length) S.demo = await api("/api/demo-accounts");
    const d = S.demo.find(x => x.label === label); const r = await api("/api/auth/login", { method: "POST", body: { email: d.email, password: d.password } });
    setToken(r.token); keepDemoKey(r); await loadMe();
    if (prefill && prefill.market) { S.market = prefill.market; sessionStorage.setItem("bx_mk", S.market); }
    if (S.me.user.role === "trader") { S.itab = view === "roadmap" ? "me" : view === "trade" ? "trade" : "home"; S.form.price = null; } else S.view = view;
    S.prefill = prefill || null; route(); $("#tour").style.display = "none";
  } catch (e) { toast(e.message); }
}
function openTour(i) {
  const s = TOUR[i], t = $("#tour"); t.style.display = "flex";
  t.innerHTML = `<div class="box"><div class="sub">Step ${i + 1} of ${TOUR.length}</div><h3>${esc(s.t)}</h3><p>${esc(s.x)}</p>
    ${s.go ? `<button class="btn" id="tg">${esc(s.go[0])}</button>` : ""}<div class="row" style="margin-top:10px"><button class="btn ghost" id="tp" ${i === 0 ? "disabled" : ""}>Back</button><button class="btn ghost" id="tn">${i === TOUR.length - 1 ? "Close" : "Next"}</button></div></div>`;
  if (s.go) $("#tg").onclick = () => s.go[1](); $("#tp").onclick = () => openTour(i - 1);
  $("#tn").onclick = () => i === TOUR.length - 1 ? t.style.display = "none" : openTour(i + 1);
}
