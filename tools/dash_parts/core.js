/* ═══════════════ BlockExDSE v2.1 dashboard ═══════════════
   One page, two layouts: the investor app (phone first, the poster design) and the staff console (broker, admin).
   Change the product name here once the team has chosen it. */
const BRAND = { name: "BlockExDSE", letter: "B", long: "Risk-adaptive edge consensus with RACD", project: "v2.1 · blockchain stock exchange" };
/* Logo: a block (blockchain, with a chain link) and a rising market line breaking out of it. One drawing, used everywhere. */
let LOGO_N = 0;
function logoSVG() {
  const id = "bxg" + (++LOGO_N);
  return `<svg viewBox="0 0 128 128" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1F3864"/><stop offset="1" stop-color="#2F5597"/></linearGradient></defs><rect width="128" height="128" rx="28" fill="url(#${id})"/><polygon points="60,20 100,42 60,64 20,42" fill="#DAE3F3"/><polygon points="20,42 60,64 60,110 20,88" fill="#8FAADC"/><polygon points="100,42 60,64 60,110 100,88" fill="#fff"/><g fill="none" stroke="#1F3864" stroke-width="4" opacity=".55"><rect x="27" y="62" width="16" height="10" rx="5" transform="skewY(29) translate(0,-14)"/><rect x="36" y="67" width="16" height="10" rx="5" transform="skewY(29) translate(0,-14)"/></g><polyline points="68,96 79,81 86,88 104,62" fill="none" stroke="#ED7D31" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/><polygon points="110,52 109,70 94,61" fill="#ED7D31"/></svg>`;
}
const WORDMARK = 'BlockEx<span class="wm">DSE</span>';


const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = n => Number(n).toLocaleString();
const short = h => h ? h.slice(0, 10) + "…" + h.slice(-6) : "–";
const S = { token: sessionStorage.getItem("bx_token") || localStorage.getItem("bx_qtoken") || "", market: sessionStorage.getItem("bx_mk") || "DSE", me: null, portfolios: null, info: null,
            view: null, tab: "in", otpDemo: "", orders: [], cur: null, side: "BUY", otype: "LIMIT", tk: {}, snap: {}, nodes: [], req: null,
            accounts: [], demo: [], sim: {}, es: null, liveAt: 0, key: null, keyDemo: false, tmpKey: null, review: [],
            lab: { audit: {}, results: null, tamper: {}, bench: null, benchJob: null, busy: false },
            // v2.1 investor app
            lang: localStorage.getItem("bx_lang") || "en", itab: "home", stock: null, hist: {}, histRange: "1M", watch: {}, wallet: null,
            ofilter: "active", form: { qty: 10, price: null }, guide: { on: false, step: 0 }, mfilter: "all", q: "",
            // demo-day features: market overview, leaderboard, live board
            ov: {}, lb: null, bfeed: [], prevOrd: null, mpanel: "stocks", mvtab: "gainers", welcome: null };
const STAGES = ["submitted", "edge_validated", "consensus", "onchain", "matched", "settled"];
const LABEL = { submitted: "Signed by investor", edge_validated: "Edge checked", consensus: "Validators signed", onchain: "Verified on-chain", matched: "Matched", settled: "Settled" };
const MODE_NAME = { chain_only: "Contract only (no edge)", edge_only: "Gateway check only", fixed3: "Always 3 of 4", fixed4: "Always 4 of 4", racd: "Risk-proportional (3 or 4)" };

/* ───────── language: English and Bangla (investor screens) ───────── */
const L = {
  en: {
    tagline: "Buy and sell shares safely. Every order is signed on your phone and checked by 4 independent validators before it settles on the blockchain.",
    sim_only: "Practice system: simulated money and prices", signin: "Sign in", create: "Create account", email: "Email", password: "Password",
    demo_accts: "Demo accounts (tap one to sign in)", name: "Full name", mobile: "Mobile (Bangladesh)", pw_rule: "Password (8+ characters, a letter and a number)",
    signup_note: "Simulation only. A real account is opened through a licensed broker with a BO account.", tour: "Demo tour",
    step2: "Verify your mobile", step2s: "Step 2 of 4. Enter the 6-digit code.", democode: "Demo only: your code is", sms: "A real system would send it by SMS.",
    newcode: "Send new code", code: "Code", verify: "Verify", step3: "Identity check and signing key", step3s: "Step 3 of 4. Simulated: only a format check is done.",
    nid: "National ID number (10, 13 or 17 digits)", photo: "Photo (optional)", nid_note: "The ID number is stored only as a one-way hash plus its last 4 digits. The photo never leaves your phone: only its fingerprint is sent.",
    keynote: "Your signing key was created on this phone. It never leaves it. Without it nobody, not even the broker or the exchange, can trade in your name.",
    submit_ap: "Submit for approval", waiting: "Waiting for broker approval", step4s: "Step 4 of 4. You go straight to trading once a broker approves you.",
    broker_tip: "Demo tip: in another window sign in as broker@blockexdse.demo / Broker@123 and approve this request.",
    notapproved: "Not approved", again: "You can submit again.",
    home: "Home", markets: "Markets", trade: "Trade", orders: "Orders", wallet: "Wallet",
    market_chip: "demo market", key_ok: "Key on this phone", key_no: "No key on this phone",
    pv: "Portfolio value (demo)", today: "today vs reference", hist_note: "Chart: illustrative history",
    buy: "Buy", sell: "Sell", buy_o: "BUY", sell_o: "SELL", add_money: "Add money", withdraw: "Withdraw",
    start_title: "New to investing?", start_text: "Make your first practice trade in 6 easy steps. We explain every field.", start_btn: "Start guided trade",
    live_order: "Live order", no_orders: "No orders yet. Your first trade will appear here.", just: "just now",
    watchlist: "Watchlist", watch_empty: "Tap the star on a stock to follow it here.", holdings: "Holdings", shares: "shares", see_all: "See all",
    search: "Search company or code", all: "All", sector: "Sector",
    ref: "Reference", dayrange: "Today's range", band: "Allowed band", volume: "Volume", buyers: "Buyers", sellers: "Sellers", price: "Price", qty: "Qty",
    recent: "Recent trades", none_yet: "None yet.", follow: "Follow", following: "Following", chart_1d: "Today", chart_1m: "30 days",
    ill: "Illustrative history (simulated), not real market data.", today_trades: "Simulated trades today", no_trades_today: "No trades today yet: showing the reference price.",
    new_order: "New order", checked_by: "checked by 4 edge validators", stock: "Stock", quantity: "Quantity", limit: "Limit", market_o: "Market",
    limit_help: "Limit: you choose the highest price you will pay (or the lowest you will accept when selling). Market: you take the best price available now.",
    best_seller: "Best seller now", best_buyer: "Best buyer now", none_side: "none", allowed: "Allowed",
    you_pay: "You pay about", you_get: "You receive about", available: "Available", avail_sh: "You own",
    risk_t: "RACD risk score", routine: "Routine", escalated: "Escalated", needs: "needs", approvals: "approvals", of: "of", not3: "not",
    risk_routine: "Normal-size order near the usual price: 3 of 4 validators must approve.",
    risk_esc: "Large or unusual order: all 4 validators must approve.",
    out_band: "This price is outside the allowed band. The validators and the contract will refuse it.", too_big: "Above the order size limit. The validators will refuse it.",
    no_cash: "Not enough cash for this order.", no_shares: "You do not own enough shares to sell.", go_wallet: "Add money",
    sign_submit: "Sign on phone & submit", signed_with: "Signed on this phone with your key", nokey_trade: "This phone does not hold your signing key. Open your profile to import it.",
    sent: "Signed on this phone and sent to the 4 validators", no_side_mkt: "No sellers right now, so a market order would not fill.",
    mkt_note: "You sign a protective limit at the band edge. It fills what is on the book now; the rest is cancelled.",
    s_signed: "Signed", s_edge: "Edge checks", s_votes: "Votes", s_chain: "On-chain", s_match: "Matched", s_settle: "Settled",
    offline: "offline", quorum_met: "quorum met", anchored: "hash anchored", waiting_match: "waiting for a seller", waiting_match_s: "waiting for a buyer",
    active: "Active", completed: "Completed", cancel: "Sign & cancel", cancel_ok: "Cancelled. The contract released your locked money or shares.",
    st_submitted: "Checking", st_edge_validated: "Checking", st_consensus: "Approved", st_open: "Waiting", st_partial: "Part filled", st_matched: "Matched",
    st_settled: "Settled", st_rejected: "Refused", st_cancelled: "Cancelled", st_part_filled: "Part filled, rest cancelled", st_held: "Held for review",
    p_settled: "Done. The shares and money changed hands in one blockchain transaction.", p_open: "On the order book. It settles automatically when someone takes the other side.",
    p_partial: "Part of it has settled. The rest is still on the order book.", p_rejected: "Refused", p_held: "This large order is one approval short, so a broker reviews it.",
    p_cancelled: "Cancelled with your signature. Locked money or shares were released.", p_checking: "Being checked by the validators…",
    details: "Details", validators: "Validators", tx: "Transaction", receipt: "Receipt", bought: "bought", from: "from",
    cash_av: "Cash you can use", locked: "Locked in open orders", practice: "Practice money only: no real payment is made.", history: "History",
    no_hist: "No deposits or withdrawals yet.", added_via: "Added via", sent_to: "Withdrawn to",
    am_title: "Add money (practice)", pay_with: "Pay with", amount: "Amount", am_note: "Simulated payment: no money moves. The broker confirms it and your cash is credited on the blockchain.",
    confirm_pay: "Confirm practice payment", min_max: "Between", and: "and", wd_title: "Withdraw", send_to: "Send to", free_cash: "Free cash",
    wd_note: "You sign this withdrawal on your phone. The contract checks your signature; nobody else can take your money out.", sign_wd: "Sign & withdraw",
    done_dep: "Money added", done_wd: "Withdrawal sent", ref_id: "Reference", close: "Close",
    profile: "Profile", id_end: "ID ending", language: "Language", key: "Signing key", backup: "Show key to back it up", hidekey: "Hide key",
    key_have: "This phone holds the key for your account. Every order, cancel and withdrawal is signed here.",
    key_demo: "Demo account: this is a published test key. An account you create gets its own key, made on your phone.",
    key_backup: "Back the key up. If this browser's storage is cleared, the key is gone and nobody can restore it.",
    key_missing: "This phone does not hold your signing key. Paste the key you backed up.", import: "Import key",
    guided: "Guided first trade", guided_s: "Walk through a practice trade step by step", check: "Check the system yourself",
    run_audit: "Run the independent audit", audit_s: "Re-checks every signature, approval and balance from the blockchain alone",
    audit_ok: "Audit passed", audit_bad: "Audit found problems", how: "How it works", roadmap: "What is built and what is planned", signout: "Sign out",
    how1: "You sign the order on your own phone. Nobody can trade in your name.",
    how2: "4 edge validators check the rules (price band, size, your account) and sign.",
    how3: "The RACD risk score decides how many must agree: 3 of 4 normally, all 4 for large or unusual orders.",
    how4: "The smart contract checks every signature itself, locks the money or shares, and settles the trade in one step.",
    g1t: "Pick a company", g1: "Start with a company you know. We picked one for you; you can change it. Practice money only: real investing can lose money.",
    g2t: "Buy or sell", g2: "Buy means you pay money and receive shares. Sell means you give shares and receive money.",
    g3t: "How many shares", g3: "Start small. 10 shares is a good first trade. The cost appears below.",
    g4t: "Your price", g4: "Limit price = the most you will pay for one share. We filled in the current price. Prices outside the allowed band are refused.",
    g5t: "The safety check", g5: "BlockExDSE scores every order. Normal orders need 3 of 4 validators; large or unusual ones need all 4. The black line shows your order.",
    g6t: "Sign and send", g6: "Your phone signs the order with your private key, then the validators check it. Tap the button.",
    g7t: "Watch it settle", g7: "Each dot lights up as your order moves: signed, checked, approved, on the blockchain, settled. Well done!",
    g7w: "Your order is approved and on the blockchain. It now waits on the order book; when someone takes the other side it settles automatically. Well done!",
    next: "Next", back: "Back", finish: "Finish", skip: "Skip", step: "Step",
    session_end: "Session ended. Please sign in again.", approved_msg: "Approved. Your account is registered on the blockchain.",
    contact_ok: "Mobile verified.", submitted: "Submitted. A broker will review it.", copied: "Copied",
    no_gateway: "Cannot reach the gateway on port 9001. Is the system running?", no_sign: "The signing module (vendor/sign.js) did not load, so orders cannot be signed.",
    // v2.1 market tools and demo-day features
    idx_name: "BlockExDSE demo index", idx_note: "Weighted average of the {n} demo stocks, base 1000. Simulated: this is not the DSEX.", live: "Live",
    mkt_open: "Open", status_note: "Demo market: open all day. Real DSE hours: {h}", pulse: "Market today", turnover: "Turnover", trades_n: "Trades",
    adv: "up", dec: "down", unch: "unchanged", heatmap: "Heatmap", heat_note: "Colour shows today's change. Bigger tiles carry more index weight.",
    movers: "Top movers", gainers: "Gainers", losers: "Losers", active_m: "Most active", no_movers: "Nothing yet today.",
    notices: "Live notice board", notices_note: "Real events from this system only: price limits, block trades, escalations, validators, new players.", no_notices: "No notices yet.",
    stocks: "Stocks", news: "Notices", code: "Code", last: "Last", change: "Change", ago_s: "{n}s ago", ago_m: "{n} min ago", ago_h: "{n} h ago",
    chal: "Practice challenge", players: "{n} players", chal_join: "Make one trade to join the leaderboard.", your_rank: "Your rank", you: "you",
    chal_empty: "No one has traded yet. Be the first!", chal_rule: "Ranked by return on the practice portfolio since joining. Simulated money.", trades_w: "trades",
    badges: "Achievements", b_unlocked: "Achievement unlocked",
    b_first_order: "First order", b_first_order_d: "Sign and send your first order", b_first_trade: "First trade", b_first_trade_d: "Get an order settled on the blockchain",
    b_escalated: "Big league", b_escalated_d: "Trade a large order that needs all 4 validators", b_market: "Market taker", b_market_d: "Place a market order",
    b_watch3: "Watcher", b_watch3_d: "Follow 3 stocks", b_funded: "Funded", b_funded_d: "Add practice money", b_bangla: "Bangla", b_bangla_d: "Use the app in Bangla",
    b_audit: "Auditor", b_audit_d: "Run the independent audit", b_lse: "Globetrotter", b_lse_d: "Trade on the London demo market", b_cancel: "Changed my mind", b_cancel_d: "Cancel an order with your signature",
    cel_buy: "Trade settled! You bought {q} {tk}.", cel_sell: "Trade settled! You sold {q} {tk}.",
    try_t: "Try it now: no sign-up", try_s: "Pick a nickname and trade with practice money in seconds. Your signing key is created on this phone.",
    nick: "Your nickname", try_go: "Start trading", try_wait: "Creating your account on the blockchain…", or_sign: "or sign in",
    perk1: "Practice money", perk2: "Real blockchain", perk3: "4 validators", nick_bad: "Use 2 to 24 letters or numbers.",
    welcome_t: "Welcome, {name}!", welcome_s: "Your practice account is ready and registered on the blockchain.",
    welcome_get: "You got {cash} practice cash and {n} shares of every company.", explore: "Explore on my own",
    install: "Install app", ios_t: "Add BlockExDSE to your Home Screen", ios_1: "Tap the Share button in Safari", ios_2: "Choose “Add to Home Screen”", ios_3: "Open BlockExDSE from your Home Screen",
    inst_other: "Open your browser menu and choose “Install app” or “Add to Home screen”.", installed: "Installed. Open BlockExDSE from your home screen.",
    share_app: "Share this app", share_s: "Let a friend scan this code to try trading on their phone.",
    board: "Live board", board_s: "For a big screen at the stall", scan: "Scan to trade", scan_s: "Open your camera, scan, pick a nickname. Practice money only.",
    feed: "Live blockchain feed", feed_s: "Every order: signed on a phone, checked by 4 validators, settled on-chain", feed_empty: "Waiting for the first order…",
    local_warn: "Phones cannot open this address. Start the system with --public (internet link) or --lan (same Wi-Fi).",
    trade_list: "Stocks", order_book: "Order book", tap_price: "Tap a price to use it", page_home: "Overview",
    // landing page (full width, responsive)
    n_feat: "Features", n_how: "How it works", n_mkt: "Live market", l_badge: "Live practice market · DSE and LSE",
    l_h1a: "Safer share trading,", l_h1b: "proved on the blockchain",
    l_s1: "edge validators check every order", l_s2: "approvals, set by each order’s risk", l_s3: "bad orders reached the ledger in our tests",
    l_mkt_t: "Live market now", l_mkt_s: "Updating from this system right now: demo prices, and real trades by visitors and practice bots.",
    l_feat_t: "Why BlockExDSE", l_feat_s: "A ULAB research prototype that shows how a stock exchange can settle trades without trusting one operator.",
    f1t: "Signed on your phone", f1: "Your signing key is made on your device. Nobody, not even the broker, can place an order for you.",
    f2t: "Checked at the edge", f2: "Four independent validators run the broker’s pre-trade checks on every order before it reaches the ledger.",
    f3t: "Risk-adaptive approvals", f3: "RACD scores each order: routine ones need 3 of 4 approvals, large or unusual ones need all 4.",
    f4t: "Settled on the blockchain", f4: "The smart contract verifies every signature itself, then moves shares and cash together.",
    f5t: "Live market tools", f5: "Ticker, demo index, heatmap, top movers and a notice board built from real system events.",
    f6t: "Bangla or English", f6: "Switch language at any time. Amounts follow Bangladeshi grouping and Bangla digits.",
    l_how_t: "How an order settles", l_how_s: "From your tap to settlement in a few seconds.",
    h1t: "Sign", h1: "You sign the order on your phone.", h2t: "Check", h2: "Four edge validators run the checks and sign.",
    h3t: "Score", h3: "The risk score sets 3 of 4 or all 4 approvals.", h4t: "Verify", h4: "The contract recovers every signature itself.",
    h5t: "Settle", h5: "Shares and cash move together; the record is anchored.",
    l_foot: "ULAB CSE capstone project. Practice system: simulated money, prices and payments; not connected to a real exchange.",
    l_cta: "Start with practice money",
    sim_banner: "Practice system: simulated money, prices and payments", copy_link: "Share link", show_all: "Show all {n}", show_less: "Show fewer", trade_1: "trade",
  },
  bn: {
    tagline: "নিরাপদে শেয়ার কিনুন ও বেচুন। প্রতিটি অর্ডার আপনার ফোনেই সই হয় এবং ব্লকচেইনে নিষ্পত্তির আগে ৪টি স্বাধীন ভ্যালিডেটর তা যাচাই করে।",
    sim_only: "অনুশীলন সিস্টেম: টাকা ও দাম কাল্পনিক", signin: "সাইন ইন", create: "অ্যাকাউন্ট খুলুন", email: "ইমেইল", password: "পাসওয়ার্ড",
    demo_accts: "ডেমো অ্যাকাউন্ট (ট্যাপ করে সাইন ইন করুন)", name: "পূর্ণ নাম", mobile: "মোবাইল (বাংলাদেশ)", pw_rule: "পাসওয়ার্ড (৮+ অক্ষর, একটি অক্ষর ও একটি সংখ্যা)",
    signup_note: "শুধু সিমুলেশন। আসল অ্যাকাউন্ট খোলা হয় লাইসেন্সধারী ব্রোকারের মাধ্যমে BO অ্যাকাউন্ট দিয়ে।", tour: "ডেমো ট্যুর",
    step2: "মোবাইল যাচাই করুন", step2s: "ধাপ ২/৪। ৬ সংখ্যার কোডটি দিন।", democode: "শুধু ডেমো: আপনার কোড", sms: "আসল সিস্টেমে এটি SMS-এ যাবে।",
    newcode: "নতুন কোড পাঠান", code: "কোড", verify: "যাচাই করুন", step3: "পরিচয় যাচাই ও সই করার চাবি", step3s: "ধাপ ৩/৪। সিমুলেশন: শুধু ফরম্যাট যাচাই হয়।",
    nid: "জাতীয় পরিচয়পত্র নম্বর (১০, ১৩ বা ১৭ সংখ্যা)", photo: "ছবি (ঐচ্ছিক)", nid_note: "NID নম্বর শুধু একমুখী হ্যাশ ও শেষ ৪ সংখ্যা হিসেবে রাখা হয়। ছবি ফোন থেকে বের হয় না: শুধু তার ফিঙ্গারপ্রিন্ট পাঠানো হয়।",
    keynote: "আপনার সই করার চাবি এই ফোনেই তৈরি হয়েছে এবং এখানেই থাকে। এটি ছাড়া কেউ, ব্রোকার বা এক্সচেঞ্জও, আপনার নামে লেনদেন করতে পারে না।",
    submit_ap: "অনুমোদনের জন্য জমা দিন", waiting: "ব্রোকারের অনুমোদনের অপেক্ষা", step4s: "ধাপ ৪/৪। ব্রোকার অনুমোদন দিলেই আপনি লেনদেন শুরু করতে পারবেন।",
    broker_tip: "ডেমো টিপ: অন্য উইন্ডোতে broker@blockexdse.demo / Broker@123 দিয়ে সাইন ইন করে অনুমোদন দিন।",
    notapproved: "অনুমোদিত হয়নি", again: "আবার জমা দিতে পারেন।",
    home: "হোম", markets: "বাজার", trade: "ট্রেড", orders: "অর্ডার", wallet: "ওয়ালেট",
    market_chip: "ডেমো বাজার", key_ok: "চাবি এই ফোনে আছে", key_no: "এই ফোনে চাবি নেই",
    pv: "পোর্টফোলিওর মূল্য (ডেমো)", today: "আজ, রেফারেন্সের তুলনায়", hist_note: "চার্ট: দৃষ্টান্তমূলক ইতিহাস",
    buy: "কিনুন", sell: "বেচুন", buy_o: "ক্রয়", sell_o: "বিক্রয়", add_money: "টাকা যোগ", withdraw: "উত্তোলন",
    start_title: "বিনিয়োগে নতুন?", start_text: "সহজ ৬ ধাপে প্রথম অনুশীলন ট্রেড করুন। প্রতিটি ঘর আমরা বুঝিয়ে দেব।", start_btn: "গাইডসহ ট্রেড শুরু",
    live_order: "চলমান অর্ডার", no_orders: "এখনও কোনো অর্ডার নেই। প্রথম ট্রেড এখানে দেখা যাবে।", just: "এইমাত্র",
    watchlist: "নজরতালিকা", watch_empty: "কোনো শেয়ারের তারকায় ট্যাপ করলে তা এখানে দেখাবে।", holdings: "আপনার শেয়ার", shares: "শেয়ার", see_all: "সব দেখুন",
    search: "কোম্পানি বা কোড খুঁজুন", all: "সব", sector: "খাত",
    ref: "রেফারেন্স দাম", dayrange: "আজকের সীমা", band: "অনুমোদিত সীমা", volume: "লেনদেনের পরিমাণ", buyers: "ক্রেতা", sellers: "বিক্রেতা", price: "দাম", qty: "পরিমাণ",
    recent: "সাম্প্রতিক লেনদেন", none_yet: "এখনও নেই।", follow: "নজরে রাখুন", following: "নজরে আছে", chart_1d: "আজ", chart_1m: "৩০ দিন",
    ill: "দৃষ্টান্তমূলক ইতিহাস (সিমুলেশন), আসল বাজারের তথ্য নয়।", today_trades: "আজকের সিমুলেটেড লেনদেন", no_trades_today: "আজ এখনও লেনদেন হয়নি: রেফারেন্স দাম দেখানো হচ্ছে।",
    new_order: "নতুন অর্ডার", checked_by: "৪টি এজ ভ্যালিডেটর যাচাই করে", stock: "শেয়ার", quantity: "পরিমাণ", limit: "লিমিট", market_o: "মার্কেট",
    limit_help: "লিমিট: আপনি সর্বোচ্চ কত দাম দেবেন (বিক্রিতে সর্বনিম্ন কত নেবেন) তা ঠিক করেন। মার্কেট: এখনকার সেরা দামে লেনদেন হয়।",
    best_seller: "এখনকার সেরা বিক্রেতা", best_buyer: "এখনকার সেরা ক্রেতা", none_side: "নেই", allowed: "অনুমোদিত",
    you_pay: "আনুমানিক খরচ", you_get: "আনুমানিক পাবেন", available: "ব্যবহারযোগ্য", avail_sh: "আপনার আছে",
    risk_t: "RACD ঝুঁকি স্কোর", routine: "সাধারণ", escalated: "উচ্চ ঝুঁকি", needs: "লাগবে", approvals: "অনুমোদন", of: "এর মধ্যে", not3: "নয়",
    risk_routine: "স্বাভাবিক আকারের, স্বাভাবিক দামের অর্ডার: ৪টির মধ্যে ৩টি ভ্যালিডেটরের অনুমোদন লাগবে।",
    risk_esc: "বড় বা অস্বাভাবিক অর্ডার: ৪টি ভ্যালিডেটরের সবার অনুমোদন লাগবে।",
    out_band: "এই দাম অনুমোদিত সীমার বাইরে। ভ্যালিডেটর ও কন্ট্র্যাক্ট এটি বাতিল করবে।", too_big: "অর্ডারের আকার সীমার বেশি। ভ্যালিডেটররা এটি বাতিল করবে।",
    no_cash: "এই অর্ডারের জন্য যথেষ্ট টাকা নেই।", no_shares: "বিক্রির মতো যথেষ্ট শেয়ার আপনার নেই।", go_wallet: "টাকা যোগ করুন",
    sign_submit: "ফোনে সই করে পাঠান", signed_with: "আপনার চাবি দিয়ে এই ফোনেই সই হয়", nokey_trade: "এই ফোনে আপনার সই করার চাবি নেই। প্রোফাইল থেকে চাবি ইমপোর্ট করুন।",
    sent: "এই ফোনে সই হয়ে ৪টি ভ্যালিডেটরের কাছে পাঠানো হয়েছে", no_side_mkt: "এখন কোনো বিক্রেতা নেই, তাই মার্কেট অর্ডার পূরণ হবে না।",
    mkt_note: "আপনি সীমার প্রান্তে একটি সুরক্ষা-দামে সই করেন। এখন বইয়ে যা আছে তা পূরণ হয়; বাকিটা বাতিল হয়।",
    s_signed: "সই", s_edge: "এজ যাচাই", s_votes: "ভোট", s_chain: "অন-চেইন", s_match: "মিলেছে", s_settle: "নিষ্পন্ন",
    offline: "অফলাইন", quorum_met: "কোরাম পূর্ণ", anchored: "হ্যাশ সংরক্ষিত", waiting_match: "বিক্রেতার অপেক্ষায়", waiting_match_s: "ক্রেতার অপেক্ষায়",
    active: "চলমান", completed: "সম্পন্ন", cancel: "সই করে বাতিল", cancel_ok: "বাতিল হয়েছে। কন্ট্র্যাক্ট আপনার আটকে থাকা টাকা বা শেয়ার ফেরত দিয়েছে।",
    st_submitted: "যাচাই চলছে", st_edge_validated: "যাচাই চলছে", st_consensus: "অনুমোদিত", st_open: "অপেক্ষমাণ", st_partial: "আংশিক পূরণ", st_matched: "মিলেছে",
    st_settled: "নিষ্পন্ন", st_rejected: "বাতিল", st_cancelled: "বাতিলকৃত", st_part_filled: "আংশিক পূরণ, বাকিটা বাতিল", st_held: "পর্যালোচনায়",
    p_settled: "সম্পন্ন। একটি ব্লকচেইন লেনদেনেই শেয়ার ও টাকা হাতবদল হয়েছে।", p_open: "অর্ডার বইয়ে আছে। কেউ বিপরীত দিকে এলে নিজে থেকেই নিষ্পন্ন হবে।",
    p_partial: "কিছু অংশ নিষ্পন্ন হয়েছে। বাকিটা এখনও অর্ডার বইয়ে আছে।", p_rejected: "বাতিল", p_held: "এই বড় অর্ডারে একটি অনুমোদন কম, তাই একজন ব্রোকার পর্যালোচনা করবেন।",
    p_cancelled: "আপনার সইয়ে বাতিল হয়েছে। আটকে থাকা টাকা বা শেয়ার ফেরত এসেছে।", p_checking: "ভ্যালিডেটররা যাচাই করছে…",
    details: "বিস্তারিত", validators: "ভ্যালিডেটর", tx: "লেনদেন", receipt: "রসিদ", bought: "কিনেছেন", from: "থেকে",
    cash_av: "ব্যবহারযোগ্য টাকা", locked: "চলমান অর্ডারে আটকে আছে", practice: "শুধু অনুশীলনের টাকা: কোনো আসল পেমেন্ট হয় না।", history: "ইতিহাস",
    no_hist: "এখনও কোনো জমা বা উত্তোলন নেই।", added_via: "যোগ হয়েছে", sent_to: "উত্তোলন",
    am_title: "টাকা যোগ (অনুশীলন)", pay_with: "যেভাবে দেবেন", amount: "পরিমাণ", am_note: "সিমুলেটেড পেমেন্ট: কোনো টাকা আসলে যায় না। ব্রোকার নিশ্চিত করলে ব্লকচেইনে আপনার টাকা জমা হয়।",
    confirm_pay: "অনুশীলন পেমেন্ট নিশ্চিত করুন", min_max: "সীমা", and: "থেকে", wd_title: "উত্তোলন", send_to: "যেখানে পাঠাবেন", free_cash: "ব্যবহারযোগ্য টাকা",
    wd_note: "এই উত্তোলন আপনি নিজের ফোনে সই করেন। কন্ট্র্যাক্ট আপনার সই যাচাই করে; অন্য কেউ আপনার টাকা তুলতে পারে না।", sign_wd: "সই করে উত্তোলন",
    done_dep: "টাকা যোগ হয়েছে", done_wd: "উত্তোলন পাঠানো হয়েছে", ref_id: "রেফারেন্স", close: "বন্ধ",
    profile: "প্রোফাইল", id_end: "NID শেষ ৪ সংখ্যা", language: "ভাষা", key: "সই করার চাবি", backup: "ব্যাকআপের জন্য চাবি দেখান", hidekey: "চাবি লুকান",
    key_have: "এই ফোনে আপনার অ্যাকাউন্টের চাবি আছে। প্রতিটি অর্ডার, বাতিল ও উত্তোলন এখানেই সই হয়।",
    key_demo: "ডেমো অ্যাকাউন্ট: এটি একটি প্রকাশিত পরীক্ষামূলক চাবি। আপনি নতুন অ্যাকাউন্ট খুললে আপনার ফোনেই নিজের চাবি তৈরি হবে।",
    key_backup: "চাবির ব্যাকআপ রাখুন। ব্রাউজারের ডেটা মুছে গেলে চাবি হারাবে, কেউ তা ফেরত দিতে পারবে না।",
    key_missing: "এই ফোনে আপনার সই করার চাবি নেই। ব্যাকআপ করা চাবিটি পেস্ট করুন।", import: "চাবি ইমপোর্ট",
    guided: "গাইডসহ প্রথম ট্রেড", guided_s: "ধাপে ধাপে একটি অনুশীলন ট্রেড", check: "নিজেই সিস্টেম যাচাই করুন",
    run_audit: "স্বাধীন অডিট চালান", audit_s: "শুধু ব্লকচেইন থেকে প্রতিটি সই, অনুমোদন ও ব্যালান্স আবার যাচাই করে",
    audit_ok: "অডিট সফল", audit_bad: "অডিটে সমস্যা পাওয়া গেছে", how: "কীভাবে কাজ করে", roadmap: "কী তৈরি হয়েছে, কী পরিকল্পনায়", signout: "সাইন আউট",
    how1: "অর্ডার আপনি নিজের ফোনেই সই করেন। আপনার নামে কেউ লেনদেন করতে পারে না।",
    how2: "৪টি এজ ভ্যালিডেটর নিয়ম যাচাই করে (দামের সীমা, আকার, আপনার অ্যাকাউন্ট) এবং সই দেয়।",
    how3: "RACD ঝুঁকি স্কোর ঠিক করে কতজনের সম্মতি লাগবে: সাধারণত ৪টির মধ্যে ৩টি, বড় বা অস্বাভাবিক অর্ডারে সব ৪টি।",
    how4: "স্মার্ট কন্ট্র্যাক্ট নিজেই প্রতিটি সই যাচাই করে, টাকা বা শেয়ার আটকে রাখে এবং এক ধাপেই লেনদেন নিষ্পন্ন করে।",
    g1t: "একটি কোম্পানি বাছুন", g1: "চেনা কোম্পানি দিয়ে শুরু করুন। আমরা একটি বেছে দিয়েছি, চাইলে বদলাতে পারেন। এটি অনুশীলনের টাকা: আসল বিনিয়োগে লোকসান হতে পারে।",
    g2t: "কিনবেন না বেচবেন", g2: "কেনা মানে টাকা দিয়ে শেয়ার পাওয়া। বেচা মানে শেয়ার দিয়ে টাকা পাওয়া।",
    g3t: "কতগুলো শেয়ার", g3: "অল্প দিয়ে শুরু করুন। প্রথম ট্রেডে ১০টি শেয়ার ভালো। খরচ নিচে দেখাবে।",
    g4t: "আপনার দাম", g4: "লিমিট দাম = একটি শেয়ারের জন্য সর্বোচ্চ যা দেবেন। এখনকার দাম বসানো আছে। সীমার বাইরের দাম বাতিল হয়।",
    g5t: "নিরাপত্তা যাচাই", g5: "BlockExDSE প্রতিটি অর্ডারের স্কোর করে। সাধারণ অর্ডারে ৪টির মধ্যে ৩টি, বড় বা অস্বাভাবিক অর্ডারে সব ৪টি ভ্যালিডেটর লাগে। কালো দাগটি আপনার অর্ডার।",
    g6t: "সই করে পাঠান", g6: "আপনার ফোন আপনার গোপন চাবি দিয়ে অর্ডারে সই করে, তারপর ভ্যালিডেটররা যাচাই করে। বোতামটি চাপুন।",
    g7t: "নিষ্পত্তি দেখুন", g7: "অর্ডার যেমন এগোয়, প্রতিটি বিন্দু জ্বলে ওঠে: সই, যাচাই, অনুমোদন, ব্লকচেইন, নিষ্পত্তি। অভিনন্দন!",
    g7w: "আপনার অর্ডার অনুমোদিত হয়ে ব্লকচেইনে উঠেছে। এখন এটি অর্ডার বইয়ে অপেক্ষা করছে; কেউ বিপরীত দিকে এলেই নিজে থেকে নিষ্পন্ন হবে। অভিনন্দন!",
    next: "পরের ধাপ", back: "আগের ধাপ", finish: "শেষ", skip: "বাদ দিন", step: "ধাপ",
    session_end: "সেশন শেষ। আবার সাইন ইন করুন।", approved_msg: "অনুমোদিত। আপনার অ্যাকাউন্ট ব্লকচেইনে নিবন্ধিত হয়েছে।",
    contact_ok: "মোবাইল যাচাই হয়েছে।", submitted: "জমা হয়েছে। একজন ব্রোকার পর্যালোচনা করবেন।", copied: "কপি হয়েছে",
    no_gateway: "পোর্ট 9001-এ গেটওয়ে পাওয়া যাচ্ছে না। সিস্টেম চালু আছে কি?", no_sign: "সই করার মডিউল (vendor/sign.js) লোড হয়নি, তাই অর্ডারে সই করা যাবে না।",
    idx_name: "BlockExDSE ডেমো সূচক", idx_note: "{n}টি ডেমো শেয়ারের ভারযুক্ত গড়, ভিত্তি ১০০০। সিমুলেশন: এটি DSEX নয়।", live: "লাইভ",
    mkt_open: "খোলা", status_note: "ডেমো বাজার: সারাদিন খোলা। আসল DSE-এর সময়: {h}", pulse: "আজকের বাজার", turnover: "লেনদেনের মূল্য", trades_n: "লেনদেন সংখ্যা",
    adv: "বেড়েছে", dec: "কমেছে", unch: "অপরিবর্তিত", heatmap: "হিটম্যাপ", heat_note: "রং আজকের পরিবর্তন দেখায়। বড় ঘরের সূচকে ভার বেশি।",
    movers: "শীর্ষ পরিবর্তন", gainers: "দর বেড়েছে", losers: "দর কমেছে", active_m: "সর্বাধিক লেনদেন", no_movers: "আজ এখনও কিছু নেই।",
    notices: "লাইভ নোটিশ বোর্ড", notices_note: "শুধু এই সিস্টেমের আসল ঘটনা: দামের সীমা, ব্লক লেনদেন, উচ্চ ঝুঁকি, ভ্যালিডেটর, নতুন খেলোয়াড়।", no_notices: "এখনও কোনো নোটিশ নেই।",
    stocks: "শেয়ার", news: "নোটিশ", code: "কোড", last: "সর্বশেষ", change: "পরিবর্তন", ago_s: "{n} সেকেন্ড আগে", ago_m: "{n} মিনিট আগে", ago_h: "{n} ঘণ্টা আগে",
    chal: "অনুশীলন প্রতিযোগিতা", players: "{n} জন খেলোয়াড়", chal_join: "লিডারবোর্ডে আসতে একটি লেনদেন করুন।", your_rank: "আপনার অবস্থান", you: "আপনি",
    chal_empty: "এখনও কেউ লেনদেন করেনি। আপনিই প্রথম হোন!", chal_rule: "যোগ দেওয়ার পর থেকে অনুশীলন পোর্টফোলিওর রিটার্ন অনুযায়ী ক্রম। টাকা কাল্পনিক।", trades_w: "লেনদেন",
    badges: "অর্জন", b_unlocked: "নতুন অর্জন",
    b_first_order: "প্রথম অর্ডার", b_first_order_d: "প্রথম অর্ডারে সই করে পাঠান", b_first_trade: "প্রথম লেনদেন", b_first_trade_d: "একটি অর্ডার ব্লকচেইনে নিষ্পন্ন করুন",
    b_escalated: "বড় খেলোয়াড়", b_escalated_d: "৪টি ভ্যালিডেটরের অনুমোদন লাগে এমন বড় অর্ডারে লেনদেন করুন", b_market: "মার্কেট অর্ডার", b_market_d: "একটি মার্কেট অর্ডার দিন",
    b_watch3: "নজরদার", b_watch3_d: "৩টি শেয়ার নজরে রাখুন", b_funded: "টাকা যোগ", b_funded_d: "অনুশীলনের টাকা যোগ করুন", b_bangla: "বাংলা", b_bangla_d: "অ্যাপটি বাংলায় ব্যবহার করুন",
    b_audit: "নিরীক্ষক", b_audit_d: "স্বাধীন অডিট চালান", b_lse: "বিশ্বযাত্রী", b_lse_d: "লন্ডনের ডেমো বাজারে লেনদেন করুন", b_cancel: "মত বদল", b_cancel_d: "সই করে একটি অর্ডার বাতিল করুন",
    cel_buy: "লেনদেন নিষ্পন্ন! আপনি {q}টি {tk} কিনেছেন।", cel_sell: "লেনদেন নিষ্পন্ন! আপনি {q}টি {tk} বেচেছেন।",
    try_t: "এখনই চেষ্টা করুন: সাইন-আপ ছাড়াই", try_s: "একটি ডাকনাম দিন, কয়েক সেকেন্ডেই অনুশীলনের টাকায় লেনদেন শুরু করুন। আপনার সই করার চাবি এই ফোনেই তৈরি হয়।",
    nick: "আপনার ডাকনাম", try_go: "লেনদেন শুরু", try_wait: "ব্লকচেইনে আপনার অ্যাকাউন্ট তৈরি হচ্ছে…", or_sign: "অথবা সাইন ইন",
    perk1: "অনুশীলনের টাকা", perk2: "আসল ব্লকচেইন", perk3: "৪টি ভ্যালিডেটর", nick_bad: "২ থেকে ২৪টি অক্ষর বা সংখ্যা দিন।",
    welcome_t: "স্বাগতম, {name}!", welcome_s: "আপনার অনুশীলন অ্যাকাউন্ট তৈরি এবং ব্লকচেইনে নিবন্ধিত।",
    welcome_get: "আপনি পেয়েছেন {cash} অনুশীলনের টাকা এবং প্রতিটি কোম্পানির {n}টি করে শেয়ার।", explore: "নিজে ঘুরে দেখি",
    install: "অ্যাপ ইনস্টল", ios_t: "BlockExDSE হোম স্ক্রিনে যোগ করুন", ios_1: "Safari-তে শেয়ার বোতামে ট্যাপ করুন", ios_2: "“Add to Home Screen” বেছে নিন", ios_3: "হোম স্ক্রিন থেকে BlockExDSE খুলুন",
    inst_other: "ব্রাউজারের মেনু খুলে “Install app” বা “Add to Home screen” বেছে নিন।", installed: "ইনস্টল হয়েছে। হোম স্ক্রিন থেকে BlockExDSE খুলুন।",
    share_app: "অ্যাপটি শেয়ার করুন", share_s: "বন্ধুকে এই কোড স্ক্যান করতে দিন, সে তার ফোনে লেনদেন করে দেখতে পারবে।",
    board: "লাইভ বোর্ড", board_s: "স্টলের বড় স্ক্রিনের জন্য", scan: "স্ক্যান করে লেনদেন করুন", scan_s: "ক্যামেরা খুলে স্ক্যান করুন, একটি ডাকনাম দিন। শুধু অনুশীলনের টাকা।",
    feed: "লাইভ ব্লকচেইন ফিড", feed_s: "প্রতিটি অর্ডার: ফোনে সই, ৪টি ভ্যালিডেটরের যাচাই, ব্লকচেইনে নিষ্পত্তি", feed_empty: "প্রথম অর্ডারের অপেক্ষা…",
    local_warn: "ফোন এই ঠিকানা খুলতে পারবে না। সিস্টেম --public (ইন্টারনেট লিংক) বা --lan (একই Wi-Fi) দিয়ে চালু করুন।",
    trade_list: "শেয়ার", order_book: "অর্ডার বই", tap_price: "দামে ট্যাপ করলে সেটি বসবে", page_home: "সারসংক্ষেপ",
    n_feat: "বৈশিষ্ট্য", n_how: "কীভাবে কাজ করে", n_mkt: "লাইভ বাজার", l_badge: "লাইভ অনুশীলন বাজার · DSE ও LSE",
    l_h1a: "নিরাপদ শেয়ার লেনদেন,", l_h1b: "ব্লকচেইনে প্রমাণিত",
    l_s1: "এজ ভ্যালিডেটর প্রতিটি অর্ডার যাচাই করে", l_s2: "অনুমোদন, প্রতিটি অর্ডারের ঝুঁকি অনুযায়ী", l_s3: "আমাদের পরীক্ষায় একটি খারাপ অর্ডারও লেজারে যায়নি",
    l_mkt_t: "এখনকার লাইভ বাজার", l_mkt_s: "এই সিস্টেম থেকে এখনই হালনাগাদ হচ্ছে: ডেমো দাম, আর দর্শক ও অনুশীলন বটদের আসল লেনদেন।",
    l_feat_t: "কেন BlockExDSE", l_feat_s: "ULAB-এর একটি গবেষণা প্রোটোটাইপ, যা দেখায় একজন অপারেটরের ওপর ভরসা না করেও শেয়ারবাজারে লেনদেন নিষ্পত্তি করা যায়।",
    f1t: "আপনার ফোনেই সই", f1: "সই করার চাবি আপনার ডিভাইসেই তৈরি হয়। ব্রোকারসহ কেউই আপনার হয়ে অর্ডার দিতে পারে না।",
    f2t: "এজে যাচাই", f2: "লেজারে পৌঁছানোর আগে চারটি স্বাধীন ভ্যালিডেটর প্রতিটি অর্ডারে ব্রোকারের যাচাইগুলো চালায়।",
    f3t: "ঝুঁকি অনুযায়ী অনুমোদন", f3: "RACD প্রতিটি অর্ডারের স্কোর করে: সাধারণ অর্ডারে ৪টির মধ্যে ৩টি, বড় বা অস্বাভাবিক অর্ডারে সব ৪টি অনুমোদন লাগে।",
    f4t: "ব্লকচেইনে নিষ্পত্তি", f4: "স্মার্ট কন্ট্র্যাক্ট নিজেই প্রতিটি সই যাচাই করে, তারপর শেয়ার ও টাকা একসঙ্গে হস্তান্তর করে।",
    f5t: "লাইভ বাজারের টুল", f5: "টিকার, ডেমো সূচক, হিটম্যাপ, শীর্ষ পরিবর্তন এবং সিস্টেমের আসল ঘটনা নিয়ে নোটিশ বোর্ড।",
    f6t: "বাংলা বা ইংরেজি", f6: "যেকোনো সময় ভাষা বদলান। টাকার অঙ্ক বাংলা সংখ্যায় ও বাংলাদেশি নিয়মে দেখায়।",
    l_how_t: "একটি অর্ডার কীভাবে নিষ্পন্ন হয়", l_how_s: "আপনার ট্যাপ থেকে নিষ্পত্তি পর্যন্ত কয়েক সেকেন্ড।",
    h1t: "সই", h1: "আপনি ফোনে অর্ডারে সই করেন।", h2t: "যাচাই", h2: "চারটি এজ ভ্যালিডেটর যাচাই করে সই দেয়।",
    h3t: "স্কোর", h3: "ঝুঁকির স্কোর ঠিক করে ৪টির মধ্যে ৩টি নাকি সব ৪টি অনুমোদন লাগবে।", h4t: "প্রমাণ", h4: "কন্ট্র্যাক্ট নিজেই প্রতিটি সই যাচাই করে।",
    h5t: "নিষ্পত্তি", h5: "শেয়ার ও টাকা একসঙ্গে হস্তান্তর হয়; রেকর্ড ব্লকচেইনে সংরক্ষিত।",
    l_foot: "ULAB CSE ক্যাপস্টোন প্রকল্প। অনুশীলন সিস্টেম: টাকা, দাম ও পেমেন্ট কাল্পনিক; কোনো আসল এক্সচেঞ্জের সঙ্গে যুক্ত নয়।",
    l_cta: "অনুশীলনের টাকা দিয়ে শুরু করুন",
    sim_banner: "অনুশীলন সিস্টেম: টাকা, দাম ও পেমেন্ট কাল্পনিক", copy_link: "লিংক শেয়ার", show_all: "সব {n}টি দেখুন", show_less: "কম দেখুন", trade_1: "লেনদেন",
  },
};
const t = k => (L[S.lang] && L[S.lang][k]) || L.en[k] || k;
const tf = (k, p) => t(k).replace(/\{(\w+)\}/g, (_, x) => p[x] ?? "");
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const loc = () => S.lang === "bn" ? "bn-BD" : "en-IN";
/* "3 of 4" and the approval sentences, in the word order of each language */
function ofN(a, n) { return S.lang === "bn" ? `${num(n)}টির মধ্যে ${num(a)}টি` : `${a} of ${n}`; }
function needQ(r, q, n) {
  if (S.lang === "bn") return r ? `<b>${t("escalated")}:</b> ${num(q.risky)}টি অনুমোদন লাগবে, ${num(q.routine)}টি নয়` : `<b>${t("routine")}:</b> ${ofN(q.routine, n)} অনুমোদন লাগবে`;
  return r ? `<b>${t("escalated")}:</b> needs ${q.risky} approvals, not ${q.routine}` : `<b>${t("routine")}:</b> needs ${q.routine} of ${n} approvals`;
}
function setLang(l) { S.lang = l; if (l === "bn") setFlag("bangla"); localStorage.setItem("bx_lang", l); document.documentElement.lang = l === "bn" ? "bn" : "en"; document.body.classList.toggle("bn", l === "bn"); route(); }

/* ───────── numbers ───────── */
const MK = () => S.info.markets[S.market];
function money(m, n) { const f = S.info.markets[m].fmt; return f.prefix + (n / f.div).toLocaleString(undefined, { minimumFractionDigits: f.dec, maximumFractionDigits: f.dec }) + f.suffix; }
function px(m, n) { return fmt(n) + S.info.markets[m].fmt.price_suffix; }
/* investor screens: Tk with Bangladeshi grouping (2,45,300), Bangla digits in Bangla mode; pounds for the LSE */
function cash$(m, n, dec) {
  const f = S.info.markets[m].fmt, v = n / f.div;
  if (m === "DSE") return (S.lang === "bn" ? "৳" : "Tk ") + v.toLocaleString(loc(), { maximumFractionDigits: dec ?? 0 });
  return "£" + v.toLocaleString(S.lang === "bn" ? "bn-BD" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function price$(m, n) { return m === "DSE" ? cash$(m, n) : num(n) + "p"; }
function num(n) { return Number(n).toLocaleString(loc()); }
function pct(c) { return (c > 0 ? "+" : "") + Number(c).toLocaleString(loc(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%"; }
function pcHTML(c) { return `<span class="pc ${c > 0 ? "up" : c < 0 ? "dn" : "fl"} ${c > 0 ? "up" : c < 0 ? "dn" : ""}">${c > 0 ? "▲" : c < 0 ? "▼" : ""} ${pct(Math.abs(c)).replace("+", "")}</span>`; }
function chgHTML(c) { return `<span class="${c > 0 ? "up" : c < 0 ? "dn" : "sub"}">${c > 0 ? "+" : ""}${c.toFixed(2)}%</span>`; }

/* ───────── API ───────── */
async function api(path, opt = {}) {
  const headers = { "Content-Type": "application/json" };
  if (S.token) headers.Authorization = "Bearer " + S.token;
  const r = await fetch(path, { ...opt, headers, body: opt.body ? JSON.stringify(opt.body) : undefined });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) {
    if (r.status === 401 && S.token && !path.includes("/auth/login")) { signOutLocal(); toast(t("session_end")); }
    const d = j.detail; throw new Error(typeof d === "string" ? d : (Array.isArray(d) ? "Please check the form fields." : r.statusText));
  }
  return j;
}
let toastT; function toast(msg) { const el = $("#toast"); el.textContent = msg; el.style.display = "block"; clearTimeout(toastT); toastT = setTimeout(() => el.style.display = "none", 4200); }
function signOutLocal() {
  S.token = ""; S.tab = "in"; S.otpDemo = ""; S.me = null; S.portfolios = null; S.view = null; S.cur = null; S.key = null; S.keyDemo = false; S.review = [];
  S.itab = "home"; S.watch = {}; S.wallet = null; S.orders = []; S.ordersLoaded = false; S.lb = null; S.guide = { on: false, step: 0 }; closeSheet(); hideCoach();
  sessionStorage.removeItem("bx_token"); sessionStorage.removeItem("bx_demo_key"); localStorage.removeItem("bx_qtoken"); S.prevOrd = null; route();
}
function setToken(tk) { S.token = tk; sessionStorage.setItem("bx_token", tk); }
document.addEventListener("click", e => { const h = e.target.closest(".hash"); if (h && h.dataset.full && navigator.clipboard) navigator.clipboard.writeText(h.dataset.full).then(() => toast(t("copied") + ": " + short(h.dataset.full))); });
const H = h => h ? `<span class="hash mono" data-full="${esc(h)}" title="Click to copy">${esc(short(h))}</span>` : "–";
function busy(btn, on) { if (btn) btn.disabled = on; }

/* ───────── the investor's signing key (stays on this device) ───────── */
const keyStore = {
  get(email) { try { return localStorage.getItem("bx_key_" + String(email).toLowerCase()); } catch (e) { return null; } },
  set(email, k) { try { localStorage.setItem("bx_key_" + String(email).toLowerCase(), k); return true; } catch (e) { return false; } },
};
function loadKey() {
  const u = S.me && S.me.user; S.key = null; S.keyDemo = false;
  if (!u || u.role !== "trader" || !window.BXSign) return;
  const demo = sessionStorage.getItem("bx_demo_key"), k = demo || keyStore.get(u.email) || S.tmpKey;
  if (!k || !BXSign.validKey(k)) return;
  if (u.wallet && BXSign.addressOf(k).toLowerCase() !== u.wallet.toLowerCase()) return;      // a key that belongs to another account
  S.key = k; S.keyDemo = !!demo;
}
function ensureKey() {                      // called at the identity step: create the key here, in the browser
  const em = S.me.user.email; let k = keyStore.get(em) || S.tmpKey;
  if (!k || !BXSign.validKey(k)) { k = BXSign.newKey(); S.tmpKey = k; if (!keyStore.set(em, k)) toast("This browser blocks local storage: the key will be lost when the tab closes."); }
  return k;
}
function domainOf(m) {                      // computed here from the chain id and contract address, then compared with the gateway's value
  const cfg = S.info.markets[m], d = BXSign.domainSeparator(S.info.chain.id, cfg.contract);
  if (d.toLowerCase() !== String(cfg.domain).toLowerCase()) throw new Error("Safety check failed: the signing domain does not match this contract.");
  return d;
}
async function loadMe() { S.me = await api("/api/me"); S.portfolios = S.me.portfolios || null; loadKey(); }
async function act(btn, fn, okMsg) {
  busy(btn, true);
  try { await fn(); toast(okMsg); await loadMe(); route(); } catch (e) { const el = $("#err"); if (el) el.textContent = e.message; else toast(e.message); }
  busy(btn, false);
}

/* ───────── routing ───────── */
function route() {
  if (location.hash === "#board") { S.view = "board"; setShell("board"); return mountBoard(); }
  stopBoard();
  const u = S.me && S.me.user;
  document.body.classList.toggle("bn", S.lang === "bn" && (!u || u.role === "trader"));
  if (!u) { S.view = "guest"; setShell("land"); return mountGuest(); }
  stopLanding();
  if (u.role === "trader" && u.status !== "active") { S.view = "onboard"; setShell("guest"); return mountOnboard(); }
  if (u.role === "trader") { S.view = "inv"; setShell("inv"); renderInv(); connectStream(); tick(); return; }
  setShell("staff");
  const tabs = TABS[u.role]; if (!tabs.some(x => x[0] === S.view)) S.view = tabs[0][0];
  renderNav(); renderMarketBar(); renderWho();
  ({ orders: mountOrders, market: mountMarket, roadmap: mountRoadmap, requests: mountRequests, accounts: mountAccounts, review: mountReview, proof: mountProof })[S.view]();
  connectStream(); tick();
}
function setShell(kind) {
  if (document.body.dataset.shell === kind) return;
  document.body.dataset.shell = kind; document.body.className = kind === "staff" ? "staff" : kind === "inv" ? "inv" : kind === "board" ? "board" : kind === "land" ? "guest land" : "guest";
  if (S.lang === "bn" && kind !== "staff") document.body.classList.add("bn");
  $("#root").innerHTML = kind === "staff"
    ? `<header><div class="brand"><div class="logo">${logoSVG()}</div><div>${WORDMARK}<small>${esc(BRAND.project)} · staff console (simulated)</small></div></div><div class="who" id="who"></div></header><div class="mkbar" id="mkbar"></div><nav id="nav"></nav><main id="main"></main>`
    : kind === "inv" ? `<div class="shell"><div id="itop"></div><div id="main"></div></div><div class="tabs"><div class="nbrand"><div class="logo">${logoSVG()}</div><div>${WORDMARK}<small>${esc(BRAND.project)}</small></div></div><div class="in" id="itabs"></div><div class="nfoot" id="nfoot"></div></div>`
    : kind === "board" ? `<div class="bw" id="main"></div>`
    : kind === "land" ? `<div class="land" id="main"></div>`
    : `<div class="gwrap" id="main"></div>`;
}

/* ───────── live market data (stream with polling fallback) ───────── */
function connectStream() {
  if (S.es && S.es.mk === S.market) return;
  if (S.es) { S.es.close(); S.es = null; }
  if (!window.EventSource || !S.token) return;
  const es = new EventSource("/api/stream/" + S.market); es.mk = S.market;
  es.onmessage = e => { try { S.snap[es.mk] = JSON.parse(e.data); S.liveAt = Date.now(); refreshLive(); } catch (x) {} };
  S.es = es;
}
const isLive = () => Date.now() - S.liveAt < 3500;
function snap() { return S.snap[S.market] || null; }
function lastOf(m, tk) { const sn = S.snap[m], v = sn && sn.tickers[tk]; return v ? v.last : S.info.markets[m].tickers[tk].ref; }
function selTicker() { const x = S.tk[S.market]; return x && MK().tickers[x] ? x : Object.keys(MK().tickers)[0]; }
function expectPrice(tk, side) {
  const sn = snap(), v = sn && sn.tickers[tk]; if (!v) return null;
  const l = side === "BUY" ? v.asks : v.bids; return l.length ? l[0][0] : null;
}
function riskOf(tk, qty, price, otype) {    // the contract's integer rule (BlockExDSE.riskScore), repeated here only as a preview
  const cfg = MK(), x = cfg.tickers[tk], ref = x.ref, bps = x.band_bps, mkt = otype === "MARKET";
  const n = qty * (mkt ? ref : price);
  const nPart = Math.min(Math.floor(n * 10000 / cfg.risk_notional), 10000);
  let dPart = 0, dev = 0;
  if (!mkt && bps > 0) { dev = Math.floor(Math.abs(price - ref) * 10000 / ref); dPart = Math.min(Math.floor(dev * 20000 / bps), 10000); }
  const score = Math.floor((nPart + dPart) / 2);
  return { n, dev, score, esc: score >= 5000, out: price * 10000 < ref * (10000 - bps) || price * 10000 > ref * (10000 + bps), big: qty > cfg.max_qty, band: bps / 100 };
}
