"""
Off-chain persistence (D1/D2/D5/D6) for the edge layer.

Backed by MongoDB when reachable (set MONGO_URL, e.g.
mongodb://127.0.0.1:27017 for a local mongod, or a MongoDB Atlas connection
string for a cloud deployment). If no MongoDB is reachable, every function
here becomes a silent no-op so the rest of the edge node keeps working
in-memory-only, same as before this module existed — a fresh clone with no
MongoDB installed should still run via ./start.sh without errors.
"""

import os
import logging

logger = logging.getLogger("blockexdse.storage")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://127.0.0.1:27017")
DB_NAME = os.environ.get("MONGO_DB_NAME", "blockexdse")

_db = None
_warned = False


def get_db():
    global _db, _warned
    if _db is not None:
        return _db
    try:
        from pymongo import MongoClient

        client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=500)
        client.admin.command("ping")
        _db = client[DB_NAME]
        logger.info("Connected to MongoDB at %s", MONGO_URL)
    except Exception:
        if not _warned:
            logger.warning(
                "MongoDB not reachable at %s — off-chain records (D1/D2/D5/D6) "
                "will not be persisted this run. Set MONGO_URL to enable it.",
                MONGO_URL,
            )
            _warned = True
        _db = False
    return _db


def record_order(edge_id: str, order: dict):
    """D1 — the trade order submission, as validated by this edge node."""
    db = get_db()
    if not db:
        return
    doc = {**order, "_id": f"{edge_id}-{order['id']}", "edge_id": edge_id}
    db.orders.replace_one({"_id": doc["_id"]}, doc, upsert=True)


def record_batch(edge_id: str, batch_doc: dict):
    """D5 — the PBFT-lite batch decision (votes/signatures, approval)."""
    db = get_db()
    if not db:
        return
    db.batches.insert_one({**batch_doc, "edge_id": edge_id})


def record_settlement(record: dict):
    """D2/D6 — the full off-chain match/settlement record whose SHA-256 is
    the hash anchored on-chain via settleTrade()."""
    db = get_db()
    if not db:
        return
    db.settlements.insert_one(dict(record))
