"""
Continuous double-auction matching engine for the edge layer.

The v1 prototype's edge node only queued raw orders for a PBFT-lite vote; it
never actually matched anything against a resting order book (matching was
simulated in scripts/deploy-and-test.js by hand-picking two orders and
calling recordMatch directly). This module is the real thing: a per-ticker
limit order book with price-time priority, supporting LIMIT, MARKET, IOC
and FOK orders and partial fills (FR6, FR17).

Design choice: only FILLS are placed on-chain, not every resting order.
A LIMIT order that does not fully match immediately rests in this in-memory
book; nothing about it touches the chain until it is actually filled. This
keeps on-chain write volume proportional to executed trades rather than raw
order traffic, which is the same storage-scoping principle Section 3.4
argues for, just applied one layer earlier.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass, field
from enum import Enum


class Side(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class OrderKind(str, Enum):
    LIMIT = "LIMIT"
    MARKET = "MARKET"
    IOC = "IOC"   # immediate-or-cancel: fill what you can now, cancel the rest
    FOK = "FOK"   # fill-or-kill: fill completely now, or cancel all of it


@dataclass
class RestingOrder:
    order_id: int
    trader: str
    ticker: str
    side: Side
    kind: OrderKind
    price: float          # 0 for MARKET orders
    quantity: float
    remaining: float
    sequence: int          # tie-breaker for price-time priority


@dataclass
class Fill:
    buy_order_id: int
    sell_order_id: int
    buyer: str
    seller: str
    ticker: str
    price: float
    quantity: float


class InsufficientLiquidityError(Exception):
    """Raised when an FOK order cannot be fully filled immediately."""


class OrderBook:
    """Price-time priority limit order book for a single ticker."""

    def __init__(self, ticker: str) -> None:
        self.ticker = ticker
        self.bids: list[RestingOrder] = []  # sorted best-first: highest price, then earliest
        self.asks: list[RestingOrder] = []  # sorted best-first: lowest price, then earliest

    def _resort(self) -> None:
        self.bids.sort(key=lambda o: (-o.price, o.sequence))
        self.asks.sort(key=lambda o: (o.price, o.sequence))

    def best_bid(self) -> float | None:
        return self.bids[0].price if self.bids else None

    def best_ask(self) -> float | None:
        return self.asks[0].price if self.asks else None

    def depth(self, levels: int = 10) -> dict:
        """Aggregated price levels for the live order-book dashboard."""

        def aggregate(orders: list[RestingOrder]) -> list[dict]:
            levels_map: dict[float, float] = {}
            for o in orders:
                levels_map[o.price] = levels_map.get(o.price, 0.0) + o.remaining
            return [{"price": p, "quantity": q} for p, q in list(levels_map.items())]

        bid_levels = aggregate(self.bids)
        ask_levels = aggregate(self.asks)
        bid_levels.sort(key=lambda l: -l["price"])
        ask_levels.sort(key=lambda l: l["price"])
        return {
            "ticker": self.ticker,
            "bids": bid_levels[:levels],
            "asks": ask_levels[:levels],
        }

    def _crosses(self, incoming: RestingOrder, resting: RestingOrder) -> bool:
        if incoming.kind == OrderKind.MARKET:
            return True
        if incoming.side == Side.BUY:
            return incoming.price >= resting.price
        return incoming.price <= resting.price

    def _match_against_book(self, incoming: RestingOrder) -> list[Fill]:
        book = self.asks if incoming.side == Side.BUY else self.bids
        fills: list[Fill] = []

        while incoming.remaining > 0 and book:
            best = book[0]
            if not self._crosses(incoming, best):
                break

            trade_qty = min(incoming.remaining, best.remaining)
            trade_price = best.price  # resting order sets the execution price

            if incoming.side == Side.BUY:
                fills.append(Fill(incoming.order_id, best.order_id, incoming.trader, best.trader, self.ticker, trade_price, trade_qty))
            else:
                fills.append(Fill(best.order_id, incoming.order_id, best.trader, incoming.trader, self.ticker, trade_price, trade_qty))

            incoming.remaining -= trade_qty
            best.remaining -= trade_qty
            if best.remaining <= 0:
                book.pop(0)

        return fills

    def submit(
        self,
        order_id: int,
        trader: str,
        side: Side,
        kind: OrderKind,
        quantity: float,
        price: float,
        sequence: int,
    ) -> tuple[list[Fill], str]:
        """
        Submits an order for immediate matching. Returns (fills, resting_status)
        where resting_status is one of "RESTING" (unfilled remainder now sits
        in the book), "FILLED" (fully matched), or "CANCELLED" (IOC/FOK
        remainder discarded, or FOK could not be filled at all).
        """
        if quantity <= 0:
            raise ValueError("quantity must be positive")
        if kind != OrderKind.MARKET and price <= 0:
            raise ValueError("price must be positive for non-MARKET orders")

        incoming = RestingOrder(order_id, trader, self.ticker, side, kind, price, quantity, quantity, sequence)

        if kind == OrderKind.FOK:
            if not self._can_fill_fully(incoming):
                return [], "CANCELLED"

        fills = self._match_against_book(incoming)

        if incoming.remaining <= 0:
            return fills, "FILLED"

        if kind in (OrderKind.IOC, OrderKind.FOK, OrderKind.MARKET):
            # unfilled remainder is discarded, never rests in the book
            return fills, "CANCELLED" if fills == [] and kind == OrderKind.FOK else "PARTIAL_CANCELLED" if fills else "CANCELLED"

        # LIMIT order with leftover quantity rests in the book
        book = self.bids if side == Side.BUY else self.asks
        book.append(incoming)
        self._resort()
        return fills, "RESTING" if not fills else "PARTIAL_RESTING"

    def _can_fill_fully(self, incoming: RestingOrder) -> bool:
        book = self.asks if incoming.side == Side.BUY else self.bids
        available = 0.0
        for resting in book:
            if not self._crosses(incoming, resting):
                break
            available += resting.remaining
            if available >= incoming.quantity:
                return True
        return available >= incoming.quantity

    def cancel(self, order_id: int) -> bool:
        for book in (self.bids, self.asks):
            for i, o in enumerate(book):
                if o.order_id == order_id:
                    book.pop(i)
                    return True
        return False


class MatchingEngine:
    """Owns one OrderBook per ticker and assigns price-time sequence numbers."""

    def __init__(self) -> None:
        self._books: dict[str, OrderBook] = {}
        self._sequence = itertools.count(1)

    def book_for(self, ticker: str) -> OrderBook:
        if ticker not in self._books:
            self._books[ticker] = OrderBook(ticker)
        return self._books[ticker]

    def submit(self, order_id: int, trader: str, ticker: str, side: Side, kind: OrderKind, quantity: float, price: float):
        book = self.book_for(ticker)
        return book.submit(order_id, trader, side, kind, quantity, price, next(self._sequence))

    def depth(self, ticker: str, levels: int = 10) -> dict:
        return self.book_for(ticker).depth(levels)

    def cancel(self, ticker: str, order_id: int) -> bool:
        return self.book_for(ticker).cancel(order_id)
