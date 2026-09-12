"""
Risk scorer for the risk-adaptive dual-speed consensus (the project's core
v2 contribution).

Every batch of fills the edge layer proposes to the chain carries a risk
score in [0, 10000] basis points. The chain (BlockExDSE.sol) routes the
batch to the FAST path (single delegate signature + challenge window) below
`riskThresholdBps`, or the FULL path (multi-delegate quorum vote) at or
above it. This module computes that score deterministically and
transparently, from four signals chosen because each corresponds to a
concrete manipulation or exposure risk in a real exchange:

  1. Notional value  — how much money is at stake. A bigger mistake or a
     bigger fraud is worse the larger the trade, so risk scales with size
     relative to a configurable "whale" threshold.
  2. Order-kind risk — MARKET orders accept any price and IOC/FOK orders
     force immediate execution, both of which remove the trader's own
     downstream chance to reconsider; LIMIT orders rest and can be
     cancelled, so they carry the least intrinsic risk.
  3. Participant velocity — many orders from the same participant in a
     short window is the standard proxy for spam, wash trading, or a
     compromised key; a participant who has been quiet is lower risk than
     one currently bursting orders.
  4. Price deviation — an order priced far from the last traded price for
     that ticker is either a fat-finger error or an attempted manipulation
     of the reference price; deviation risk grows with distance from the
     last trade.

The weights are explicit and tunable (not hidden constants) because they
are a reported, defended design choice in the evaluation, not an
implementation detail.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field


BPS_SCALE = 10_000


@dataclass
class RiskWeights:
    notional: float = 0.40
    order_kind: float = 0.20
    velocity: float = 0.20
    price_deviation: float = 0.20

    def normalized(self) -> "RiskWeights":
        total = self.notional + self.order_kind + self.velocity + self.price_deviation
        if total <= 0:
            raise ValueError("risk weights must sum to a positive value")
        return RiskWeights(
            notional=self.notional / total,
            order_kind=self.order_kind / total,
            velocity=self.velocity / total,
            price_deviation=self.price_deviation / total,
        )


ORDER_KIND_RISK = {
    "LIMIT": 0.10,
    "MARKET": 0.80,
    "IOC": 0.55,
    "FOK": 0.65,
}


class RiskScorer:
    """Deterministic, stateful (per-participant velocity only) risk scorer."""

    def __init__(
        self,
        weights: RiskWeights | None = None,
        whale_notional: float = 1_000_000.0,
        velocity_window_seconds: float = 10.0,
        velocity_saturation_count: int = 10,
        deviation_saturation_pct: float = 0.10,
    ) -> None:
        self.weights = (weights or RiskWeights()).normalized()
        self.whale_notional = whale_notional
        self.velocity_window_seconds = velocity_window_seconds
        self.velocity_saturation_count = velocity_saturation_count
        self.deviation_saturation_pct = deviation_saturation_pct

        self._order_times_by_participant: dict[str, deque] = {}
        self._last_trade_price_by_ticker: dict[str, float] = {}

    def record_last_trade_price(self, ticker: str, price: float) -> None:
        self._last_trade_price_by_ticker[ticker] = price

    def _velocity_score(self, trader: str, now: float) -> float:
        history = self._order_times_by_participant.setdefault(trader, deque())
        cutoff = now - self.velocity_window_seconds
        while history and history[0] < cutoff:
            history.popleft()
        history.append(now)
        count = len(history)
        return min(1.0, count / self.velocity_saturation_count)

    def _deviation_score(self, ticker: str, price: float, kind: str) -> float:
        if kind == "MARKET":
            return 0.0  # no limit price to deviate from
        last_price = self._last_trade_price_by_ticker.get(ticker)
        if not last_price or last_price <= 0:
            return 0.0  # no reference yet; do not penalize the first trade
        deviation_pct = abs(price - last_price) / last_price
        return min(1.0, deviation_pct / self.deviation_saturation_pct)

    def score_order(
        self,
        trader: str,
        ticker: str,
        kind: str,
        quantity: float,
        price: float,
        now: float | None = None,
    ) -> float:
        """Returns a risk score in [0.0, 1.0] for a single order."""
        now = now if now is not None else time.time()
        notional = quantity * (price if price else self._last_trade_price_by_ticker.get(ticker, 0.0))
        notional_score = min(1.0, notional / self.whale_notional) if self.whale_notional > 0 else 0.0
        kind_score = ORDER_KIND_RISK.get(kind, 0.5)
        velocity_score = self._velocity_score(trader, now)
        deviation_score = self._deviation_score(ticker, price, kind)

        return (
            self.weights.notional * notional_score
            + self.weights.order_kind * kind_score
            + self.weights.velocity * velocity_score
            + self.weights.price_deviation * deviation_score
        )

    def score_batch_bps(self, order_risk_scores: list[float]) -> int:
        """
        Aggregates per-order risk into one batch score, in basis points, by
        taking the maximum: a conservative choice so that one risky order
        cannot hide inside an otherwise-quiet batch and be fast-tracked.
        """
        if not order_risk_scores:
            return 0
        aggregate = max(order_risk_scores)
        return max(0, min(BPS_SCALE, round(aggregate * BPS_SCALE)))
