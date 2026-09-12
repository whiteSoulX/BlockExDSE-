"""Run with: py -3 -m pytest edge/test_risk_scorer.py -v"""

from risk_scorer import RiskScorer, RiskWeights, BPS_SCALE


def test_small_limit_order_scores_low():
    scorer = RiskScorer(whale_notional=1_000_000)
    score = scorer.score_order("alice", "DSEX", "LIMIT", quantity=10, price=50, now=0.0)
    assert score < 0.15


def test_large_market_order_scores_high():
    scorer = RiskScorer(whale_notional=1_000_000)
    score = scorer.score_order("alice", "DSEX", "MARKET", quantity=20000, price=50, now=0.0)
    assert score > 0.5


def test_notional_scales_with_trade_value():
    scorer = RiskScorer(whale_notional=1_000_000)
    small = scorer.score_order("alice", "DSEX", "LIMIT", quantity=10, price=50, now=0.0)
    scorer2 = RiskScorer(whale_notional=1_000_000)
    large = scorer2.score_order("bob", "DSEX", "LIMIT", quantity=10000, price=50, now=0.0)
    assert large > small


def test_order_kind_risk_ordering():
    scorer = RiskScorer(whale_notional=1_000_000)
    limit_score = scorer.score_order("a", "DSEX", "LIMIT", 100, 50, now=0.0)
    scorer2 = RiskScorer(whale_notional=1_000_000)
    market_score = scorer2.score_order("b", "DSEX", "MARKET", 100, 50, now=0.0)
    assert market_score > limit_score


def test_velocity_increases_score_for_bursty_participant():
    scorer = RiskScorer(whale_notional=1_000_000, velocity_window_seconds=10, velocity_saturation_count=5)
    first = scorer.score_order("alice", "DSEX", "LIMIT", 10, 50, now=0.0)
    for t in range(1, 6):
        last = scorer.score_order("alice", "DSEX", "LIMIT", 10, 50, now=float(t))
    assert last > first


def test_velocity_resets_outside_the_window():
    scorer = RiskScorer(whale_notional=1_000_000, velocity_window_seconds=10, velocity_saturation_count=5)
    for t in range(5):
        scorer.score_order("alice", "DSEX", "LIMIT", 10, 50, now=float(t))
    after_gap = scorer.score_order("alice", "DSEX", "LIMIT", 10, 50, now=1000.0)
    fresh = RiskScorer(whale_notional=1_000_000, velocity_window_seconds=10, velocity_saturation_count=5)
    fresh_score = fresh.score_order("bob", "DSEX", "LIMIT", 10, 50, now=0.0)
    assert abs(after_gap - fresh_score) < 1e-9


def test_price_deviation_increases_score():
    scorer = RiskScorer(whale_notional=1_000_000, deviation_saturation_pct=0.10)
    scorer.record_last_trade_price("DSEX", 100.0)
    near = scorer.score_order("alice", "DSEX", "LIMIT", 10, 101, now=0.0)
    scorer2 = RiskScorer(whale_notional=1_000_000, deviation_saturation_pct=0.10)
    scorer2.record_last_trade_price("DSEX", 100.0)
    far = scorer2.score_order("bob", "DSEX", "LIMIT", 10, 130, now=0.0)
    assert far > near


def test_first_trade_on_a_ticker_has_no_deviation_penalty():
    scorer = RiskScorer(whale_notional=1_000_000)
    score = scorer.score_order("alice", "DSEX", "LIMIT", 10, 999999, now=0.0)
    assert score < 0.5  # no reference price yet, so deviation term contributes 0


def test_score_batch_bps_takes_the_max_conservatively():
    scorer = RiskScorer()
    bps = scorer.score_batch_bps([0.1, 0.9, 0.3])
    assert bps == 9000


def test_score_batch_bps_empty_batch_is_zero():
    scorer = RiskScorer()
    assert scorer.score_batch_bps([]) == 0


def test_weights_normalize_to_one():
    weights = RiskWeights(notional=2, order_kind=2, velocity=2, price_deviation=2).normalized()
    total = weights.notional + weights.order_kind + weights.velocity + weights.price_deviation
    assert abs(total - 1.0) < 1e-9
