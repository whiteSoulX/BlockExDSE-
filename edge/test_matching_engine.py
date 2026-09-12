"""Run with: py -3 -m pytest edge/test_matching_engine.py -v"""

import pytest

from matching_engine import MatchingEngine, Side, OrderKind, InsufficientLiquidityError


def test_limit_order_rests_when_no_cross():
    engine = MatchingEngine()
    fills, status = engine.submit(1, "alice", "DSEX", Side.BUY, OrderKind.LIMIT, 100, 50)
    assert fills == []
    assert status == "RESTING"
    assert engine.depth("DSEX")["bids"] == [{"price": 50, "quantity": 100}]


def test_limit_orders_cross_and_fill_fully():
    engine = MatchingEngine()
    engine.submit(1, "alice", "DSEX", Side.BUY, OrderKind.LIMIT, 100, 50)
    fills, status = engine.submit(2, "bob", "DSEX", Side.SELL, OrderKind.LIMIT, 100, 50)

    assert status == "FILLED"
    assert len(fills) == 1
    f = fills[0]
    assert f.buyer == "alice" and f.seller == "bob"
    assert f.quantity == 100 and f.price == 50
    assert engine.depth("DSEX") == {"ticker": "DSEX", "bids": [], "asks": []}


def test_partial_fill_leaves_remainder_resting():
    engine = MatchingEngine()
    engine.submit(1, "alice", "DSEX", Side.BUY, OrderKind.LIMIT, 100, 50)
    fills, status = engine.submit(2, "bob", "DSEX", Side.SELL, OrderKind.LIMIT, 40, 50)

    assert status == "FILLED"  # the incoming sell order is fully filled
    assert fills[0].quantity == 40
    depth = engine.depth("DSEX")
    assert depth["bids"] == [{"price": 50, "quantity": 60}]  # 100 - 40 remains resting


def test_price_time_priority_fills_best_price_first():
    engine = MatchingEngine()
    engine.submit(1, "alice", "DSEX", Side.SELL, OrderKind.LIMIT, 50, 52)
    engine.submit(2, "carol", "DSEX", Side.SELL, OrderKind.LIMIT, 50, 51)  # better price, later in time
    fills, _ = engine.submit(3, "bob", "DSEX", Side.BUY, OrderKind.LIMIT, 50, 52)

    assert fills[0].seller == "carol"  # best price (51) served before alice's 52
    assert fills[0].price == 51


def test_time_priority_at_same_price():
    engine = MatchingEngine()
    engine.submit(1, "alice", "DSEX", Side.SELL, OrderKind.LIMIT, 50, 50)
    engine.submit(2, "carol", "DSEX", Side.SELL, OrderKind.LIMIT, 50, 50)
    fills, _ = engine.submit(3, "bob", "DSEX", Side.BUY, OrderKind.LIMIT, 50, 50)

    assert fills[0].seller == "alice"  # first in time at the same price


def test_market_order_takes_best_available_price():
    engine = MatchingEngine()
    engine.submit(1, "alice", "DSEX", Side.SELL, OrderKind.LIMIT, 50, 55)
    fills, status = engine.submit(2, "bob", "DSEX", Side.BUY, OrderKind.MARKET, 50, 0)

    assert status == "FILLED"
    assert fills[0].price == 55


def test_ioc_cancels_unfilled_remainder_instead_of_resting():
    engine = MatchingEngine()
    engine.submit(1, "alice", "DSEX", Side.SELL, OrderKind.LIMIT, 30, 50)
    fills, status = engine.submit(2, "bob", "DSEX", Side.BUY, OrderKind.IOC, 100, 50)

    assert fills[0].quantity == 30
    assert status == "PARTIAL_CANCELLED"
    assert engine.depth("DSEX")["bids"] == []  # remainder never rests


def test_fok_cancels_entirely_when_liquidity_insufficient():
    engine = MatchingEngine()
    engine.submit(1, "alice", "DSEX", Side.SELL, OrderKind.LIMIT, 30, 50)
    fills, status = engine.submit(2, "bob", "DSEX", Side.BUY, OrderKind.FOK, 100, 50)

    assert fills == []
    assert status == "CANCELLED"
    assert engine.depth("DSEX")["asks"] == [{"price": 50, "quantity": 30}]  # untouched


def test_fok_fills_completely_when_liquidity_sufficient():
    engine = MatchingEngine()
    engine.submit(1, "alice", "DSEX", Side.SELL, OrderKind.LIMIT, 60, 50)
    engine.submit(2, "carol", "DSEX", Side.SELL, OrderKind.LIMIT, 60, 51)
    fills, status = engine.submit(3, "bob", "DSEX", Side.BUY, OrderKind.FOK, 100, 51)

    assert status == "FILLED"
    total = sum(f.quantity for f in fills)
    assert total == 100


def test_cancel_removes_resting_order():
    engine = MatchingEngine()
    engine.submit(1, "alice", "DSEX", Side.BUY, OrderKind.LIMIT, 100, 50)
    assert engine.cancel("DSEX", 1) is True
    assert engine.depth("DSEX")["bids"] == []
    assert engine.cancel("DSEX", 1) is False


def test_rejects_non_positive_quantity():
    engine = MatchingEngine()
    with pytest.raises(ValueError):
        engine.submit(1, "alice", "DSEX", Side.BUY, OrderKind.LIMIT, 0, 50)


def test_rejects_non_positive_price_for_limit_order():
    engine = MatchingEngine()
    with pytest.raises(ValueError):
        engine.submit(1, "alice", "DSEX", Side.BUY, OrderKind.LIMIT, 100, 0)
