#!/usr/bin/env python3
"""
telethon_fetch.py — fetch all messages from a Telegram channel/group.

TG_CHANNEL accepts:
  -1003799313385   (supergroup / channel numeric ID — RECOMMENDED)
  3799313385       (channel ID without -100 prefix)
  @mychannel       (public username)
  mychannel        (public username without @)
"""
import asyncio
import json
import os
import sys

try:
    from telethon import TelegramClient
    from telethon.errors import (
        ChannelInvalidError,
        ChannelPrivateError,
        FloodWaitError,
        UsernameInvalidError,
        UsernameNotOccupiedError,
    )
    from telethon.sessions import StringSession
    from telethon.tl.types import PeerChannel
except Exception as exc:
    print(json.dumps({
        "error": "telethon_not_installed",
        "message": "Install telethon: pip install telethon",
        "detail": str(exc),
    }))
    sys.exit(1)


def parse_channel_spec(raw: str):
    """
    Convert a TG_CHANNEL string into the right Telethon entity specifier.

    Telegram supergroup/channel IDs returned by the Bot API look like:
        -1003799313385
    which encodes as  -100 + <channel_id>.

    Telethon's PeerChannel() takes only the bare channel_id (no -100 prefix).
    Passing the raw integer to get_entity() sometimes works (if the entity is
    already cached in the session), but often raises ChannelInvalidError for
    accounts that have never fetched the entity directly.  Using PeerChannel
    is the reliable path.
    """
    c = raw.strip()

    # Strip leading @ so usernames and @usernames both work
    if c.startswith("@"):
        return c[1:]

    if c.lstrip("-").isdigit():
        n = int(c)
        s = str(abs(n))

        # -100XXXXXXXXXX  →  PeerChannel(XXXXXXXXXX)
        # This is the standard format the Bot API returns for supergroups/channels.
        if s.startswith("100") and len(s) >= 12:
            pure_id = int(s[3:])          # strip the '100' marker → 3799313385
            return PeerChannel(pure_id)

        # Bare positive integer — might already be a stripped channel id
        if n > 0:
            return PeerChannel(n)

        # Negative but doesn't fit -100XXXX pattern → return as-is and let
        # Telethon try; covers legacy group chat IDs
        return n

    # Plain string → treat as username
    return c


async def resolve_entity_with_fallback(client, raw: str):
    """
    Try two strategies so we work even when the entity is not in session cache.

    Strategy 1 – direct get_entity() with the parsed specifier.
    Strategy 2 – scan iter_dialogs() to find by numeric id (slower but sure).
    """
    parsed = parse_channel_spec(raw)

    # --- Strategy 1: direct ---
    try:
        return await client.get_entity(parsed)
    except (ValueError, ChannelInvalidError, TypeError):
        pass

    # --- Strategy 2: dialog scan (works for private groups / uncached entities) ---
    target_id: int | None = None
    if raw.lstrip("-").isdigit():
        target_id = int(raw)

    if target_id is not None:
        print(
            f"[telethon] Direct entity lookup failed for {raw!r}, "
            "scanning dialogs…",
            file=sys.stderr,
        )
        async for dialog in client.iter_dialogs(limit=1000):
            if dialog.id == target_id:
                print(
                    f"[telethon] Found entity in dialogs: {dialog.name!r}",
                    file=sys.stderr,
                )
                return dialog.entity

    raise ValueError(
        f"Cannot resolve TG_CHANNEL={raw!r}. "
        "Ensure the value is the numeric channel ID (e.g. -1003799313385) "
        "and the Telegram account is already a member of that channel/group."
    )


async def main() -> int:
    api_id_raw     = os.getenv("TG_API_ID",        "").strip()
    api_hash       = os.getenv("TG_API_HASH",       "").strip()
    channel        = os.getenv("TG_CHANNEL",        "").strip()
    session_name   = os.getenv("TG_SESSION",        "graph_intel")
    string_session = os.getenv("TG_STRING_SESSION", "").strip()
    limit          = int(os.getenv("TG_LIMIT",      "50000"))

    # ── validate env ────────────────────────────────────────────────────────
    missing = [k for k, v in [
        ("TG_API_ID",   api_id_raw),
        ("TG_API_HASH", api_hash),
        ("TG_CHANNEL",  channel),
    ] if not v]
    if missing:
        print(json.dumps({
            "error": "missing_telethon_env",
            "message": f"Missing env vars: {', '.join(missing)}",
        }))
        return 1

    # Catch the common mistake of leaving TG_CHANNEL as a placeholder
    if channel in ("your_channel_id", "your_channel", "@your_channel"):
        print(json.dumps({
            "error": "placeholder_channel",
            "message": (
                "TG_CHANNEL is still set to a placeholder value. "
                "Set it to the numeric channel ID, e.g. -1003799313385"
            ),
        }))
        return 1

    api_id  = int(api_id_raw)
    session = StringSession(string_session) if string_session else session_name

    # ── connect ─────────────────────────────────────────────────────────────
    client = TelegramClient(session, api_id, api_hash)
    await client.connect()

    if not await client.is_user_authorized():
        print(json.dumps({
            "error": "telethon_auth_required",
            "message": (
                "Telegram account is not authorised. "
                "Generate a string session locally: "
                "python3 backend/generate_string_session.py  "
                "then set TG_STRING_SESSION in your Render env vars."
            ),
        }))
        await client.disconnect()
        return 1

    # ── fetch messages ───────────────────────────────────────────────────────
    out = []
    try:
        entity = await resolve_entity_with_fallback(client, channel)
        print(
            f"[telethon] Fetching up to {limit} messages from {channel!r}…",
            file=sys.stderr,
        )

        async for msg in client.iter_messages(entity, limit=limit):
            text = msg.message or ""
            if text.strip():
                out.append({"id": msg.id, "text": text})

    except UsernameNotOccupiedError:
        print(json.dumps({
            "error": "channel_not_found",
            "message": (
                f"No Telegram channel/group found for TG_CHANNEL={channel!r}. "
                "Use the numeric ID (e.g. -1003799313385) instead of a username. "
                "To find your numeric ID run: python3 uploader-python/find_channel_id.py"
            ),
        }))
        return 1

    except UsernameInvalidError:
        print(json.dumps({
            "error": "channel_invalid_username",
            "message": (
                f"TG_CHANNEL={channel!r} is not a valid Telegram username. "
                "Did you mean to use the numeric ID?  It starts with -100."
            ),
        }))
        return 1

    except ChannelPrivateError:
        print(json.dumps({
            "error": "channel_private",
            "message": (
                f"Cannot access {channel!r} — the channel is private "
                "or the Telegram account has not joined it."
            ),
        }))
        return 1

    except ChannelInvalidError:
        print(json.dumps({
            "error": "channel_invalid",
            "message": (
                f"TG_CHANNEL={channel!r} is invalid. "
                "Expected format: -1003799313385 (numeric supergroup/channel ID)."
            ),
        }))
        return 1

    except FloodWaitError as exc:
        print(json.dumps({
            "error": "flood_wait",
            "message": f"Telegram rate-limited this account. Retry after {exc.seconds}s.",
        }))
        return 1

    except ValueError as exc:
        print(json.dumps({
            "error": "resolve_failed",
            "message": str(exc),
        }))
        return 1

    finally:
        await client.disconnect()

    # chronological order for deterministic ingestion
    out.reverse()
    print(json.dumps(out, ensure_ascii=False))
    print(f"[telethon] Done — {len(out)} messages returned.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
