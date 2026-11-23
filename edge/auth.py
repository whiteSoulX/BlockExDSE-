"""
Simulated onboarding, authentication and roles for the BlockExDSE prototype.

NOT a real identity system: the OTP is shown on screen, the NID check is a format check only,
users live in memory and are reset whenever the system restarts. It only demonstrates the flow:
sign up -> contact OTP -> identity (hash only) -> broker approval -> on-chain KYC registration.
Standard library only (no extra packages to install).
"""
import hashlib
import hmac
import re
import secrets
import threading
import time

SESSION_TTL = 2 * 60 * 60        # 2 hours
OTP_TTL = 300                    # 5 minutes
OTP_MAX_ATTEMPTS = 5
LOGIN_MAX_FAILS = 5
LOGIN_LOCK_SECONDS = 60

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MOBILE_RE = re.compile(r"^(\+?88)?01[3-9]\d{8}$")        # Bangladesh mobile format
NID_RE = re.compile(r"^(\d{10}|\d{13}|\d{17})$")          # NID lengths: 10, 13 or 17 digits (format check only)


class AuthError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def _hash_pw(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    try:
        digest = hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
        kind = "scrypt"
    except (AttributeError, ValueError):                  # Python built without scrypt
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000, 32)
        kind = "pbkdf2"
    return f"{kind}${salt.hex()}${digest.hex()}"


def _check_pw(password, stored):
    kind, salt_hex, digest_hex = stored.split("$")
    salt = bytes.fromhex(salt_hex)
    if kind == "scrypt":
        digest = hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
    else:
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000, 32)
    return hmac.compare_digest(digest.hex(), digest_hex)


def _sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


class AuthStore:
    def __init__(self):
        self.lock = threading.RLock()
        self.users = {}           # id -> user dict
        self.by_email = {}
        self.sessions = {}        # token -> (uid, expires)
        self.fails = {}           # email -> [count, locked_until]
        self.seq = 0

    # ---------- helpers ----------
    def _new(self, name, email, mobile, password, role, status):
        self.seq += 1
        uid = f"U{self.seq:04d}"
        u = {"id": uid, "name": name, "email": email.lower(), "mobile": mobile, "role": role, "status": status,
             "pw": _hash_pw(password), "otp": None, "otp_attempts": 0, "otp_sends": 0, "nid_last4": None,
             "nid_hash": None, "photo_hash": None, "wallet": None, "reg_tx": None, "created": int(time.time() * 1000),
             "decided_by": None, "reject_reason": None}
        self.users[uid] = u
        self.by_email[u["email"]] = uid
        return u

    def _issue_otp(self, u):
        code = f"{secrets.randbelow(10 ** 6):06d}"
        u["otp"] = {"hash": _sha(u["id"] + code), "exp": time.time() + OTP_TTL}
        u["otp_attempts"] = 0
        u["otp_sends"] += 1
        return code

    @staticmethod
    def public(u):
        keys = ("id", "name", "email", "mobile", "role", "status", "nid_last4", "wallet", "reg_tx", "reject_reason", "created")
        return {k: u[k] for k in keys}

    # ---------- seeding ----------
    def seed(self, accounts):
        """accounts: list of (name, email, password, role, wallet or None)"""
        with self.lock:
            for name, email, password, role, wallet in accounts:
                u = self._new(name, email, "01700000000", password, role, "active")
                u["wallet"] = wallet

    # ---------- onboarding ----------
    def signup(self, name, email, mobile, password):
        name, email, mobile = (name or "").strip(), (email or "").strip().lower(), (mobile or "").strip().replace(" ", "")
        if not 2 <= len(name) <= 60:
            raise AuthError("Enter your full name (2 to 60 characters).")
        if not EMAIL_RE.match(email):
            raise AuthError("Enter a valid email address.")
        if not MOBILE_RE.match(mobile):
            raise AuthError("Enter a valid Bangladeshi mobile number, for example 01712345678.")
        if len(password or "") < 8 or not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
            raise AuthError("Password must be at least 8 characters and include a letter and a number.")
        with self.lock:
            if email in self.by_email:
                raise AuthError("An account with this email already exists. Try signing in.", 409)
            u = self._new(name, email, mobile, password, "trader", "otp_pending")
            code = self._issue_otp(u)
            return u, code, self._session(u)

    def verify_otp(self, u, code):
        with self.lock:
            if u["status"] != "otp_pending":
                raise AuthError("Contact verification is already complete.")
            o = u["otp"]
            if not o or time.time() > o["exp"]:
                raise AuthError("This code has expired. Request a new one.")
            if u["otp_attempts"] >= OTP_MAX_ATTEMPTS:
                raise AuthError("Too many wrong attempts. Request a new code.", 429)
            u["otp_attempts"] += 1
            if not hmac.compare_digest(_sha(u["id"] + str(code or "").strip()), o["hash"]):
                left = OTP_MAX_ATTEMPTS - u["otp_attempts"]
                raise AuthError(f"Wrong code. {left} attempt(s) left.")
            u["status"], u["otp"] = "kyc_pending", None

    def resend_otp(self, u):
        with self.lock:
            if u["status"] != "otp_pending":
                raise AuthError("Contact verification is already complete.")
            if u["otp_sends"] >= 5:
                raise AuthError("Too many codes requested. Try again later.", 429)
            return self._issue_otp(u)

    def submit_kyc(self, u, nid, photo_hash):
        nid = (nid or "").strip().replace(" ", "")
        if not NID_RE.match(nid):
            raise AuthError("National ID must be 10, 13 or 17 digits.")
        with self.lock:
            if u["status"] not in ("kyc_pending", "rejected"):
                raise AuthError("Identity details cannot be submitted at this stage.")
            h = _sha("nid:" + nid)
            if any(o["nid_hash"] == h and o["id"] != u["id"] for o in self.users.values()):
                raise AuthError("This national ID is already linked to another account.", 409)
            u["nid_hash"], u["nid_last4"] = h, nid[-4:]          # the raw number is never stored
            u["photo_hash"] = (photo_hash or "")[:64] or None     # only a hash of the photo, computed in the browser
            u["status"], u["reject_reason"] = "approval_pending", None

    def decide(self, u, approve, staff, wallet=None, tx=None, reason=None):
        with self.lock:
            if u["status"] != "approval_pending":
                raise AuthError("This request is not waiting for a decision.", 409)
            u["decided_by"] = staff["name"]
            if approve:
                u["status"], u["wallet"], u["reg_tx"] = "active", wallet, tx
            else:
                u["status"], u["reject_reason"] = "rejected", (reason or "Identity details could not be verified.")[:200]

    # ---------- sessions ----------
    def _session(self, u):
        token = secrets.token_urlsafe(32)
        self.sessions[token] = (u["id"], time.time() + SESSION_TTL)
        return token

    def login(self, email, password):
        email = (email or "").strip().lower()
        with self.lock:
            count, locked = self.fails.get(email, [0, 0])
            if time.time() < locked:
                raise AuthError(f"Too many failed attempts. Try again in {int(locked - time.time()) + 1} seconds.", 429)
            uid = self.by_email.get(email)
            if not uid or not _check_pw(password or "", self.users[uid]["pw"]):
                count += 1
                self.fails[email] = [0, time.time() + LOGIN_LOCK_SECONDS] if count >= LOGIN_MAX_FAILS else [count, 0]
                raise AuthError("Incorrect email or password.", 401)
            self.fails.pop(email, None)
            u = self.users[uid]
            return u, self._session(u)

    def user_for(self, token):
        with self.lock:
            s = self.sessions.get(token or "")
            if not s:
                return None
            uid, exp = s
            if time.time() > exp:
                self.sessions.pop(token, None)
                return None
            return self.users[uid]

    def logout(self, token):
        with self.lock:
            self.sessions.pop(token or "", None)

    # ---------- queries ----------
    def pending(self):
        with self.lock:
            return [self.public(u) | {"nid_last4": u["nid_last4"], "has_photo": bool(u["photo_hash"])}
                    for u in self.users.values() if u["status"] == "approval_pending"]

    def decided(self):
        with self.lock:
            return [self.public(u) | {"decided_by": u["decided_by"]} for u in self.users.values()
                    if u["role"] == "trader" and u["decided_by"]]

    def wallet_users(self):
        with self.lock:
            return [u for u in self.users.values() if u["wallet"]]

    def name_of_wallet(self, wallet):
        with self.lock:
            for u in self.users.values():
                if u["wallet"] and u["wallet"].lower() == wallet.lower():
                    return u["name"]
        return None
