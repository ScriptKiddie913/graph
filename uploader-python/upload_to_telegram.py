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
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DELAY_SECONDS = 0.08  # ~12.5 msgs/s to stay below limits


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
    v = str(value).strip().strip("\"'")
    if not v:
        return None
    if re.fullmatch(r"\+?[\d\s\-().]{7,20}", v):
        digits = re.sub(r"\D", "", v)
        if len(digits) >= 7:
            return digits
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

    req = urllib.request.Request(endpoint, data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return bool(data.get("ok")), data
    except Exception as err:
        return False, str(err)


def records_from_values(values):
    normalized = [normalize(v) for v in values]
    unique = [v for v in dict.fromkeys(normalized) if v]
    if not unique:
        return []
    out = []
    for val in unique:
        links = [{"type": "entity", "value": x} for x in unique if x != val]
        out.append({"type": "entity", "value": val, "links": links})
    return out


def parse_csv_file(path: Path):
    records = []
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        for i, row in enumerate(reader, start=1):
            if not row:
                continue
            if i == 1:
                joined = ",".join(row)
                if re.fullmatch(r"[A-Za-z0-9_ ,\-]+", joined) and "@" not in joined:
                    continue
            records.extend(records_from_values(row))
    return records


def parse_txt_file(path: Path):
    records = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = [p.strip() for p in line.split(",")]
            records.extend(records_from_values(parts))
    return records


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
        for rec in records:
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

    print("\nUpload complete")
    print(f"Sent: {total_sent}")
    print(f"Skipped: {total_skip}")
    print(f"Errors: {total_err}")


if __name__ == "__main__":
    main()
