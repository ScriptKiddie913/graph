#!/usr/bin/env python3
"""
Separate uploader for Graph Intel.
Reads .csv and .txt files and uploads JSON records to Telegram channel/group.

Output format per record (compatible with backend parser):
{
  "type": "entity",
  "value": "john",
  "links": [{"type":"entity","value":"1234567"}, ...]
}
"""

import csv
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DELAY_SECONDS = 0.08  # ~12.5 msgs/s to stay below limits
MAX_FIELDS_PER_RECORD = 40
MAX_LINKS_PER_NODE = 25
MAX_SEND_RETRIES = 8

NULL_LIKE = {"null", "<blank>", "-----", "none", "n/a", "na", "-"}


def load_env(path=BASE_DIR / ".env"):
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def normalize(value: str):
    if value is None:
        return None
    v = str(value).strip().strip("\"'`")
    if not v:
        return None
    lower_raw = v.lower()
    if lower_raw in NULL_LIKE:
        return None
    if re.fullmatch(r"\+?[\d\s\-().]{7,20}", v):
        digits = re.sub(r"\D", "", v)
        if len(digits) >= 7:
            return digits
    if "@" in v:
        return v.lower()
    v = re.sub(r"\s+", " ", v).strip()
    if len(v) < 2 and not v.isdigit():
        return None
    return v.lower()


def send_message(token: str, chat_id: str, payload: dict):
    text = json.dumps(payload, ensure_ascii=False)
    if len(text) > 4000:
        return False, "oversized"

    endpoint = f"https://api.telegram.org/bot{token}/sendMessage"
    body = urllib.parse.urlencode(
        {
            "chat_id": chat_id,
            "text": text,
            "disable_notification": "true",
        }
    ).encode("utf-8")

    for attempt in range(1, MAX_SEND_RETRIES + 1):
        req = urllib.request.Request(endpoint, data=body, method="POST")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return bool(data.get("ok")), data
        except urllib.error.HTTPError as err:
            raw = ""
            try:
                raw = err.read().decode("utf-8", errors="ignore")
                parsed = json.loads(raw) if raw else {}
            except Exception:
                parsed = {}

            if err.code == 429:
                retry_after = (
                    parsed.get("parameters", {}).get("retry_after")
                    or parsed.get("result", {}).get("retry_after")
                    or 3
                )
                # Add slight jitter to avoid synchronized retry collisions
                sleep_for = float(retry_after) + random.uniform(0.1, 0.9)
                print(f"Rate limited (429). Backing off {sleep_for:.1f}s (attempt {attempt}/{MAX_SEND_RETRIES})")
                time.sleep(sleep_for)
                continue

            if 500 <= err.code < 600 and attempt < MAX_SEND_RETRIES:
                backoff = min(10.0, 0.6 * (2 ** (attempt - 1))) + random.uniform(0.05, 0.4)
                print(f"Telegram server error {err.code}. Retrying in {backoff:.1f}s...")
                time.sleep(backoff)
                continue

            return False, f"HTTP {err.code}: {raw or err.reason}"
        except Exception as err:
            if attempt < MAX_SEND_RETRIES:
                backoff = min(8.0, 0.5 * (2 ** (attempt - 1))) + random.uniform(0.05, 0.35)
                time.sleep(backoff)
                continue
            return False, str(err)

    return False, "max_retries_exceeded"


def records_from_values(values):
    normalized = [normalize(v) for v in values]
    unique = [v for v in dict.fromkeys(normalized) if v][:MAX_FIELDS_PER_RECORD]
    if not unique:
        return []
    out = []
    for val in unique:
        links = [
            {"type": "entity", "value": x}
            for x in unique
            if x != val
        ][:MAX_LINKS_PER_NODE]
        out.append({"type": "entity", "value": val, "links": links})
    return out


def split_tuple_like_row(row: str):
    if not row:
        return []
    parsed = next(
        csv.reader(
            [row],
            delimiter=",",
            quotechar="'",
            skipinitialspace=True,
        ),
        [],
    )
    return [p.strip() for p in parsed]


def split_txt_line(line: str):
    # 1) credential dumps: host:user:password (or longer colon chains)
    # Example: site.com:user@email.com:Password123
    if ":" in line and line.count(":") >= 2 and "," not in line and "\t" not in line:
        parts = [p.strip() for p in line.split(":")]
        # Keep only non-empty parts so malformed "::" doesn't pollute data
        parts = [p for p in parts if p]
        if len(parts) >= 3:
            return parts

    # 2) key: value lines
    if ":" in line and line.count(":") >= 1 and "," not in line and "\t" not in line:
        key, value = line.split(":", 1)
        return [key.strip(), value.strip()]

    # 3) Tab-delimited lines (common in copied report exports)
    if "\t" in line:
        return [p.strip() for p in line.split("\t")]

    # 4) CSV-like txt lines
    if "," in line:
        return [p.strip() for p in next(csv.reader([line]))]

    # 5) Column-style text separated by 2+ spaces
    if re.search(r"\s{2,}", line):
        return [p.strip() for p in re.split(r"\s{2,}", line)]

    return [line]


def is_probable_header(values):
    if not values:
        return False
    joined = " ".join(values).lower()
    if "@" in joined:
        return False
    alpha = sum(1 for v in values if re.search(r"[a-zA-Z]", v))
    numerics = sum(1 for v in values if re.search(r"\d", v))
    return alpha > 0 and numerics == 0


def parse_text_content(content: str):
    """
    One-for-all parsing strategy:
    - Extract SQL tuple rows: (...),(...),...
    - Parse remaining lines as key:value, tabular, csv-like, or 2+ spaces
    """
    records = []
    used_spans = []

    # SQL tuple-like captures
    for match in re.finditer(r"\(([^()]+)\)", content, flags=re.DOTALL):
        inside = match.group(1)
        parts = split_tuple_like_row(inside)
        if len(parts) >= 2:
            records.extend(records_from_values(parts))
            used_spans.append((match.start(), match.end()))

    # Remove tuple spans so they don't get parsed twice as plain lines
    if used_spans:
        chunks = []
        cursor = 0
        for start, end in used_spans:
            if cursor < start:
                chunks.append(content[cursor:start])
            cursor = end
        if cursor < len(content):
            chunks.append(content[cursor:])
        remainder = "\n".join(chunks)
    else:
        remainder = content

    for raw in remainder.splitlines():
        line = raw.strip()
        if not line:
            continue
        parts = split_txt_line(line)
        if is_probable_header(parts):
            continue
        records.extend(records_from_values(parts))

    return records


def parse_csv_file(path: Path):
    content = path.read_text(encoding="utf-8", errors="ignore")
    return parse_text_content(content)


def parse_txt_file(path: Path):
    content = path.read_text(encoding="utf-8", errors="ignore")
    return parse_text_content(content)


def main():
    load_env()
    token = os.getenv("BOT_TOKEN")
    chat_id = os.getenv("CHAT_ID")

    if not token or not chat_id:
        print("Missing BOT_TOKEN or CHAT_ID in uploader-python/.env")
        sys.exit(1)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(
        [p for p in DATA_DIR.iterdir() if p.suffix.lower() in {".csv", ".txt"}]
    )
    if not files:
        print("No .csv or .txt files found in uploader-python/data")
        return

    total_sent = 0
    total_skip = 0
    total_err = 0

    for path in files:
        if path.suffix.lower() == ".csv":
            records = parse_csv_file(path)
        else:
            records = parse_txt_file(path)

        print(f"\nProcessing {path.name}: {len(records)} records")
        for idx, rec in enumerate(records, start=1):
            ok, info = send_message(token, chat_id, rec)
            if ok:
                total_sent += 1
            else:
                if info == "oversized":
                    total_skip += 1
                else:
                    total_err += 1
                    print(f"Send error: {info}")
            time.sleep(DELAY_SECONDS)
            if idx % 500 == 0:
                print(f"Progress {path.name}: {idx}/{len(records)} | sent={total_sent} skip={total_skip} err={total_err}")

    print("\nUpload complete")
    print(f"Sent: {total_sent}")
    print(f"Skipped: {total_skip}")
    print(f"Errors: {total_err}")


if __name__ == "__main__":
    main()
