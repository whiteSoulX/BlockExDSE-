"""
Hashing, signing and the risk rule. Every function here mirrors contracts/BlockExDSE.sol byte for byte, so that the
investor's browser, the edge validators, the auditor and the contract all compute the same values.

Orders are EIP-712 typed data: Order(address trader,bytes32 ticker,uint256 qty,uint256 price,uint8 side,uint8 otype,
uint256 nonce,uint256 expiry) under the domain (name "BlockExDSE", version "2", chain id, contract address).
"""
import hashlib

from eth_abi import encode
from eth_keys import keys
from eth_utils import keccak, to_checksum_address

DOMAIN_TYPEHASH = keccak(text="EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
ORDER_TYPEHASH = keccak(text="Order(address trader,bytes32 ticker,uint256 qty,uint256 price,uint8 side,uint8 otype,uint256 nonce,uint256 expiry)")
ATTEST_TYPEHASH = keccak(text="Attestation(bytes32 batchRoot)")
CANCEL_TYPEHASH = keccak(text="Cancel(uint256 orderId)")
SIDES = {"BUY": 0, "SELL": 1}
OTYPES = {"LIMIT": 0, "MARKET": 1}
N_VALIDATORS = 4


# ---- demo keys (deterministic so that the demo is reproducible; never use these outside a test chain) ----
def edge_key(i: int) -> str:
    return hashlib.sha256(f"blockexdse-edge-{i}".encode()).hexdigest()


def demo_trader_key(name: str) -> str:
    return hashlib.sha256(f"blockexdse-trader-{name}".encode()).hexdigest()


def compliance_key() -> str:
    return hashlib.sha256(b"blockexdse-compliance").hexdigest()


def address_of(key_hex: str) -> str:
    return keys.PrivateKey(bytes.fromhex(key_hex.removeprefix("0x"))).public_key.to_checksum_address()


# ---- hashing ----
def b32(text: str) -> bytes:
    return text.encode()[:32].ljust(32, b"\0")


def domain_separator(chain_id: int, contract: str) -> bytes:
    return keccak(encode(["bytes32", "bytes32", "bytes32", "uint256", "address"],
                         [DOMAIN_TYPEHASH, keccak(text="BlockExDSE"), keccak(text="2"), int(chain_id), to_checksum_address(contract)]))


def order_tuple(o: dict) -> tuple:
    """The order as the contract's OrderIn struct."""
    return (to_checksum_address(o["trader"]), b32(o["ticker"]), int(o["qty"]), int(o["price"]),
            SIDES[o["side"]], OTYPES[o["otype"]], int(o["nonce"]), int(o["expiry"]))


def order_hash(o: dict) -> bytes:
    return keccak(encode(["bytes32", "address", "bytes32", "uint256", "uint256", "uint8", "uint8", "uint256", "uint256"],
                         [ORDER_TYPEHASH, *order_tuple(o)]))


def digest(domain: bytes, struct_hash: bytes) -> bytes:
    return keccak(b"\x19\x01" + domain + struct_hash)


def order_digest(domain: bytes, o: dict) -> bytes:
    return digest(domain, order_hash(o))


def batch_root(hashes: list) -> bytes:
    return keccak(b"".join(hashes))


def attest_digest(domain: bytes, root: bytes) -> bytes:
    return digest(domain, keccak(encode(["bytes32", "bytes32"], [ATTEST_TYPEHASH, root])))


def cancel_digest(domain: bytes, order_id: int) -> bytes:
    return digest(domain, keccak(encode(["bytes32", "uint256"], [CANCEL_TYPEHASH, int(order_id)])))


# ---- signatures (65 bytes: r, s, v with v = 27 or 28) ----
def sign(key_hex: str, dig: bytes) -> bytes:
    sig = keys.PrivateKey(bytes.fromhex(key_hex.removeprefix("0x"))).sign_msg_hash(dig)
    return sig.r.to_bytes(32, "big") + sig.s.to_bytes(32, "big") + bytes([27 + sig.v])


def recover(dig: bytes, sig) -> str:
    """Address that signed the digest. Raises ValueError on a malformed signature."""
    if isinstance(sig, str):
        sig = bytes.fromhex(sig.removeprefix("0x"))
    if len(sig) != 65:
        raise ValueError("signature must be 65 bytes")
    v = sig[64] - 27 if sig[64] >= 27 else sig[64]
    if v not in (0, 1):
        raise ValueError("bad recovery id")
    try:
        s = keys.Signature(vrs=(v, int.from_bytes(sig[:32], "big"), int.from_bytes(sig[32:64], "big")))
        return s.recover_public_key_from_msg_hash(dig).to_checksum_address()
    except Exception as e:  # eth_keys raises several types
        raise ValueError(f"bad signature: {type(e).__name__}") from None


def hx(b: bytes) -> str:
    return "0x" + bytes(b).hex()


# ---- market rules in integers (same arithmetic as the contract) ----
def in_band(ref: int, band_bps: int, price: int) -> bool:
    return ref * (10000 - band_bps) <= price * 10000 <= ref * (10000 + band_bps)


def band_limits(ref: int, band_bps: int) -> tuple:
    """Lowest and highest whole price inside the band."""
    return max(1, -(-ref * (10000 - band_bps) // 10000)), ref * (10000 + band_bps) // 10000


def protective_price(ref: int, band_bps: int, side: str) -> int:
    lo, hi = band_limits(ref, band_bps)
    return hi if side == "BUY" else lo


def risk(ref: int, band_bps: int, risk_notional: int, qty: int, price: int, otype: str) -> dict:
    """Risk score in basis points. >= 5000 means ESCALATED. Identical to BlockExDSE.riskScore()."""
    market_order = otype == "MARKET"
    notional = int(qty) * (ref if market_order else int(price))
    n_part = min(notional * 10000 // risk_notional, 10000) if risk_notional else 0
    d_part, dev_bps = 0, 0
    if not market_order and band_bps > 0:
        dev_bps = abs(int(price) - ref) * 10000 // ref
        d_part = min(dev_bps * 20000 // band_bps, 10000)
    score = (n_part + d_part) // 2
    return {"score_bps": score, "score": round(score / 10000, 3), "tier": 1 if score >= 5000 else 0,
            "level": "ESCALATED" if score >= 5000 else "STANDARD", "notional": notional,
            "size_part": n_part, "price_part": d_part, "deviation_bps": dev_bps}
