// Browser signing module for BlockExDSE v2. Source of dashboard/vendor/sign.js.
//
// Rebuild (only needed if you change this file):
//   npm install --no-save esbuild @noble/curves@1.8.2 @noble/hashes@1.7.2
//   npx esbuild tools/sign_src.js --bundle --format=iife --global-name=BXSign --minify --outfile=dashboard/vendor/sign.js
//
// Every function mirrors contracts/BlockExDSE.sol and edge/signing.py, so the browser, the edge validators and the
// contract compute the same EIP-712 digests. The private key stays inside the page that calls sign().
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";

const te = new TextEncoder();
const hex = b => "0x" + Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
const bytes = h => {
  h = String(h).replace(/^0x/, "");
  if (h.length % 2 || /[^0-9a-fA-F]/.test(h)) throw new Error("not a hex string");
  const o = new Uint8Array(h.length / 2);
  for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(2 * i, 2), 16);
  return o;
};
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const k = (...a) => keccak_256(cat(...a));
const word = v => {                       // a 256-bit unsigned integer as 32 bytes, big-endian (ABI word)
  let n = BigInt(v);
  if (n < 0n || n >= (1n << 256n)) throw new Error("number out of range");
  const o = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) { o[i] = Number(n & 255n); n >>= 8n; }
  return o;
};
const addrWord = a => { const b = bytes(a); if (b.length !== 20) throw new Error("bad address"); const o = new Uint8Array(32); o.set(b, 12); return o; };
const b32 = s => { const o = new Uint8Array(32); o.set(te.encode(String(s)).slice(0, 32)); return o; };

const DOMAIN_TYPEHASH = k(te.encode("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));
const ORDER_TYPEHASH = k(te.encode("Order(address trader,bytes32 ticker,uint256 qty,uint256 price,uint8 side,uint8 otype,uint256 nonce,uint256 expiry)"));
const CANCEL_TYPEHASH = k(te.encode("Cancel(uint256 orderId)"));
const SIDES = { BUY: 0, SELL: 1 }, OTYPES = { LIMIT: 0, MARKET: 1 };

function checksum(addr20) {               // EIP-55 mixed-case address
  const h = Array.from(addr20, x => x.toString(16).padStart(2, "0")).join(""), d = keccak_256(te.encode(h));
  let out = "0x";
  for (let i = 0; i < 40; i++) out += ((d[i >> 1] >> (i % 2 ? 0 : 4)) & 15) >= 8 ? h[i].toUpperCase() : h[i];
  return out;
}
function validKey(key) {
  try { return /^(0x)?[0-9a-fA-F]{64}$/.test(String(key)) && secp256k1.utils.isValidPrivateKey(bytes(key)); } catch (e) { return false; }
}
function newKey() { return hex(secp256k1.utils.randomPrivateKey()); }
function addressOf(key) { return checksum(keccak_256(secp256k1.getPublicKey(bytes(key), false).slice(1)).slice(12)); }
function domainSeparator(chainId, contract) {
  return hex(k(DOMAIN_TYPEHASH, k(te.encode("BlockExDSE")), k(te.encode("2")), word(chainId), addrWord(contract)));
}
function orderHash(o) {
  if (!(o.side in SIDES) || !(o.otype in OTYPES)) throw new Error("bad side or order type");
  return hex(k(ORDER_TYPEHASH, addrWord(o.trader), b32(o.ticker), word(o.qty), word(o.price), word(SIDES[o.side]), word(OTYPES[o.otype]), word(o.nonce), word(o.expiry)));
}
function digest(domain, structHash) { return hex(k(new Uint8Array([0x19, 0x01]), bytes(domain), bytes(structHash))); }
function orderDigest(domain, o) { return digest(domain, orderHash(o)); }
function cancelDigest(domain, orderId) { return digest(domain, hex(k(CANCEL_TYPEHASH, word(orderId)))); }
function sign(key, dig) {                 // 65 bytes: r, s, v with v = 27 or 28 (low s, as the contract requires)
  const s = secp256k1.sign(bytes(dig), bytes(key), { lowS: true });
  return hex(cat(s.toCompactRawBytes(), new Uint8Array([27 + s.recovery])));
}
function recover(dig, sig) {
  const b = bytes(sig);
  if (b.length !== 65) throw new Error("signature must be 65 bytes");
  const v = b[64] >= 27 ? b[64] - 27 : b[64];
  const pub = secp256k1.Signature.fromCompact(b.slice(0, 64)).addRecoveryBit(v).recoverPublicKey(bytes(dig)).toRawBytes(false);
  return checksum(keccak_256(pub.slice(1)).slice(12));
}
function randomNonce() {                  // 61 random bits as a decimal string (too large for a JavaScript number)
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  b[0] &= 0x1f;
  let n = 0n;
  for (const x of b) n = (n << 8n) | BigInt(x);
  return n.toString();
}

export { addressOf, cancelDigest, domainSeparator, newKey, orderDigest, orderHash, randomNonce, recover, sign, validKey };
