#!/usr/bin/env python3
import asyncio
import os

from telethon import TelegramClient
from telethon.sessions import StringSession


async def main():
    api_id = int(os.environ["TG_API_ID"])
    api_hash = os.environ["TG_API_HASH"]

    print("Starting Telegram login for StringSession generation...")
    async with TelegramClient(StringSession(), api_id, api_hash) as client:
        session = client.session.save()
        print("\nTG_STRING_SESSION (copy this to Render env):\n")
        print(session)


if __name__ == "__main__":
    asyncio.run(main())
