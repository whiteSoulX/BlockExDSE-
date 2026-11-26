// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BlockExDSE v2.1 settlement contract (one is deployed per market)
/// @notice The contract trusts no single party:
///   1. every order is signed by the investor (EIP-712), so nobody can place an order in another person's name;
///   2. every order carries signatures from the edge validators that checked it, and the contract recovers the
///      signers itself instead of trusting a reported vote count;
///   3. the contract recomputes the risk tier from the order and its own reference prices, so the sender cannot
///      label a risky order as routine;
///   4. cash and shares are locked when the order is accepted, so a matched trade can always settle.
contract BlockExDSE {
    enum Side { Buy, Sell }
    enum Status { Open, Partial, Filled, Cancelled }

    struct OrderIn {                      // exactly what the investor signs
        address trader;
        bytes32 ticker;
        uint256 qty;
        uint256 price;                    // limit price; for a market order, the protective limit at the band edge
        uint8 side;                       // 0 buy, 1 sell
        uint8 otype;                      // 0 limit, 1 market (immediate or cancel)
        uint256 nonce;                    // any unused number: stops replay
        uint256 expiry;                   // unix seconds: the order cannot be placed after this time
    }
    struct Order {                        // packed into 4 storage slots to keep order entry cheap
        address trader; uint40 ts; uint8 otype; uint8 tier; uint8 votes; Side side; Status status;
        bytes32 ticker;
        uint64 qty; uint64 remaining; uint64 price; uint64 expiry;
        bytes32 orderHash;
    }
    struct Trade {                        // 2 storage slots
        uint48 buyId; uint48 sellId; uint64 qty; uint64 price; uint32 ts;
        bytes32 recordHash;
    }
    struct TickerCfg { uint256 ref; uint256 bandBps; }

    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(address trader,bytes32 ticker,uint256 qty,uint256 price,uint8 side,uint8 otype,uint256 nonce,uint256 expiry)");
    bytes32 public constant ATTEST_TYPEHASH = keccak256("Attestation(bytes32 batchRoot)");
    bytes32 public constant CANCEL_TYPEHASH = keccak256("Cancel(uint256 orderId)");
    bytes32 public constant WITHDRAW_TYPEHASH = keccak256("Withdraw(address trader,uint256 amount,uint256 nonce,uint256 expiry)");
    uint256 private constant HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;
    bytes32 public immutable DOMAIN_SEPARATOR;

    address public admin;
    address public compliance;            // human reviewer key: may stand in for ONE validator on an escalated order
    uint256 public orderCount;
    uint256 public tradeCount;
    uint256 public riskNotional;          // order value at which the size part of the risk score is full
    uint8 public quorumStd = 3;           // validator signatures needed for a routine order
    uint8 public quorumEsc = 4;           // signatures needed for an escalated (risky) order
    uint8 public validatorCount;

    mapping(address => bool) public kyc;
    mapping(address => bool) public edgeNode;            // accounts allowed to relay transactions
    mapping(address => uint8) public validatorIndex;     // 1..N for whitelisted edge validators, 0 = not a validator
    address[] private validatorList;
    mapping(bytes32 => TickerCfg) public tickers;
    mapping(address => uint256) public cash;
    mapping(address => uint256) public lockedCash;
    mapping(address => mapping(bytes32 => uint256)) public holdings;
    mapping(address => mapping(bytes32 => uint256)) public lockedShares;
    mapping(address => mapping(uint256 => bool)) public usedNonce;
    mapping(uint256 => Order) private orders;
    mapping(uint256 => Trade) private trades;

    event TraderRegistered(address indexed trader, uint256 cash);
    event SharesCredited(address indexed trader, bytes32 ticker, uint256 qty);
    event OrderPlaced(uint256 indexed id, address indexed trader, bytes32 ticker, uint256 qty, uint256 price, uint8 side, uint8 otype, bytes32 orderHash);
    event OrderAttested(uint256 indexed id, uint8 tier, uint8 votes, bool compliance, uint256 signerBitmap);
    event TradeSettled(uint256 indexed id, uint256 indexed buyId, uint256 indexed sellId, uint256 qty, uint256 price);
    event HashAnchored(uint256 indexed tradeId, bytes32 recordHash);
    event OrderCancelled(uint256 indexed id, uint256 remainingQty);
    event CashDeposited(address indexed trader, uint256 amount);       // v2.1: practice top-up (simulated payment)
    event CashWithdrawn(address indexed trader, uint256 amount);       // v2.1: signed by the investor on their device

    modifier onlyAdmin() { require(msg.sender == admin, "not admin"); _; }
    modifier onlyEdge() { require(edgeNode[msg.sender], "not whitelisted edge"); _; }

    constructor() {
        admin = msg.sender;
        edgeNode[msg.sender] = true;
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("BlockExDSE"), keccak256("2"), block.chainid, address(this)));
    }

    // ───────────── administration ─────────────
    function setEdgeNode(address a, bool ok) external onlyAdmin { edgeNode[a] = ok; }
    function setCompliance(address a) external onlyAdmin { compliance = a; }
    function setRiskNotional(uint256 v) external onlyAdmin { riskNotional = v; }
    function setTicker(bytes32 ticker, uint256 ref, uint256 bandBps) external onlyAdmin {
        require(ref > 0 && bandBps < 10000, "bad ticker config");
        tickers[ticker] = TickerCfg(ref, bandBps);
    }
    function setQuorum(uint8 std_, uint8 esc_) external onlyAdmin {
        require(std_ <= esc_ && esc_ <= validatorCount + 1, "bad quorum");
        quorumStd = std_;
        quorumEsc = esc_;
    }
    function setValidators(address[] calldata addrs) external onlyAdmin {
        require(addrs.length < 200, "too many validators");
        for (uint256 i = 0; i < validatorList.length; i++) validatorIndex[validatorList[i]] = 0;
        delete validatorList;
        for (uint256 i = 0; i < addrs.length; i++) {
            require(addrs[i] != address(0) && validatorIndex[addrs[i]] == 0, "bad validator list");
            validatorIndex[addrs[i]] = uint8(i + 1);
            validatorList.push(addrs[i]);
        }
        validatorCount = uint8(addrs.length);
    }
    function registerTrader(address t, uint256 startCash) external onlyAdmin {
        kyc[t] = true;
        cash[t] += startCash;
        emit TraderRegistered(t, startCash);
    }
    function creditShares(address t, bytes32 ticker, uint256 qty) external onlyAdmin {
        require(kyc[t], "no kyc");
        holdings[t][ticker] += qty;
        emit SharesCredited(t, ticker, qty);
    }

    // ───────────── v2.1 wallet: add money and withdraw (simulated money; the rules are real) ─────────────
    /// Adding money: the broker confirms the (simulated) payment, then credits the investor's on-chain cash.
    function depositCash(address t, uint256 amount) external onlyAdmin {
        require(kyc[t], "no kyc");
        require(amount > 0, "bad amount");
        cash[t] += amount;
        emit CashDeposited(t, amount);
    }
    /// Withdrawing: only with the investor's own signature, only from free cash (never from cash locked in orders).
    function withdrawDigest(address t, uint256 amount, uint256 nonce, uint256 expiry) public view returns (bytes32) {
        return _digest(keccak256(abi.encode(WITHDRAW_TYPEHASH, t, amount, nonce, expiry)));
    }
    function withdrawCash(address t, uint256 amount, uint256 nonce, uint256 expiry, bytes calldata sig) external onlyEdge {
        require(kyc[t], "no kyc");
        require(amount > 0, "bad amount");
        require(block.timestamp <= expiry, "withdrawal expired");
        require(!usedNonce[t][nonce], "nonce already used");
        require(_recover(withdrawDigest(t, amount, nonce, expiry), sig) == t, "bad trader signature");
        require(cash[t] >= amount, "insufficient free cash");
        usedNonce[t][nonce] = true;
        cash[t] -= amount;
        emit CashWithdrawn(t, amount);
    }

    // ───────────── hashing (public so that clients and auditors can cross-check) ─────────────
    function hashOrder(OrderIn calldata o) public pure returns (bytes32) {
        return keccak256(abi.encode(ORDER_TYPEHASH, o.trader, o.ticker, o.qty, o.price, o.side, o.otype, o.nonce, o.expiry));
    }
    function orderDigest(OrderIn calldata o) external view returns (bytes32) { return _digest(hashOrder(o)); }
    function attestDigest(bytes32 batchRoot) public view returns (bytes32) {
        return _digest(keccak256(abi.encode(ATTEST_TYPEHASH, batchRoot)));
    }
    function cancelDigest(uint256 orderId) public view returns (bytes32) {
        return _digest(keccak256(abi.encode(CANCEL_TYPEHASH, orderId)));
    }
    function _digest(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }
    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address a) {
        require(sig.length == 65, "bad signature length");
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (v < 27) v += 27;
        require(uint256(s) <= HALF_N, "bad signature s");
        a = ecrecover(digest, v, r, s);
        require(a != address(0), "bad signature");
    }

    // ───────────── the risk rule (integer basis points; the edge nodes compute the same numbers) ─────────────
    /// score = (size part + price part) / 2, each part 0..10000.
    ///   size part  = order value / riskNotional (a market order is valued at the reference price)
    ///   price part = distance from the reference price / half the allowed band (0 for a market order)
    function riskScore(bytes32 ticker, uint256 qty, uint256 price, uint8 otype) public view returns (uint256) {
        TickerCfg memory t = tickers[ticker];
        if (t.ref == 0 || riskNotional == 0) return 0;
        uint256 nPart = qty * (otype == 1 ? t.ref : price) * 10000 / riskNotional;
        if (nPart > 10000) nPart = 10000;
        uint256 dPart = 0;
        if (otype == 0 && t.bandBps > 0) {
            uint256 devBps = (price > t.ref ? price - t.ref : t.ref - price) * 10000 / t.ref;
            dPart = devBps * 20000 / t.bandBps;
            if (dPart > 10000) dPart = 10000;
        }
        return (nPart + dPart) / 2;
    }
    function riskTier(bytes32 ticker, uint256 qty, uint256 price, uint8 otype) public view returns (uint8) {
        return riskScore(ticker, qty, price, otype) >= 5000 ? 1 : 0;
    }

    // ───────────── order entry ─────────────
    /// @param ins        one or more signed orders (a batch shares one round of validator signatures)
    /// @param traderSigs the investor's signature for each order
    /// @param attSigs    65-byte validator signatures, concatenated, over attestDigest(keccak256(all order hashes))
    /// @param compSig    optional signature of the compliance reviewer over the same digest
    function placeOrders(OrderIn[] calldata ins, bytes[] calldata traderSigs, bytes calldata attSigs, bytes calldata compSig)
        external onlyEdge returns (uint256 firstId)
    {
        require(ins.length > 0 && ins.length == traderSigs.length, "bad batch");
        bytes32[] memory hashes = new bytes32[](ins.length);
        for (uint256 i = 0; i < ins.length; i++) hashes[i] = hashOrder(ins[i]);
        Att memory a = _attestation(attestDigest(keccak256(abi.encodePacked(hashes))), attSigs, compSig);
        firstId = orderCount + 1;
        for (uint256 i = 0; i < ins.length; i++) {
            uint8 tier = _check(ins[i], hashes[i], traderSigs[i], a.votes, a.comp);
            emit OrderAttested(_store(ins[i], hashes[i], tier, a.votes), tier, a.votes, a.comp, a.bitmap);
        }
    }

    struct Att { uint8 votes; bool comp; uint256 bitmap; }

    function _attestation(bytes32 digest, bytes calldata attSigs, bytes calldata compSig) internal view returns (Att memory a) {
        (a.votes, a.bitmap) = _countValidators(digest, attSigs);
        a.comp = compSig.length == 65 && compliance != address(0) && _recover(digest, compSig) == compliance;
    }

    function _countValidators(bytes32 digest, bytes calldata sigs) internal view returns (uint8 n, uint256 bitmap) {
        require(sigs.length % 65 == 0, "bad attestation length");
        uint256 k = sigs.length / 65;
        for (uint256 i = 0; i < k; i++) {
            uint8 idx = validatorIndex[_recover(digest, sigs[i * 65:(i + 1) * 65])];
            require(idx != 0, "unknown validator");
            uint256 bit = uint256(1) << idx;
            require(bitmap & bit == 0, "duplicate validator signature");
            bitmap |= bit;
            n++;
        }
    }

    function _check(OrderIn calldata o, bytes32 h, bytes calldata sig, uint8 votes, bool comp) internal view returns (uint8 tier) {
        require(kyc[o.trader], "trader not KYC verified");
        require(o.qty > 0 && o.price > 0, "bad qty/price");
        require(o.qty < 2**64 && o.price < 2**64 && o.expiry < 2**64, "number too large");
        require(o.side <= 1 && o.otype <= 1, "bad side/type");
        require(block.timestamp <= o.expiry, "order expired");
        require(!usedNonce[o.trader][o.nonce], "nonce already used");
        require(_recover(_digest(h), sig) == o.trader, "bad trader signature");
        TickerCfg memory t = tickers[o.ticker];
        require(t.ref > 0, "unknown ticker");
        require(o.price * 10000 >= t.ref * (10000 - t.bandBps) && o.price * 10000 <= t.ref * (10000 + t.bandBps), "price outside band");
        tier = riskTier(o.ticker, o.qty, o.price, o.otype);
        if (tier == 1) require(votes >= quorumStd && votes + (comp ? 1 : 0) >= quorumEsc, "quorum not reached for escalated order");
        else require(votes >= quorumStd, "quorum not reached");
    }

    function _store(OrderIn calldata o, bytes32 h, uint8 tier, uint8 votes) internal returns (uint256 id) {
        usedNonce[o.trader][o.nonce] = true;
        if (o.side == 1) {                                   // sell: lock the shares
            require(holdings[o.trader][o.ticker] >= o.qty, "insufficient shares");
            holdings[o.trader][o.ticker] -= o.qty;
            lockedShares[o.trader][o.ticker] += o.qty;
        } else {                                             // buy: lock cash at the limit price
            uint256 need = o.qty * o.price;
            require(cash[o.trader] >= need, "insufficient cash");
            cash[o.trader] -= need;
            lockedCash[o.trader] += need;
        }
        id = ++orderCount;
        orders[id] = Order(o.trader, uint40(block.timestamp), o.otype, tier, votes, Side(o.side), Status.Open, o.ticker,
                           uint64(o.qty), uint64(o.qty), uint64(o.price), uint64(o.expiry), h);
        emit OrderPlaced(id, o.trader, o.ticker, o.qty, o.price, o.side, o.otype, h);
    }

    // ───────────── matching and settlement (delivery versus payment in one transaction) ─────────────
    function matchOrders(uint256 buyId, uint256 sellId) external onlyEdge returns (uint256 tid, uint256 qty, uint256 price) {
        Order storage b = orders[buyId];
        Order storage s = orders[sellId];
        require(b.trader != address(0) && s.trader != address(0), "unknown order");
        require(b.side == Side.Buy && s.side == Side.Sell, "wrong sides");
        require(b.ticker == s.ticker, "ticker mismatch");
        require(b.remaining > 0 && s.remaining > 0, "nothing left to match");
        require(b.price >= s.price, "prices do not cross");
        require(b.trader != s.trader, "self trade");
        qty = b.remaining < s.remaining ? b.remaining : s.remaining;
        price = buyId < sellId ? b.price : s.price;         // the resting (earlier) order sets the price
        lockedCash[b.trader] -= qty * uint256(b.price);
        cash[b.trader] += qty * (uint256(b.price) - price); // refund of price improvement
        cash[s.trader] += qty * price;
        lockedShares[s.trader][b.ticker] -= qty;
        holdings[b.trader][b.ticker] += qty;
        b.remaining -= uint64(qty);
        s.remaining -= uint64(qty);
        b.status = b.remaining == 0 ? Status.Filled : Status.Partial;
        s.status = s.remaining == 0 ? Status.Filled : Status.Partial;
        tid = ++tradeCount;
        trades[tid] = Trade(uint48(buyId), uint48(sellId), uint64(qty), uint64(price), uint32(block.timestamp), bytes32(0));
        emit TradeSettled(tid, buyId, sellId, qty, price);
    }

    /// A limit order can only be cancelled with the investor's signature. The relayer may cancel without one in two
    /// cases the investor already agreed to: the unfilled rest of a market order, and an order past its expiry.
    function cancelOrder(uint256 id, bytes calldata sig) external onlyEdge {
        Order storage o = orders[id];
        require(o.remaining > 0, "nothing to cancel");
        if (o.otype == 0 && block.timestamp <= o.expiry) {
            require(sig.length == 65 && _recover(cancelDigest(id), sig) == o.trader, "cancel not signed by the trader");
        }
        uint256 rem = o.remaining;
        o.remaining = 0;
        o.status = Status.Cancelled;
        if (o.side == Side.Buy) {
            lockedCash[o.trader] -= rem * uint256(o.price);
            cash[o.trader] += rem * uint256(o.price);
        } else {
            lockedShares[o.trader][o.ticker] -= rem;
            holdings[o.trader][o.ticker] += rem;
        }
        emit OrderCancelled(id, rem);
    }

    function anchorHash(uint256 tradeId, bytes32 recordHash) external onlyEdge {
        Trade storage t = trades[tradeId];
        require(t.buyId != 0, "unknown trade");
        require(t.recordHash == bytes32(0), "already anchored");
        t.recordHash = recordHash;
        emit HashAnchored(tradeId, recordHash);
    }

    // ───────────── views ─────────────
    function getOrder(uint256 id) external view returns (Order memory) { return orders[id]; }
    function getTrade(uint256 id) external view returns (Trade memory) { return trades[id]; }
    function getValidators() external view returns (address[] memory) { return validatorList; }
}
