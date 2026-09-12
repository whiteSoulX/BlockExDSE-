// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title BlockExDSE
 * @notice Settlement contract for the BlockExDSE hybrid exchange (v2).
 *
 * Design notes for the team:
 * - This contract represents the BLOCKCHAIN LAYER only. It expects to receive
 *   already-validated batches of fills from the edge layer (Tier 1).
 * - "Delegates" here stand in for our DPoS layer (Tier 2).
 *
 * v2 change (the project's core contribution): batch finality is no longer a
 * single fixed protocol. Each batch carries a risk score computed off-chain
 * at the edge (notional value, order-kind risk, participant order velocity,
 * price deviation) and this contract routes it to one of two finality paths:
 *
 *   FAST  — a single proposing delegate finalizes the batch immediately.
 *           Orders referencing it cannot be placed until a fixed challenge
 *           window (in blocks) elapses without any other delegate disputing
 *           the digest. Cheap (one signature, no vote round-trip) but adds
 *           a mandatory wait before the batch is usable.
 *   FULL  — the existing multi-delegate quorum vote. Orders referencing it
 *           can be placed the instant quorum is reached, with no extra wait,
 *           but paying the cost of a full vote round for every delegate.
 *
 * Routing is a threshold on the risk score (riskThresholdBps), so low-risk
 * batches buy latency/energy savings and high-risk batches keep the stronger
 * guarantee. This operationalizes the project's own H2/H4/H5 hypotheses
 * (validator overhead vs. latency, workload-adaptive placement) instead of
 * leaving them as unmeasured aspirations.
 */
contract BlockExDSE {
    // ── Order data (D1) ──────────────────────────────────────────────────
    enum OrderType { BUY, SELL }
    enum OrderKind { LIMIT, MARKET, IOC, FOK }
    enum OrderStatus { PENDING, PARTIALLY_FILLED, MATCHED, SETTLED, CANCELLED }
    enum Tier { FAST, FULL }

    struct Order {
        uint256 id;
        address trader;
        string ticker;
        OrderType orderType;
        OrderKind kind;
        uint256 quantity;   // original quantity requested
        uint256 remaining;  // quantity not yet matched
        uint256 price;      // 0 is valid for MARKET orders
        uint256 timestamp;
        OrderStatus status;
        bytes32 batchId;    // zero for the direct/control path (FR12)
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

    // ── Batch data (D4) — the risk-adaptive consensus tier ─────────────────
    struct Batch {
        bytes32 digest;
        Tier tier;
        address proposer;
        uint16 riskScoreBps;         // 0-10000, informational + routing input
        uint256 voteCount;
        uint256 challengeDeadlineBlock; // meaningful only for FAST batches
        bool finalized;
        bool disputed;
        bool exists;
    }

    // ── State ───────────────────────────────────────────────────────────
    address public admin;
    mapping(address => bool) public delegates;      // Tier 2: DPoS delegate whitelist
    mapping(address => bool) public kycVerified;     // consortium membership
    uint256 public delegateCount;

    uint256 public nextOrderId = 1;
    uint256 public nextMatchId = 1;
    uint256 public nextSettlementId = 1;

    mapping(uint256 => Order) public orders;
    mapping(uint256 => MatchRecord) public matches;
    mapping(uint256 => Settlement) public settlements;
    mapping(bytes32 => Batch) public batches;
    mapping(bytes32 => mapping(address => bool)) public batchVotes;

    // ── Risk-routing configuration (admin-tunable, reported in the paper) ──
    uint16 public riskThresholdBps = 5000;      // >= this routes to FULL
    uint256 public quorumVotes = 2;             // votes required to finalize FULL
    uint256 public challengeWindowBlocks = 3;   // FAST-tier wait, in blocks

    // ── Events ──────────────────────────────────────────────────────────
    event OrderPlaced(uint256 indexed orderId, address indexed trader, string ticker, OrderType orderType, OrderKind kind, uint256 quantity, uint256 price, bytes32 batchId);
    event OrderCancelled(uint256 indexed orderId);
    event OrdersMatched(uint256 indexed matchId, uint256 buyOrderId, uint256 sellOrderId, uint256 matchedPrice, uint256 matchedQuantity);
    event TradeSettled(uint256 indexed settlementId, uint256 indexed matchId, address buyer, address seller, bytes32 offChainHash);
    event DelegateAdded(address indexed delegate);
    event ParticipantVerified(address indexed participant);

    event BatchProposed(bytes32 indexed digest, Tier tier, address indexed proposer, uint16 riskScoreBps);
    event BatchVoted(bytes32 indexed digest, address indexed voter, uint256 voteCount);
    event BatchFinalized(bytes32 indexed digest, Tier tier);
    event BatchChallenged(bytes32 indexed digest, address indexed challenger);

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
        delegateCount = 1;
        kycVerified[msg.sender] = true;
    }

    // ── Admin: consortium membership and risk-routing configuration ───────
    function addDelegate(address _delegate) external onlyAdmin {
        require(!delegates[_delegate], "BlockExDSE: already a delegate");
        delegates[_delegate] = true;
        delegateCount++;
        emit DelegateAdded(_delegate);
    }

    function verifyParticipant(address _participant) external onlyAdmin {
        kycVerified[_participant] = true;
        emit ParticipantVerified(_participant);
    }

    function setRiskThresholdBps(uint16 _bps) external onlyAdmin {
        require(_bps <= 10000, "BlockExDSE: bps out of range");
        riskThresholdBps = _bps;
    }

    function setQuorumVotes(uint256 _votes) external onlyAdmin {
        require(_votes > 0, "BlockExDSE: quorum must be positive");
        quorumVotes = _votes;
    }

    function setChallengeWindowBlocks(uint256 _blocks) external onlyAdmin {
        challengeWindowBlocks = _blocks;
    }

    // ── Tier 2: risk-adaptive batch consensus ──────────────────────────────
    function proposeBatch(bytes32 _digest, uint16 _riskScoreBps) external onlyDelegate {
        require(!batches[_digest].exists, "BlockExDSE: batch already proposed");
        require(_riskScoreBps <= 10000, "BlockExDSE: risk score out of range");

        Tier tier = _riskScoreBps >= riskThresholdBps ? Tier.FULL : Tier.FAST;
        Batch storage b = batches[_digest];
        b.digest = _digest;
        b.tier = tier;
        b.proposer = msg.sender;
        b.riskScoreBps = _riskScoreBps;
        b.exists = true;

        emit BatchProposed(_digest, tier, msg.sender, _riskScoreBps);

        if (tier == Tier.FAST) {
            b.finalized = true;
            b.challengeDeadlineBlock = block.number + challengeWindowBlocks;
            emit BatchFinalized(_digest, tier);
        } else {
            batchVotes[_digest][msg.sender] = true;
            b.voteCount = 1;
            if (b.voteCount >= quorumVotes) {
                b.finalized = true;
                emit BatchFinalized(_digest, tier);
            }
        }
    }

    function voteBatch(bytes32 _digest) external onlyDelegate {
        Batch storage b = batches[_digest];
        require(b.exists, "BlockExDSE: unknown batch");
        require(b.tier == Tier.FULL, "BlockExDSE: FAST batches do not take votes");
        require(!b.finalized, "BlockExDSE: batch already finalized");
        require(!batchVotes[_digest][msg.sender], "BlockExDSE: delegate already voted");

        batchVotes[_digest][msg.sender] = true;
        b.voteCount++;
        emit BatchVoted(_digest, msg.sender, b.voteCount);

        if (b.voteCount >= quorumVotes) {
            b.finalized = true;
            emit BatchFinalized(_digest, b.tier);
        }
    }

    // Any delegate other than the proposer can dispute a FAST batch's digest
    // within the challenge window. The prototype's dispute proof is a
    // declared mismatch (an off-chain recomputation disagrees); it blocks
    // the batch permanently, forcing resubmission through the FULL path.
    // A production system would require the challenger to submit the raw
    // batch data alongside a differing recomputed digest for on-chain proof.
    function challengeBatch(bytes32 _digest) external onlyDelegate {
        Batch storage b = batches[_digest];
        require(b.exists, "BlockExDSE: unknown batch");
        require(b.tier == Tier.FAST, "BlockExDSE: only FAST batches can be challenged");
        require(block.number <= b.challengeDeadlineBlock, "BlockExDSE: challenge window closed");
        require(!b.disputed, "BlockExDSE: already disputed");
        require(msg.sender != b.proposer, "BlockExDSE: proposer cannot challenge its own batch");

        b.disputed = true;
        emit BatchChallenged(_digest, msg.sender);
    }

    function isBatchReady(bytes32 _digest) public view returns (bool) {
        Batch storage b = batches[_digest];
        if (!b.exists || !b.finalized || b.disputed) return false;
        if (b.tier == Tier.FAST) return block.number > b.challengeDeadlineBlock;
        return true;
    }

    function getBatch(bytes32 _digest) external view returns (Batch memory) {
        return batches[_digest];
    }

    // ── Trader (direct/control path — FR12, the blockchain-only baseline) ──
    // No batch, no edge tier. Used only to produce the controlled comparison
    // in Section 3.6.1; the real pipeline uses placeBatchedOrder below.
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
            kind: OrderKind.LIMIT,
            quantity: _quantity,
            remaining: _quantity,
            price: _price,
            timestamp: block.timestamp,
            status: OrderStatus.PENDING,
            batchId: bytes32(0)
        });

        emit OrderPlaced(orderId, msg.sender, _ticker, _orderType, OrderKind.LIMIT, _quantity, _price, bytes32(0));
        return orderId;
    }

    // ── Delegate: place an order on behalf of a trader once its batch has
    // cleared the risk-adaptive consensus tier above (the real pipeline). ──
    function placeBatchedOrder(
        address _trader,
        string calldata _ticker,
        OrderType _orderType,
        OrderKind _kind,
        uint256 _quantity,
        uint256 _price,
        bytes32 _batchId
    ) external onlyDelegate returns (uint256) {
        require(kycVerified[_trader], "BlockExDSE: participant not KYC verified");
        require(_quantity > 0, "BlockExDSE: quantity must be positive");
        require(_kind == OrderKind.MARKET || _price > 0, "BlockExDSE: price must be positive");
        require(isBatchReady(_batchId), "BlockExDSE: batch not finalized or still in challenge window");

        uint256 orderId = nextOrderId++;
        orders[orderId] = Order({
            id: orderId,
            trader: _trader,
            ticker: _ticker,
            orderType: _orderType,
            kind: _kind,
            quantity: _quantity,
            remaining: _quantity,
            price: _price,
            timestamp: block.timestamp,
            status: OrderStatus.PENDING,
            batchId: _batchId
        });

        emit OrderPlaced(orderId, _trader, _ticker, _orderType, _kind, _quantity, _price, _batchId);
        return orderId;
    }

    function cancelOrder(uint256 _orderId) external {
        Order storage o = orders[_orderId];
        require(o.trader == msg.sender, "BlockExDSE: not your order");
        require(
            o.status == OrderStatus.PENDING || o.status == OrderStatus.PARTIALLY_FILLED,
            "BlockExDSE: order not cancellable"
        );
        o.status = OrderStatus.CANCELLED;
        emit OrderCancelled(_orderId);
    }

    // ── Delegate: record a (possibly partial) match between two orders ─────
    // In production this runs off-chain in the edge layer's matching engine;
    // the delegate submits the RESULT here for on-chain finality. Supports
    // partial fills: an order can be matched across several calls until its
    // remaining quantity reaches zero (FR17).
    function recordMatch(
        uint256 _buyOrderId,
        uint256 _sellOrderId,
        uint256 _matchedPrice,
        uint256 _matchedQuantity
    ) external onlyDelegate returns (uint256) {
        Order storage buyOrder = orders[_buyOrderId];
        Order storage sellOrder = orders[_sellOrderId];

        require(
            buyOrder.status == OrderStatus.PENDING || buyOrder.status == OrderStatus.PARTIALLY_FILLED,
            "BlockExDSE: buy order not active"
        );
        require(
            sellOrder.status == OrderStatus.PENDING || sellOrder.status == OrderStatus.PARTIALLY_FILLED,
            "BlockExDSE: sell order not active"
        );
        require(buyOrder.orderType == OrderType.BUY, "BlockExDSE: not a buy order");
        require(sellOrder.orderType == OrderType.SELL, "BlockExDSE: not a sell order");
        require(keccak256(bytes(buyOrder.ticker)) == keccak256(bytes(sellOrder.ticker)), "BlockExDSE: ticker mismatch");
        require(_matchedQuantity > 0, "BlockExDSE: matched quantity must be positive");
        require(_matchedQuantity <= buyOrder.remaining && _matchedQuantity <= sellOrder.remaining, "BlockExDSE: quantity exceeds remaining");

        buyOrder.remaining -= _matchedQuantity;
        sellOrder.remaining -= _matchedQuantity;
        buyOrder.status = buyOrder.remaining == 0 ? OrderStatus.MATCHED : OrderStatus.PARTIALLY_FILLED;
        sellOrder.status = sellOrder.remaining == 0 ? OrderStatus.MATCHED : OrderStatus.PARTIALLY_FILLED;

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
    // book snapshot, edge processing log) computed by the storage layer.
    function settleTrade(uint256 _matchId, bytes32 _offChainHash) external onlyDelegate returns (uint256) {
        MatchRecord storage m = matches[_matchId];
        require(m.id != 0, "BlockExDSE: match does not exist");

        Order storage buyOrder = orders[m.buyOrderId];
        Order storage sellOrder = orders[m.sellOrderId];

        if (buyOrder.status == OrderStatus.MATCHED) buyOrder.status = OrderStatus.SETTLED;
        if (sellOrder.status == OrderStatus.MATCHED) sellOrder.status = OrderStatus.SETTLED;

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

    // ── Read helpers (for frontend / audit queries) ────────────────────
    function getOrder(uint256 _orderId) external view returns (Order memory) {
        return orders[_orderId];
    }

    function getSettlement(uint256 _settlementId) external view returns (Settlement memory) {
        return settlements[_settlementId];
    }

    // Verifies an off-chain record against its on-chain anchor.
    function verifyOffChainHash(uint256 _settlementId, bytes32 _recomputedHash) external view returns (bool) {
        return settlements[_settlementId].offChainHash == _recomputedHash;
    }
}
