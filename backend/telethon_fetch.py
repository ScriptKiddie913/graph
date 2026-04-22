#!/usr/bin/env python3
import asyncio
import json
import os
import sys

try:
    from telethon import TelegramClient
    from telethon.sessions import StringSession
except Exception as exc:
    print(
        json.dumps(
            {
                "error": "telethon_not_installed",
                "message": "Install telethon: pip install telethon",
                "detail": str(exc),
            }
        )
    )
    sys.exit(1)


async def main():
    api_id_raw = os.getenv("TG_API_ID", "").strip()
    api_hash = os.getenv("TG_API_HASH", "").strip()
    channel = os.getenv("TG_CHANNEL", "").strip()
    session_name = os.getenv("TG_SESSION", "graph_intel")
    string_session = os.getenv("TG_STRING_SESSION", "").strip()
    limit = int(os.getenv("TG_LIMIT", "50000"))

    if not api_id_raw or not api_hash or not channel:
        print(
            json.dumps(
                {
                    "error": "missing_telethon_env",
                    "message": "Set TG_API_ID, TG_API_HASH, TG_CHANNEL",
                }
            )
        )
        return 1

    api_id = int(api_id_raw)
    out = []

    session = StringSession(string_session) if string_session else session_name
    client = TelegramClient(session, api_id, api_hash)
    await client.connect()
    if not await client.is_user_authorized():
        print(
            json.dumps(
                {
                    "error": "telethon_auth_required",
                    "message": "Set TG_STRING_SESSION (recommended for Render) or pre-auth session file",
                }
            )
        )
        await client.disconnect()
        return 1

    channel_entity = int(channel) if channel.lstrip("-").isdigit() else channel
    try:
        async for msg in client.iter_messages(channel_entity, limit=limit):
            text = msg.message or ""
            if text and text.strip():
                out.append({"id": msg.id, "text": text})
    finally:
        await client.disconnect()

    # keep chronological order for deterministic ingestion
    out.reverse()
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    code = asyncio.run(main())
    raise SystemExit(code)
