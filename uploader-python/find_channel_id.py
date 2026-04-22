#!/usr/bin/env python3
"""
Find Telegram channel/group chat IDs using getUpdates.

How it works:
1) Bot must be an admin in your channel/group.
2) Send a fresh message in that channel/group.
3) Run this script to print discovered chat IDs.
"""

import json
import os
import sys
import urllib.parse
import urllib.request


def load_env(path=".env"):
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def telegram_get(token, method, params=None):
    params = params or {}
    url = f"https://api.telegram.org/bot{token}/{method}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    load_env()
    token = os.getenv("BOT_TOKEN")
    if not token:
        print("Missing BOT_TOKEN. Put it in uploader-python/.env or export it.")
        sys.exit(1)

    # If webhook is set, getUpdates may not return pending updates.
    webhook_info = telegram_get(token, "getWebhookInfo")
    webhook_url = webhook_info.get("result", {}).get("url")
    if webhook_url:
        print(f"Webhook is set: {webhook_url}")
        print("Temporarily clearing webhook so getUpdates can read updates...")
        telegram_get(token, "deleteWebhook", {"drop_pending_updates": "false"})

    updates = telegram_get(
        token,
        "getUpdates",
        {
            "limit": 100,
            "allowed_updates": json.dumps(["message", "channel_post"]),
        },
    )

    result = updates.get("result", [])
    if not result:
        print("No updates found.")
        print("Send a new message in your channel/group, then run again.")
        sys.exit(0)

    seen = {}
    for upd in result:
        msg = upd.get("channel_post") or upd.get("message") or {}
        chat = msg.get("chat") or {}
        cid = chat.get("id")
        if cid is None:
            continue
        seen[str(cid)] = {
            "chat_id": cid,
            "title": chat.get("title") or chat.get("username") or "N/A",
            "type": chat.get("type") or "unknown",
        }

    if not seen:
        print("Updates received, but no chat ids found.")
        sys.exit(0)

    print("\nDiscovered chat IDs:")
    for _, info in seen.items():
        print(
            f"- chat_id: {info['chat_id']} | type: {info['type']} | title: {info['title']}"
        )

    print(
        "\nUse the correct chat_id as CHAT_ID in backend/.env and uploader-python/.env"
    )


if __name__ == "__main__":
    main()
