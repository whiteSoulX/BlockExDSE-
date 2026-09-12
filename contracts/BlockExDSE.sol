// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title BlockExDSE
 * @notice Prototype settlement contract for the BlockExDSE hybrid exchange.
 *
 * Design notes for the team:
 * - This contract represents the BLOCKCHAIN LAYER only. It expects to receive
 *   already-validated, already-batched orders from the edge layer (Tier 1).
 * - It does NOT re-validate individual order correctness — that is the edge
 *   layer's job (PBFT-lite). This contract only handles matching, settlement,
 *   and the hash-anchoring of off-chain data (D2, D5, D6).
 * - "Delegates" here stand in for our DPoS layer (Tier 2). For the prototype,
 *   we use a simple whitelist + majority-signal model rather than a full
 *   DPoS election — election/rotation logic is a documented future-work item.
 */
contract BlockExDSE {
    // ── Order data (D1) ──────────────────────────────────────────────────
    enum OrderType { BUY, SELL }
    enum OrderStatus { PENDING, MATCHED, SETTLED, CANCELLED }

    struct Order {
        uint256 id;
        address trader;
        string ticker;
        OrderType orderType;
        uint256 quantity;
        uint256 price; // price per unit, in smallest currency unit
        uint256 timestamp;
        OrderStatus status;
    }

    // ── Match record (D2) ────────────────────────────────────────────────
    struct MatchRecord {
        uint256 id;
        uint256 buyOrderId;
        uint256 sellOrderId;
        uint256 matchedPrice;
        uint256 matchedQuantity;
        uint256 timestamp;
    }

    // ── Settlement record (D3) — the only data permanently on-chain in full ──
    struct Settlement {
        uint256 id;
        uint256 matchId;
        address buyer;
        address seller;
        string ticker;
        uint256 quantity;
        uint256 totalAmount;
        bytes32 offChainHash; // SHA-256 anchor for full off-chain record (D2/D5/D6)
        uint256 blockTimestamp;
    }

    // ── State ───────────────────────────────────────────────────────────
    address public admin;
    mapping(address => bool) public delegates;      // Tier 2: DPoS delegate whitelist
    mapping(address => bool) public kycVerified;     // consortium membership (Task Q: KYC enforcement)

    uint256 public nextOrderId = 1;
    uint256 public nextMatchId = 1;
    uint256 public nextSettlementId = 1;

    mapping(uint256 => Order) public orders;
    mapping(uint256 => MatchRecord) public matches;
    mapping(uint256 => Settlement) public settlements;

    // ── DPoS-lite delegate election (Tier 2) ───────────────────────────────
    // Simplified stake-free election: every KYC-verified participant gets
    // one vote, admin triggers a rotation that promotes the current top-N
    // vote-getters to delegate status. This sits alongside the original
    // addDelegate() whitelist (kept for manual override / local testing) —
    // real delegate elections are the intended path going forward.
    mapping(address => address) public delegateVoteOf; // voter => candidate
    mapping(address => uint256) public voteCount;       // candidate => votes
    address[] public candidates;                        // anyone who ever received a vote
    mapping(address => bool) private isCandidate;

    // ── Events (what your React frontend and edge layer listen for) ───────
    event OrderPlaced(uint256 indexed orderId, address indexed trader, string ticker, OrderType orderType, uint256 quantity, uint256 price);
    event OrderCancelled(uint256 indexed orderId);
    event OrdersMatched(uint256 indexed matchId, uint256 buyOrderId, uint256 sellOrderId, uint256 matchedPrice, uint256 matchedQuantity);
    event TradeSettled(uint256 indexed settlementId, uint256 indexed matchId, address buyer, address seller, bytes32 offChainHash);
    event DelegateAdded(address indexed delegate);
    event ParticipantVerified(address indexed participant);
    event DelegateVoteCast(address indexed voter, address indexed candidate);
    event DelegatesRotated(address[] delegates);

    // ── Modifiers ───────────────────────────────────────────────────────
    modifier onlyAdmin() {
        require(msg.sender == admin, "BlockExDSE: caller is not admin");
        _;
    }

    modifier onlyDelegate() {
        require(delegates[msg.sender], "BlockExDSE: caller is not an elected delegate");
        _;
    }

    modifier onlyKycVerified() {
        require(kycVerified[msg.sender], "BlockExDSE: participant not KYC verified");
        _;
    }

    constructor() {
        admin = msg.sender;
        delegates[msg.sender] = true; // deployer is delegate #1 for local testing
        kycVerified[msg.sender] = true;
    }

    // ── Admin: consortium membership (Task Q — KYC Enforcement Rate) ──────
    function addDelegate(address _delegate) external onlyAdmin {
        delegates[_delegate] = true;
        emit DelegateAdded(_delegate);
    }

    function verifyParticipant(address _participant) external onlyAdmin {
        kycVerified[_participant] = true;
        emit ParticipantVerified(_participant);
    }

    // ── DPoS-lite: delegate election ────────────────────────────────────
    // Any KYC-verified participant gets exactly one vote, which it can move
    // to a different candidate at any time (its previous vote, if any, is
    // withdrawn first). This is a stake-free stand-in for full DPoS
    // stake-weighted voting — sufficient to demonstrate delegate rotation
    // without introducing a staking token into the prototype.
    function voteForDelegate(address _candidate) external onlyKycVerified {
        require(_candidate != address(0), "BlockExDSE: invalid candidate");

        address previous = delegateVoteOf[msg.sender];
        if (previous == _candidate) return;

        if (previous != address(0)) {
            voteCount[previous] -= 1;
        }

        if (!isCandidate[_candidate]) {
            isCandidate[_candidate] = true;
            candidates.push(_candidate);
        }

        delegateVoteOf[msg.sender] = _candidate;
        voteCount[_candidate] += 1;

        emit DelegateVoteCast(msg.sender, _candidate);
    }

    function candidateCount() external view returns (uint256) {
        return candidates.length;
    }

    // Admin-triggered epoch rotation: promotes the current top-_topN
    // vote-getters to delegate status and demotes every other non-admin
    // delegate. The admin's own address always stays a delegate so the
    // consortium can never be left without one. Sorting a small candidate
    // array on-chain is fine at prototype scale; a production DPoS layer
    // would do this off-chain and submit only the result.
    function rotateDelegates(uint256 _topN) external onlyAdmin {
        uint256 n = candidates.length;
        address[] memory sorted = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            sorted[i] = candidates[i];
        }
        for (uint256 i = 0; i < n; i++) {
            uint256 maxIdx = i;
            for (uint256 j = i + 1; j < n; j++) {
                if (voteCount[sorted[j]] > voteCount[sorted[maxIdx]]) {
                    maxIdx = j;
                }
            }
            if (maxIdx != i) {
                (sorted[i], sorted[maxIdx]) = (sorted[maxIdx], sorted[i]);
            }
        }

        // Demote every current candidate that isn't admin — the winners get
        // re-promoted just below.
        for (uint256 i = 0; i < n; i++) {
            if (sorted[i] != admin) {
                delegates[sorted[i]] = false;
            }
        }

        uint256 winners = _topN < n ? _topN : n;
        address[] memory newDelegates = new address[](winners + 1);
        newDelegates[0] = admin;
        delegates[admin] = true;
        for (uint256 i = 0; i < winners; i++) {
            delegates[sorted[i]] = true;
            newDelegates[i + 1] = sorted[i];
        }

        emit DelegatesRotated(newDelegates);
    }

    // ── Trader: place an order ─────────────────────────────────────────
    // Direct call path — a trader's own wallet places its own order. Used
    // by the frontend's Trade tab when a trader interacts with the chain
    // directly rather than going through the edge layer first.
    function placeOrder(
        string calldata _ticker,
        OrderType _orderType,
        uint256 _quantity,
        uint256 _price
    ) external onlyKycVerified returns (uint256) {
        return _placeOrder(msg.sender, _ticker, _orderType, _quantity, _price);
    }

    // ── Delegate: place an order on behalf of a trader ──────────────────
    // This is the edge-layer path: once a batch clears PBFT-lite validation,
    // a delegate forwards each order to the chain here, on behalf of the
    // trader who actually submitted it off-chain. The trader still must be
    // KYC-verified; only the *caller* requirement differs from placeOrder().
    function placeOrderFor(
        address _trader,
        string calldata _ticker,
        OrderType _orderType,
        uint256 _quantity,
        uint256 _price
    ) external onlyDelegate returns (uint256) {
        require(kycVerified[_trader], "BlockExDSE: participant not KYC verified");
        return _placeOrder(_trader, _ticker, _orderType, _quantity, _price);
    }

    function _placeOrder(
        address _trader,
        string calldata _ticker,
        OrderType _orderType,
        uint256 _quantity,
        uint256 _price
    ) internal returns (uint256) {
        require(_quantity > 0, "BlockExDSE: quantity must be positive");
        require(_price > 0, "BlockExDSE: price must be positive");

        uint256 orderId = nextOrderId++;
        orders[orderId] = Order({
            id: orderId,
            trader: _trader,
            ticker: _ticker,
            orderType: _orderType,
            quantity: _quantity,
            price: _price,
            timestamp: block.timestamp,
            status: OrderStatus.PENDING
        });

        emit OrderPlaced(orderId, _trader, _ticker, _orderType, _quantity, _price);
        return orderId;
    }

    function cancelOrder(uint256 _orderId) external {
        Order storage o = orders[_orderId];
        require(o.trader == msg.sender, "BlockExDSE: not your order");
        require(o.status == OrderStatus.PENDING, "BlockExDSE: order not cancellable");
        o.status = OrderStatus.CANCELLED;
        emit OrderCancelled(_orderId);
    }

    // ── Delegate: match two pending orders (simplified CDA) ────────────
    // In production this runs off-chain in the edge layer's matching engine;
    // the delegate submits the RESULT here for on-chain finality. That is
    // exactly what keeps the chain lightweight (fewer on-chain operations).
    function recordMatch(
        uint256 _buyOrderId,
        uint256 _sellOrderId,
        uint256 _matchedPrice,
        uint256 _matchedQuantity
    ) external onlyDelegate returns (uint256) {
        Order storage buyOrder = orders[_buyOrderId];
        Order storage sellOrder = orders[_sellOrderId];

        require(buyOrder.status == OrderStatus.PENDING, "BlockExDSE: buy order not pending");
        require(sellOrder.status == OrderStatus.PENDING, "BlockExDSE: sell order not pending");
        require(buyOrder.orderType == OrderType.BUY, "BlockExDSE: not a buy order");
        require(sellOrder.orderType == OrderType.SELL, "BlockExDSE: not a sell order");
        require(keccak256(bytes(buyOrder.ticker)) == keccak256(bytes(sellOrder.ticker)), "BlockExDSE: ticker mismatch");
        require(_matchedQuantity <= buyOrder.quantity && _matchedQuantity <= sellOrder.quantity, "BlockExDSE: quantity exceeds order size");

        buyOrder.status = OrderStatus.MATCHED;
        sellOrder.status = OrderStatus.MATCHED;

        uint256 matchId = nextMatchId++;
        matches[matchId] = MatchRecord({
            id: matchId,
            buyOrderId: _buyOrderId,
            sellOrderId: _sellOrderId,
            matchedPrice: _matchedPrice,
            matchedQuantity: _matchedQuantity,
            timestamp: block.timestamp
        });

        emit OrdersMatched(matchId, _buyOrderId, _sellOrderId, _matchedPrice, _matchedQuantity);
        return matchId;
    }

    // ── Delegate: settle a matched trade (atomic, final) ────────────────
    // _offChainHash is the SHA-256 hash of the full off-chain record (order
    // book snapshot, edge processing log) computed by the storage layer —
    // this is the hash-anchoring pattern from papers [21][32][34].
    function settleTrade(uint256 _matchId, bytes32 _offChainHash) external onlyDelegate returns (uint256) {
        MatchRecord storage m = matches[_matchId];
        require(m.id != 0, "BlockExDSE: match does not exist");

        Order storage buyOrder = orders[m.buyOrderId];
        Order storage sellOrder = orders[m.sellOrderId];

        buyOrder.status = OrderStatus.SETTLED;
        sellOrder.status = OrderStatus.SETTLED;

        uint256 settlementId = nextSettlementId++;
        uint256 totalAmount = m.matchedPrice * m.matchedQuantity;

        settlements[settlementId] = Settlement({
            id: settlementId,
            matchId: _matchId,
            buyer: buyOrder.trader,
            seller: sellOrder.trader,
            ticker: buyOrder.ticker,
            quantity: m.matchedQuantity,
            totalAmount: totalAmount,
            offChainHash: _offChainHash,
            blockTimestamp: block.timestamp
        });

        emit TradeSettled(settlementId, _matchId, buyOrder.trader, sellOrder.trader, _offChainHash);
        return settlementId;
    }

    // ── Read helpers (for frontend / audit queries — Task P) ────────────
    function getOrder(uint256 _orderId) external view returns (Order memory) {
        return orders[_orderId];
    }

    function getSettlement(uint256 _settlementId) external view returns (Settlement memory) {
        return settlements[_settlementId];
    }

    // Verifies an off-chain record against its on-chain anchor (Task P9: Hash Anchor Integrity)
    function verifyOffChainHash(uint256 _settlementId, bytes32 _recomputedHash) external view returns (bool) {
        return settlements[_settlementId].offChainHash == _recomputedHash;
    }
}
