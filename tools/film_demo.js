// Films the running BlockExDSE v2.0 dashboard: CDP screencast JPEG frames + a caption log.
// usage: node film.js <outdir>      FAST=1 -> quick dry run that only saves stills at key moments
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.argv[2]; const FAST = !!process.env.FAST; const K = FAST ? 0.12 : 1;
const sleep = ms => new Promise(r => setTimeout(r, Math.max(20, ms * K)));
const read = s => 1400 + s.split(/\s+/).length * 330;          // time to read a caption (ms)
fs.mkdirSync(OUT + '/frames', { recursive: true }); fs.mkdirSync(OUT + '/stills', { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 240)));
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto('http://127.0.0.1:9001/'); await page.waitForSelector('.chip');

  await page.evaluate(() => {
    document.documentElement.style.zoom = '1.5';
    const st = document.createElement('style'); st.textContent = `
      body{padding-bottom:130px !important}
      #toast{bottom:auto !important;top:62px !important;left:auto !important;right:14px !important;transform:none !important;z-index:8500 !important;max-width:420px !important}
      .card{scroll-margin-top:62px}
      #main *{scroll-margin-top:70px;scroll-margin-bottom:100px}
      #fxcap{position:fixed;left:0;right:0;bottom:0;z-index:9000;background:rgba(7,11,19,.96);border-top:2px solid var(--acc);padding:13px 30px 15px;display:none;gap:16px;align-items:center;min-height:70px;box-sizing:border-box}
      #fxcap .n{font-weight:700;font-size:13px;color:#0b101a;background:var(--acc);border-radius:999px;padding:6px 13px;white-space:nowrap}
      #fxcap .t{font-weight:500;font-size:20px;line-height:1.35;color:#fff}
      #fxcur{position:fixed;z-index:9999;pointer-events:none;width:24px;height:24px;left:640px;top:360px;display:none}
      #fxrip{position:fixed;z-index:9998;pointer-events:none;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:3px solid var(--warn);opacity:0}
      #fxrip.go{animation:fxr .5s ease-out}
      @keyframes fxr{from{transform:scale(.3);opacity:.95}to{transform:scale(1.3);opacity:0}}
      #fxcard{position:fixed;inset:0;z-index:8000;background:var(--bg);display:none;align-items:center;justify-content:center;flex-direction:column;padding:30px 60px 100px;text-align:center;box-sizing:border-box}
      #fxcard .big{font-size:64px;font-weight:800;letter-spacing:-1px;color:#fff}
      #fxcard .big i{font-style:normal;color:var(--acc)}
      #fxcard .sub2{font-size:25px;color:var(--txt);margin-top:10px}
      #fxcard .meta{font-size:16px;color:var(--mut);margin-top:26px;line-height:1.6}
      #fxcard .warn{font-size:15px;color:var(--warn);margin-top:22px;border:1px solid var(--warn);border-radius:999px;padding:7px 18px}
      #fxcard .h{font-size:38px;font-weight:800;color:#fff}
      #fxcard .s{font-size:19px;color:var(--mut);margin:8px 0 30px}
      .fxrow{display:flex;align-items:stretch;gap:10px;justify-content:center}
      .fxb{width:232px;padding:18px 16px;border:1px solid var(--line);border-radius:14px;background:var(--card);opacity:.3;transition:all .6s;text-align:left;box-sizing:border-box}
      .fxb.on{opacity:1;border-color:var(--acc);box-shadow:0 0 0 3px rgba(79,140,255,.28)}
      .fxb .k{width:30px;height:30px;border-radius:50%;background:var(--acc);color:#0b101a;font-weight:800;display:flex;align-items:center;justify-content:center;margin-bottom:10px}
      .fxb b{display:block;font-size:19px;color:#fff;margin-bottom:6px}
      .fxb span{font-size:15px;color:var(--txt);line-height:1.4}
      .fxa{display:flex;align-items:center;color:var(--mut);font-size:26px}
      .fxrule{display:flex;gap:14px;margin-top:30px;justify-content:center}
      .fxrule span{border:1px solid var(--line);background:var(--card);border-radius:12px;padding:12px 18px;font-size:16px;color:var(--txt);opacity:.3;transition:all .6s}
      .fxrule span.on{opacity:1;border-color:var(--ok)}
      .fxrule b{display:block;color:var(--ok);font-size:14px;text-transform:uppercase;letter-spacing:.6px;margin-bottom:3px}
      .fxtiles{display:flex;gap:16px;justify-content:center;align-items:stretch}
      .fxt{width:330px;border:1px solid var(--line);background:var(--card);border-radius:14px;padding:22px 20px;text-align:left;box-sizing:border-box}
      .fxt .v{font-size:48px;font-weight:800;color:var(--ok);line-height:1.05}
      .fxt .l{font-size:16px;color:#fff;font-weight:600;margin:8px 0 6px}
      .fxt .d{font-size:14px;color:var(--mut);line-height:1.45}
      .fxcols{display:flex;gap:16px;justify-content:center;align-items:stretch}
      .fxc{width:330px;border:1px solid var(--line);background:var(--card);border-radius:14px;padding:18px 20px;text-align:left;box-sizing:border-box}
      .fxc h4{margin:0 0 8px;font-size:15px;text-transform:uppercase;letter-spacing:.6px}
      .fxc li{font-size:15px;color:var(--txt);line-height:1.5;margin-left:-18px}
      .fxfoot{font-size:14px;color:var(--mut);margin-top:22px}`;
    document.head.appendChild(st);
    const add = (id, html) => { const d = document.createElement('div'); d.id = id; d.innerHTML = html || ''; document.body.appendChild(d); return d; };
    add('fxcap', '<span class="n"></span><span class="t"></span>'); add('fxrip'); add('fxcard');
    add('fxcur', '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M3 2l7.5 19 2.6-7.4L20.5 11z" fill="#fff" stroke="#0b101a" stroke-width="1.6" stroke-linejoin="round"/></svg>');
    const pr = add('fxprobe'); pr.style.cssText = 'position:fixed;left:100px;top:0;width:1px;height:1px';
    const sc = pr.getBoundingClientRect().left / 100 || 1; pr.remove(); window.__fxsc = sc;
    const cur = document.querySelector('#fxcur'), rip = document.querySelector('#fxrip');
    document.addEventListener('mousemove', e => { cur.style.left = e.clientX / sc + 'px'; cur.style.top = e.clientY / sc + 'px'; rip.style.left = e.clientX / sc + 'px'; rip.style.top = e.clientY / sc + 'px'; }, true);
  });
  console.log('coord scale', await page.evaluate(() => window.__fxsc));

  // ---------- capture ----------
  let scene = 'title', nFrames = 0; const frames = [], caps = [], scenes = [];
  const cdp = await ctx.newCDPSession(page);
  if (!FAST) {
    cdp.on('Page.screencastFrame', f => {
      const file = `frames/f${String(nFrames++).padStart(6, '0')}.jpg`;
      fs.writeFileSync(`${OUT}/${file}`, Buffer.from(f.data, 'base64')); frames.push({ t: f.metadata.timestamp, file, scene });
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
  }
  const poke = () => page.evaluate(() => { const c = document.querySelector('#fxcap'); c.style.opacity = c.style.opacity === '0.999' ? '1' : '0.999'; });
  const setScene = async name => { scene = name; scenes.push({ name, t: Date.now() / 1000 }); await poke(); await sleep(60); };
  const still = async name => { if (FAST) await page.screenshot({ path: `${OUT}/stills/${name}.jpg`, type: 'jpeg', quality: 78 }); };

  // ---------- helpers ----------
  const cap = async (n, t, hold = true) => {
    caps.push({ t: Date.now() / 1000, n, text: t });
    await page.evaluate(([n, t]) => { const c = document.querySelector('#fxcap'); c.style.display = t ? 'flex' : 'none'; c.querySelector('.n').textContent = n; c.querySelector('.n').style.display = n ? '' : 'none'; c.querySelector('.t').textContent = t; }, [n, t]);
    if (hold && t) await sleep(read(t));
  };
  const cursor = on => page.evaluate(on => { document.querySelector('#fxcur').style.display = on ? 'block' : 'none'; }, on);
  const card = html => page.evaluate(html => { const c = document.querySelector('#fxcard'); c.style.display = html ? 'flex' : 'none'; if (html) { c.innerHTML = html; document.querySelector('#toast').style.display = 'none'; } }, html);
  const L = sel => typeof sel === 'string' ? page.locator(sel).first() : sel;
  const moveTo = async sel => {
    const loc = L(sel); await loc.waitFor({ state: 'visible', timeout: 15000 });
    let bb = await loc.boundingBox();
    if (!bb || bb.y < 150 || bb.y + bb.height > 1080 - 215) { await loc.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })); await sleep(700); bb = await loc.boundingBox(); }
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: FAST ? 2 : 26 });
  };
  const click = async sel => {
    await moveTo(sel); await sleep(260);
    await page.evaluate(() => { const r = document.querySelector('#fxrip'); r.classList.remove('go'); void r.offsetWidth; r.classList.add('go'); });
    await L(sel).click(); await sleep(420);
  };
  const type = async (sel, val) => { await click(sel); await page.keyboard.press('Control+A'); await page.keyboard.type(String(val), { delay: FAST ? 0 : 95 }); await sleep(300); };
  const show = async (sel, block = 'center') => { await L(sel).evaluate((el, block) => el.scrollIntoView({ block, behavior: 'smooth' }), block); await sleep(800); };
  const top = async () => { await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await sleep(600); };
  const login = async name => { await click(page.locator('.chip', { hasText: name })); await page.waitForSelector('#nav button'); await sleep(700); };
  const logout = async () => { await top(); await click('#bOut'); await page.waitForSelector('.chip'); await sleep(500); };
  const nav = async v => { await top(); await click(`#nav button[data-v="${v}"]`); await sleep(600); };
  const order = async ({ side, tk, qty, px }) => {
    await click(side === 'BUY' ? '#sB' : '#sS');
    await moveTo('#tk'); await sleep(200); await page.selectOption('#tk', tk); await sleep(500);
    await type('#qty', qty); await type('#px', px);
  };
  const waitOrder = async () => {
    for (let i = 0; i < 140; i++) {
      const v = await page.evaluate(async () => {
        if (!S.cur) return null;
        try { const o = await api('/api/orders/' + S.cur); return (o.total_ms != null || ['held', 'rejected', 'cancelled'].includes(o.status)) ? { id: o.id, status: o.status, votes: o.votes ? [o.votes.agree, o.votes.required] : null, risk: o.risk && o.risk.level, filled: o.filled, by: o.rejected_by || '' } : null; } catch (e) { return null; }
      });
      if (v) { console.log('ORDER', JSON.stringify(v)); await new Promise(r => setTimeout(r, 1400)); return v; }
      await new Promise(r => setTimeout(r, 300));
    }
    throw new Error('order did not finish');
  };
  const submit = async () => { await click('#go'); await L('#pipe').evaluate(el => el.closest('.card').scrollIntoView({ block: 'start', behavior: 'smooth' })); await sleep(800); return waitOrder(); };

  if (!FAST) await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const t0 = Date.now() / 1000;

  // ---------- scene: title ----------
  await setScene('title');
  await card(`<div class="big">Block<i>Ex</i>DSE</div><div class="sub2">How one share order is signed, checked and settled</div>
    <div class="meta">Version 2.0 prototype · CSE 4098B Capstone Project B<br>University of Liberal Arts Bangladesh · November 2026</div>
    <div class="warn">Simulation. Not connected to a real exchange. No real money.</div>`);
  caps.push({ t: Date.now() / 1000, n: '', text: 'BlockExDSE version 2.0: how one share order is signed, checked and settled.' });
  await still('00_title'); await sleep(6000);

  // ---------- scene: how it works ----------
  await setScene('how');
  await card(`<div class="h">Nobody acts alone</div><div class="s">Every order passes four independent checks before it changes a balance.</div>
    <div class="fxrow">
      <div class="fxb" data-i="1"><div class="k">1</div><b>Investor's device</b><span>Signs the order. The signature is made in the browser.</span></div><div class="fxa">&rarr;</div>
      <div class="fxb" data-i="2"><div class="k">2</div><b>Four edge validators</b><span>Each one checks the exchange rules, then signs.</span></div><div class="fxa">&rarr;</div>
      <div class="fxb" data-i="3"><div class="k">3</div><b>Settlement contract</b><span>Verifies every signature, scores the risk, locks cash or shares.</span></div><div class="fxa">&rarr;</div>
      <div class="fxb" data-i="4"><div class="k">4</div><b>Ledger and audit</b><span>Shares and cash move in one step. Anyone can re-check the record.</span></div>
    </div>
    <div class="fxrule"><span data-r="1"><b>Routine order</b>3 of 4 validators sign</span><span data-r="2"><b>Risky order</b>all 4 must sign</span><span data-r="3"><b>One signature missing</b>a reviewer decides</span></div>`);
  const lit = (q, on = true) => page.evaluate(([q, on]) => document.querySelectorAll(q).forEach(e => e.classList.toggle('on', on)), [q, on]);
  await sleep(900);
  await lit('.fxb[data-i="1"]'); await cap('How it works', 'The investor signs each order in the browser. Nobody else can place an order in their name.');
  await lit('.fxb[data-i="2"]'); await cap('How it works', 'Four edge validators sit close to the brokers. Each checks the exchange rules and adds its own signature.');
  await lit('.fxb[data-i="3"]'); await cap('How it works', 'The settlement contract trusts none of them. It verifies every signature and computes the risk score itself.');
  await lit('.fxb[data-i="4"]'); await cap('How it works', 'Matching orders settle in one transaction, and the full record can be audited by anyone.');
  await lit('.fxrule span[data-r="1"]'); await lit('.fxrule span[data-r="2"]'); await lit('.fxrule span[data-r="3"]');
  await still('01_how');
  await cap('How it works', 'The number of signatures depends on the risk: three of four for a routine order, all four for a risky one.');

  // ---------- scene: routine order ----------
  await setScene('routine'); await card(''); await cursor(true);
  await cap('1  Sign in', 'Bob signs in to the simulated Dhaka Stock Exchange market.', false);
  await login('Bob'); await sleep(900);
  await cap('2  A routine order', 'Bob offers 10 Grameenphone shares at 300 taka.', false);
  await order({ side: 'SELL', tk: 'GP', qty: 10, px: 300 });
  await moveTo('#prev'); await still('02_preview');
  await cap('2  A routine order', 'The preview applies the risk rule: this is a routine order, so three of four validators must sign.');
  await cap('2  A routine order', 'Bob signs the order in his browser and sends it.', false);
  let o = await submit(); await still('03_routine_done');
  await cap('2  A routine order', 'Three validators checked and signed. The contract verified Bob\'s signature and theirs, then locked his 10 shares.');
  await sleep(600);

  // ---------- scene: match and settle ----------
  await setScene('settle');
  await logout(); await cap('3  Settlement', 'Alice signs in and buys 10 Grameenphone shares at the same price.', false);
  await login('Alice'); await order({ side: 'BUY', tk: 'GP', qty: 10, px: 300 });
  o = await submit(); await still('04_settled');
  await cap('3  Settlement', 'The two orders match and settle in a single transaction: the shares go to Alice and the cash goes to Bob.');
  await nav('portfolio'); await still('05_portfolio');
  await cap('3  Settlement', 'Alice already holds 510 Grameenphone shares. Settlement is final at once, not two days later.');

  // ---------- scene: risky order ----------
  await setScene('risky');
  await nav('trade'); await cap('4  A risky order', 'Now Alice places a large order: 1,700 shares, worth 510,000 taka.', false);
  await order({ side: 'BUY', tk: 'GP', qty: 1700, px: 300 }); await moveTo('#prev'); await still('06_risky_preview');
  await cap('4  A risky order', 'The value crosses the risk threshold, so the rule now demands all four validators.');
  o = await submit(); await still('07_risky_done');
  await cap('4  A risky order', 'All four signed. The contract recomputes the risk score, so a gateway cannot pass a risky order off as routine.');

  // ---------- scene: validator fault ----------
  await setScene('fault');
  await logout(); await cap('5  A validator fails', 'The admin makes validator 4 faulty. From now on it returns useless signatures.', false);
  await login('Admin'); await nav('market'); await show('#nodes'); await click('#nodes button[data-n="4"]'); await sleep(1600); await still('08_faulty');
  await cap('5  A validator fails', 'The admin makes validator 4 faulty. From now on it returns useless signatures.');
  await logout(); await cap('5  A validator fails', 'Alice places a routine order for 5 BRAC Bank shares.', false);
  await login('Alice'); await order({ side: 'BUY', tk: 'BRACBANK', qty: 5, px: 45 });
  o = await submit(); await still('09_routine_faulty');
  await cap('5  A validator fails', 'Routine trading continues, because three healthy validators are enough.');
  await top(); await cap('5  A validator fails', 'Then she places another risky order.', false);
  await order({ side: 'BUY', tk: 'GP', qty: 1700, px: 300 });
  o = await submit(); await still('10_held');
  await cap('5  A validator fails', 'It cannot collect four signatures. The order is held: not lost, and not waved through.');

  // ---------- scene: review ----------
  await setScene('review');
  await logout(); await cap('6  A person decides', 'A broker opens the review queue and finds the held order.', false);
  await login('Broker'); await nav('review'); await sleep(900); await still('11_review');
  await cap('6  A person decides', 'A broker opens the review queue and finds the held order.');
  await click('#rv button[data-a="1"]'); await sleep(2600); await still('12_approved');
  await cap('6  A person decides', 'The broker approves and signs. The contract accepts one reviewer signature in place of one validator, for a risky order only.');

  // ---------- scene: attack tests ----------
  await setScene('attacks');
  await logout(); await cap('7  Attack tests', 'First the admin repairs validator 4.', false);
  await login('Admin'); await nav('market'); await show('#nodes'); await click('#nodes button[data-n="4"]'); await sleep(1800);
  await cap('7  Attack tests', 'Can the system be cheated? The proof page sends attacks to the real contract.', false);
  await nav('proof'); await sleep(600);
  await click('#bLab');
  for (let i = 0; ; i++) {
    const d = await page.evaluate(() => ({ n: (document.querySelector('#lab') || {}).innerText ? document.querySelector('#lab').innerText.length : -1, toast: document.querySelector('#toast').innerText, dis: document.querySelector('#bLab') ? document.querySelector('#bLab').disabled : null }));
    if (d.n > 120) break; if (i > 60) { console.log('LAB STUCK', JSON.stringify(d)); throw new Error('lab'); }
    await new Promise(r => setTimeout(r, 500));
  }
  await show('#bLab', 'start'); await still('13_lab');
  await cap('7  Attack tests', 'Nine attacks are sent to the real contract as dry runs: forged signatures, too few validators, replayed orders.');
  await show('#lab', 'end'); await cap('7  Attack tests', 'The contract refuses every one of them.');

  // ---------- scene: audit ----------
  await setScene('audit');
  const audit = async () => { await click('#bAudit'); await page.waitForFunction(() => { const b = document.querySelector('#bAudit'); return b && !b.disabled && document.querySelector('#audit').innerText.length > 60; }, null, { timeout: 60000 }); await show('#bAudit', 'start'); await sleep(500); };
  await top(); await cap('8  Independent audit', 'The audit rebuilds the whole market from the ledger alone.', false);
  await audit(); await still('14_audit_ok');
  await cap('8  Independent audit', 'It re-checks every signature, every quorum, every balance and every trade record. All checks pass.');
  await cap('8  Independent audit', 'Now one off-chain trade record is changed, as a dishonest operator might do.', false);
  await click('#bTamper'); await sleep(1500); await audit();
  await page.evaluate(() => { const e = [...document.querySelectorAll('#audit *')].filter(x => x.children.length === 0 && /^FAIL/.test(x.textContent.trim()))[0]; if (e) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
  await sleep(900); await still('15_audit_bad');
  await cap('8  Independent audit', 'The audit catches it, because the record no longer matches the hash anchored on the ledger.');
  await click('#bTamper'); await sleep(1200); await audit();
  await cap('8  Independent audit', 'With the record restored, the audit passes again.');

  // ---------- scene: results ----------
  await setScene('results'); await cursor(false);
  await card(`<div class="h">What we measured</div><div class="s">100 simulated orders per run, three runs, local test chain, one computer</div>
    <div class="fxtiles">
      <div class="fxt"><div class="v">0 of 10</div><div class="l">rule-breaking orders reached the ledger</div><div class="d">Without the edge validators, about 10 orders per 100 that broke exchange-only rules reached the ledger. With them, none did.</div></div>
      <div class="fxt"><div class="v">3.18</div><div class="l">signatures per order</div><div class="d">The risk rule asked for 3.18 signatures per order on average, against 4.00 when every order needs all four. Validator checks took about 7 ms.</div></div>
      <div class="fxt"><div class="v">0</div><div class="l">risky orders passed with too few signatures</div><div class="d">With one validator faulty, routine orders kept flowing and about 14 risky orders per 100 were held for review.</div></div>
    </div><div class="fxfoot">Prototype measurements on a single machine with a simulated workload. They are not production figures.</div>`);
  await still('16_results');
  await cap('Results', 'In our benchmark, the edge stopped every rule-breaking order before it reached the ledger.');
  await cap('Results', 'The risk rule needed fewer signatures than asking all four validators every time.');
  await cap('Results', 'With one validator faulty, no risky order passed with too few signatures.');

  // ---------- scene: end ----------
  await setScene('end');
  await card(`<div class="h">What is real, what is simulated, what is next</div><div class="s">An honest status of the prototype</div>
    <div class="fxcols">
      <div class="fxc"><h4 style="color:var(--ok)">Real in the prototype</h4><ul><li>Orders signed in the browser</li><li>Four validators that check and sign</li><li>Signatures and risk verified by the contract</li><li>Funds locked, trades settled in one step</li><li>Audit from the ledger alone</li></ul></div>
      <div class="fxc"><h4 style="color:var(--warn)">Simulated</h4><ul><li>Identity checks and one-time codes</li><li>Money, shares and prices</li><li>All nodes on one computer</li><li>A local test blockchain</li></ul></div>
      <div class="fxc"><h4 style="color:var(--acc)">Next</h4><ul><li>A four-node ledger on separate machines</li><li>Energy measured in joules per order</li><li>Short netting windows to save liquidity</li><li>Fair ordering of competing orders</li></ul></div>
    </div><div class="fxfoot">BlockExDSE · CSE 4098B Capstone Project B · University of Liberal Arts Bangladesh</div>`);
  await still('17_end');
  await cap('', 'The signatures, the contract checks, the settlement and the audit are real. Identities, money and prices are simulated.');
  await cap('', 'Next: a ledger on separate machines, measured energy per order, and short netting windows.');
  await sleep(1500); await poke(); await sleep(300);

  const t1 = Date.now() / 1000;
  if (!FAST) await cdp.send('Page.stopScreencast');
  fs.writeFileSync(OUT + '/meta.json', JSON.stringify({ t0, t1, scenes, caps, frames }));
  console.log('DONE frames', frames.length, 'seconds', Math.round(t1 - t0));
  await browser.close();
})().catch(e => { console.log('FILM ERROR', String(e).slice(0, 600)); process.exit(1); });
