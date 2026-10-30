// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BlockExDSE - permissioned settlement contract (prototype)
/// @notice Edge nodes (whitelisted) place orders on behalf of KYC-verified traders after
///         PBFT-lite consensus; the contract matches, settles and anchors off-chain hashes.
contract BlockExDSE {
    enum Side { Buy, Sell }
    enum Status { Open, Partial, Filled }

    struct Order {
        uint256 id;
        address trader;
        bytes32 ticker;
        uint256 qty;
        uint256 remaining;
        uint256 price;
        Side side;
        Status status;
        bytes32 batchHash;
        uint64 ts;
    }

    struct Trade {
        uint256 id;
        uint256 buyId;
        uint256 sellId;
        uint256 qty;
        uint256 price;
        bytes32 recordHash;
        uint64 ts;
    }

    address public admin;
    uint256 public orderCount;
    uint256 public tradeCount;

    mapping(address => bool) public kyc;
    mapping(address => bool) public edgeNode;
    mapping(address => uint256) public cash;
    mapping(address => mapping(bytes32 => uint256)) public holdings;
    mapping(uint256 => Order) private orders;
    mapping(uint256 => Trade) private trades;

    event OrderPlaced(uint256 indexed id, address indexed trader, bytes32 ticker, uint256 qty, uint256 price, Side side, bytes32 batchHash, uint8 votes, uint8 required);
    event TradeSettled(uint256 indexed id, uint256 indexed buyId, uint256 indexed sellId, uint256 qty, uint256 price);
    event HashAnchored(uint256 indexed tradeId, bytes32 recordHash);

    modifier onlyAdmin() { require(msg.sender == admin, "not admin"); _; }
    modifier onlyEdge() { require(edgeNode[msg.sender], "not whitelisted edge"); _; }

    constructor() {
        admin = msg.sender;
        edgeNode[msg.sender] = true;
    }

    // ---------- admin / onboarding (simulated KYC) ----------
    function setEdgeNode(address a, bool ok) external onlyAdmin { edgeNode[a] = ok; }

    function registerTrader(address t, uint256 startCash) external onlyAdmin {
        kyc[t] = true;
        cash[t] = startCash;
    }

    function creditShares(address t, bytes32 ticker, uint256 qty) external onlyAdmin {
        require(kyc[t], "no kyc");
        holdings[t][ticker] += qty;
    }

    // ---------- order flow ----------
    function placeOrder(
        address trader, bytes32 ticker, uint256 qty, uint256 price, Side side,
        bytes32 batchHash, uint8 votes, uint8 required
    ) external onlyEdge returns (uint256 id) {
        require(kyc[trader], "trader not KYC verified");
        require(qty > 0 && price > 0, "bad qty/price");
        require(votes >= required, "quorum not reached");
        if (side == Side.Sell) require(holdings[trader][ticker] >= qty, "insufficient shares");
        if (side == Side.Buy) require(cash[trader] >= qty * price, "insufficient cash");

        id = ++orderCount;
        orders[id] = Order(id, trader, ticker, qty, qty, price, side, Status.Open, batchHash, uint64(block.timestamp));
        emit OrderPlaced(id, trader, ticker, qty, price, side, batchHash, votes, required);
    }

    function matchOrders(uint256 buyId, uint256 sellId) external onlyEdge returns (uint256 tid, uint256 qty, uint256 price) {
        Order storage b = orders[buyId];
        Order storage s = orders[sellId];
        require(b.id != 0 && s.id != 0, "unknown order");
        require(b.side == Side.Buy && s.side == Side.Sell, "wrong sides");
        require(b.ticker == s.ticker, "ticker mismatch");
        require(b.remaining > 0 && s.remaining > 0, "nothing to match");
        require(b.price >= s.price, "prices do not cross");
        require(b.trader != s.trader, "self trade");

        qty = b.remaining < s.remaining ? b.remaining : s.remaining;
        price = buyId < sellId ? b.price : s.price; // resting (earlier) order sets the price
        uint256 notional = qty * price;
        require(cash[b.trader] >= notional, "buyer cash");
        require(holdings[s.trader][s.ticker] >= qty, "seller shares");

        cash[b.trader] -= notional;
        cash[s.trader] += notional;
        holdings[s.trader][s.ticker] -= qty;
        holdings[b.trader][s.ticker] += qty;

        b.remaining -= qty;
        s.remaining -= qty;
        b.status = b.remaining == 0 ? Status.Filled : Status.Partial;
        s.status = s.remaining == 0 ? Status.Filled : Status.Partial;

        tid = ++tradeCount;
        trades[tid] = Trade(tid, buyId, sellId, qty, price, bytes32(0), uint64(block.timestamp));
        emit TradeSettled(tid, buyId, sellId, qty, price);
    }

    /// @notice Anchor the SHA-256 of the off-chain settlement record
    function anchorHash(uint256 tradeId, bytes32 recordHash) external onlyEdge {
        require(trades[tradeId].id != 0, "unknown trade");
        require(trades[tradeId].recordHash == bytes32(0), "already anchored");
        trades[tradeId].recordHash = recordHash;
        emit HashAnchored(tradeId, recordHash);
    }

    // ---------- views ----------
    function getOrder(uint256 id) external view returns (Order memory) { return orders[id]; }
    function getTrade(uint256 id) external view returns (Trade memory) { return trades[id]; }
}
