# Python Uploader (Separate Interface)

Use this folder if you want a separate uploader tool outside the Node uploader.

## What it does

- Reads `.csv` and `.txt` files from `uploader-python/data/`
- Normalizes values (lowercase, phone cleanup to digits)
- Uploads JSON records to your Telegram channel/group
- Uses backend-compatible payload format

## Files

- `upload_to_telegram.py` — sends CSV/TXT data to Telegram
- `find_channel_id.py` — discovers your Telegram chat/channel id
- `.env.example` — env template

## Setup

1. Create `.env` in this folder:

```env
BOT_TOKEN=your_bot_token
CHAT_ID=your_channel_or_group_chat_id
```

2. Put source files in `uploader-python/data/`:
   - `*.csv`
   - `*.txt` (comma-separated values per line)

3. Run uploader:

```bash
python3 upload_to_telegram.py
```

## Find channel ID

1. Add bot as admin in your channel/group
2. Send a new message in that channel/group
3. Run:

```bash
python3 find_channel_id.py
```

The script prints all discovered chat ids from recent updates.
