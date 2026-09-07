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

    // ── Events (what your React frontend and edge layer listen for) ───────
    event OrderPlaced(uint256 indexed orderId, address indexed trader, string ticker, OrderType orderType, uint256 quantity, uint256 price);
    event OrderCancelled(uint256 indexed orderId);
    event OrdersMatched(uint256 indexed matchId, uint256 buyOrderId, uint256 sellOrderId, uint256 matchedPrice, uint256 matchedQuantity);
    event TradeSettled(uint256 indexed settlementId, uint256 indexed matchId, address buyer, address seller, bytes32 offChainHash);
    event DelegateAdded(address indexed delegate);
    event ParticipantVerified(address indexed participant);

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

    // ── Trader: place an order ─────────────────────────────────────────
    // NOTE: in the full system, this is called by the EDGE LAYER after
    // PBFT-lite validation — not directly by the trader. For the earliest
    // prototype milestone we allow direct calls so the contract can be
    // tested standalone before the edge layer is wired up.
    function placeOrder(
        string calldata _ticker,
        OrderType _orderType,
        uint256 _quantity,
        uint256 _price
    ) external onlyKycVerified returns (uint256) {
        require(_quantity > 0, "BlockExDSE: quantity must be positive");
        require(_price > 0, "BlockExDSE: price must be positive");

        uint256 orderId = nextOrderId++;
        orders[orderId] = Order({
            id: orderId,
            trader: msg.sender,
            ticker: _ticker,
            orderType: _orderType,
            quantity: _quantity,
            price: _price,
            timestamp: block.timestamp,
            status: OrderStatus.PENDING
        });

        emit OrderPlaced(orderId, msg.sender, _ticker, _orderType, _quantity, _price);
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
