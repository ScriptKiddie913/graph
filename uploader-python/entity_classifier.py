"""
entity_classifier.py — Python mirror of the JS entityClassifier for pre-labelling
uploaded records with entity type hints before sending to Telegram.
"""

import re

# Priority-ordered rules. First match wins.
RULES = [
    # Web accounts
    ("facebook",      lambda v: bool(re.search(r"(?:facebook\.com|fb\.com)/[\w.]+", v, re.I))),
    ("instagram",     lambda v: bool(re.search(r"(?:instagram\.com|instagr\.am)/[\w.]+", v, re.I))),
    ("twitter_x",     lambda v: bool(re.search(r"(?:twitter\.com|x\.com)/[\w]+", v, re.I))),
    ("telegram",      lambda v: bool(re.search(r"(?:t\.me|telegram\.me)/[\w]+", v, re.I))),
    ("linkedin",      lambda v: bool(re.search(r"linkedin\.com/in/[\w-]+", v, re.I))),
    ("tiktok",        lambda v: bool(re.search(r"tiktok\.com/@[\w.]+", v, re.I))),
    ("snapchat",      lambda v: bool(re.search(r"snapchat\.com/add/[\w.]+", v, re.I))),
    ("reddit",        lambda v: bool(re.search(r"reddit\.com/u/[\w-]+", v, re.I))),
    ("discord",       lambda v: bool(re.search(r"discord\.gg/[\w]+", v, re.I)) or
                                bool(re.match(r"^[\w]{2,32}#\d{4}$", v))),
    ("spotify",       lambda v: bool(re.search(r"open\.spotify\.com/(?:user|artist|track|album)/[\w]+", v, re.I)) or
                                bool(re.match(r"^spotify:[\w:]+$", v))),
    ("netflix",       lambda v: bool(re.search(r"netflix\.com/[\w/]+", v, re.I))),
    ("twitch",        lambda v: bool(re.search(r"twitch\.tv/[\w]+", v, re.I))),
    ("steam",         lambda v: bool(re.search(r"steamcommunity\.com/(?:id|profiles)/[\w]+", v, re.I)) or
                                bool(re.match(r"^7656\d{13}$", v))),
    ("google_account",lambda v: bool(re.search(r"@gmail\.com$", v, re.I))),
    ("youtube",       lambda v: bool(re.search(r"youtube\.com/(?:channel|c|@)/[\w-]+", v, re.I)) or
                                bool(re.search(r"youtu\.be/[\w-]+", v, re.I))),
    ("google_maps",   lambda v: bool(re.search(r"maps\.google\.com|goo\.gl/maps|maps\.app\.goo\.gl", v, re.I))),
    ("google_drive",  lambda v: bool(re.search(r"drive\.google\.com/[\w/]+", v, re.I))),
    # Crypto
    ("crypto_btc",    lambda v: bool(re.match(r"^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$", v)) or
                                bool(re.match(r"^bc1[a-zA-HJ-NP-Z0-9]{6,87}$", v))),
    ("crypto_eth",    lambda v: bool(re.match(r"^0x[a-fA-F0-9]{40}$", v))),
    ("crypto_other",  lambda v: bool(re.match(r"^T[a-km-zA-HJ-NP-Z1-9]{33}$", v))),
    # Finance
    ("bank_account",  lambda v: bool(re.match(r"^[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7,}", v))),
    ("upi",           lambda v: bool(re.match(r"^[\w.\-]+@[a-zA-Z][a-zA-Z0-9]{1,50}$", v))),
    ("paypal",        lambda v: bool(re.search(r"paypal\.me/[\w]+", v, re.I))),
    # Identity / Contact
    ("email",         lambda v: bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$", v))),
    ("phone",         lambda v: bool(re.match(r"^\+?\d{7,15}$", v))),
    ("ip_address",    lambda v: bool(re.match(r"^(\d{1,3}\.){3}\d{1,3}(/\d{1,2})?$", v))),
    ("device_id",     lambda v: bool(re.match(r"^\d{15,17}$", v)) or
                                bool(re.match(r"^([0-9a-f]{2}[:\-]){5}[0-9a-f]{2}$", v, re.I))),
    ("national_id",   lambda v: bool(re.match(r"^\d{12}$", v)) or
                                bool(re.match(r"^\d{3}-\d{2}-\d{4}$", v)) or
                                bool(re.match(r"^[A-Z]{1}\d{7}$", v))),
    ("coordinates",   lambda v: bool(re.match(r"^-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+$", v))),
    ("postcode",      lambda v: bool(re.match(r"^\d{5}(-\d{4})?$", v)) or
                                bool(re.match(r"^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$", v, re.I)) or
                                bool(re.match(r"^\d{6}$", v))),
    # Web
    ("url",           lambda v: v.startswith("http://") or v.startswith("https://")),
    ("domain",        lambda v: bool(re.match(r"^[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$", v)) and "/" not in v),
    ("username",      lambda v: bool(re.match(r"^@[\w.]+$", v))),
    # Password heuristic (before name/unknown)
    ("password",      lambda v: bool(re.search(r"(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{6,}", v)) or
                                bool(re.match(r"^[a-z]{4,10}\d{2,6}[!@#$%]?$", v, re.I))),
    # Unicode-aware name (2-5 words, no digits/special)
    ("name",          lambda v: _is_name(v)),
    ("unknown",       lambda v: True),
]


def _is_name(v: str) -> bool:
    words = v.split()
    if len(words) < 2 or len(words) > 5:
        return False
    # Must not contain suspicious characters
    if any(c in v for c in "@#:/\\0123456789"):
        return False
    # Unicode-aware: each word should be mostly letters
    for w in words:
        letter_count = sum(1 for c in w if c.isalpha())
        if letter_count < 2:
            return False
    return True


def classify(value: str) -> str:
    """Classify a single value string, returning an entity type string."""
    v = value.strip()
    if not v:
        return "unknown"
    for entity_type, test in RULES:
        try:
            if test(v):
                return entity_type
        except Exception:
            continue
    return "unknown"
