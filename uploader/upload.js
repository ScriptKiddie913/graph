/**
 * ============================================================
 * GRAPH INTEL — CSV UPLOADER
 * Reads any CSV (no schema needed) → normalizes → sends to
 * Telegram group as JSON messages (one per node+links pair)
 * ============================================================
 */

import fs from "fs";
import path from "path";
import axios from "axios";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ===== CONFIG =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const DATA_FOLDER = path.join(__dirname, "data");
const DELAY_MS = 50; // Telegram rate limit: 30 messages/sec max, we stay safe at 20/sec
const BATCH_SIZE = 10; // send in micro-batches

if (!BOT_TOKEN || !CHAT_ID) {
  console.error("❌ Missing BOT_TOKEN or CHAT_ID in .env");
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ===== STATS =====
let totalSent = 0;
let totalSkipped = 0;
let totalErrors = 0;

// ===== NORMALIZATION =====
/**
 * Normalize a raw CSV value:
 * - trim whitespace
 * - lowercase
 * - strip phone numbers to digits only
 * - return null for empty/invalid values
 */
function normalize(value) {
  if (value === null || value === undefined) return null;

  let v = String(value).trim();
  if (!v) return null;

  // Remove surrounding quotes
  v = v.replace(/^["']|["']$/g, "").trim();
  if (!v) return null;

  const lower = v.toLowerCase();

  // Phone normalization: keep only digits for phone-like values
  if (/^\+?[\d\s\-().]{7,15}$/.test(v)) {
    const digits = v.replace(/\D/g, "");
    if (digits.length >= 7) return digits;
  }

  return lower;
}

// ===== SEND TO TELEGRAM =====
async function sendMessage(data) {
  const text = JSON.stringify(data);

  // Telegram max message length is 4096 chars
  if (text.length > 4000) {
    console.warn(`⚠️  Skipping oversized record for value: ${data.value}`);
    totalSkipped++;
    return;
  }

  try {
    await axios.post(
      `${TELEGRAM_API}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text,
        disable_notification: true,
      },
      { timeout: 10000 }
    );
    totalSent++;
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.description || err.message;

    if (status === 429) {
      // Rate limited — wait and retry
      const retryAfter = (err.response?.data?.parameters?.retry_after || 5) * 1000;
      console.warn(`⏳ Rate limited. Waiting ${retryAfter}ms...`);
      await sleep(retryAfter);
      return sendMessage(data); // retry
    }

    console.error(`❌ Send error [${status}]: ${msg}`);
    totalErrors++;
  }
}

// ===== PROCESS A SINGLE CSV LINE =====
/**
 * Given one CSV line, build a list of node+links records.
 * Each value in the row becomes a node, linked to all other values.
 * 
 * Example line: "John, +1234567, john@email.com"
 * Produces:
 *   { value: "john", links: [{ value: "1234567" }, { value: "john@email.com" }] }
 *   { value: "1234567", links: [{ value: "john" }, { value: "john@email.com" }] }
 *   { value: "john@email.com", links: [{ value: "john" }, { value: "1234567" }] }
 */
function processLine(line) {
  // Handle quoted commas: simple split for now (handles 99% of cases)
  const raw = line.split(",");
  const values = raw.map(normalize).filter(Boolean);

  // Deduplicate within this line
  const unique = [...new Set(values)];

  if (unique.length === 0) return [];

  // Build records
  return unique.map((val) => ({
    type: "entity",
    value: val,
    links: unique
      .filter((v) => v !== val)
      .map((v) => ({ type: "entity", value: v })),
  }));
}

// ===== PROCESS A CSV FILE =====
async function processFile(filePath) {
  console.log(`\n📂 Processing: ${path.basename(filePath)}`);

  return new Promise((resolve, reject) => {
    const rl = createInterface({
      input: fs.createReadStream(filePath, "utf-8"),
      crlfDelay: Infinity,
    });

    const queue = [];
    let lineNum = 0;

    rl.on("line", (line) => {
      lineNum++;
      line = line.trim();
      if (!line) return;

      // Skip header-like lines (optional heuristic)
      if (lineNum === 1 && /^[a-zA-Z_,\s"]+$/.test(line) && !line.includes("@")) {
        console.log(`  ↳ Skipping likely header: "${line}"`);
        return;
      }

      const records = processLine(line);
      queue.push(...records);
    });

    rl.on("close", async () => {
      console.log(`  ↳ Parsed ${lineNum} lines → ${queue.length} records`);

      // Send in batches to respect rate limits
      for (let i = 0; i < queue.length; i += BATCH_SIZE) {
        const batch = queue.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(sendMessage));
        await sleep(DELAY_MS * BATCH_SIZE);

        // Progress report every 100 sends
        if ((i + BATCH_SIZE) % 100 === 0) {
          console.log(`  ↳ Sent ${Math.min(i + BATCH_SIZE, queue.length)}/${queue.length}...`);
        }
      }

      resolve();
    });

    rl.on("error", reject);
  });
}

// ===== MAIN =====
async function main() {
  console.log("🧠 Graph Intel — CSV Uploader");
  console.log(`📡 Telegram Chat: ${CHAT_ID}`);
  console.log(`📁 Data folder: ${DATA_FOLDER}\n`);

  if (!fs.existsSync(DATA_FOLDER)) {
    fs.mkdirSync(DATA_FOLDER, { recursive: true });
    console.log("📁 Created ./data/ folder — drop your CSV files there and run again.");
    return;
  }

  const files = fs.readdirSync(DATA_FOLDER).filter((f) => f.endsWith(".csv"));

  if (files.length === 0) {
    console.log("⚠️  No CSV files found in ./data/");
    console.log("    Drop .csv files into the data/ folder and run again.");
    return;
  }

  console.log(`Found ${files.length} CSV file(s): ${files.join(", ")}\n`);

  const start = Date.now();

  for (const file of files) {
    await processFile(path.join(DATA_FOLDER, file));
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log("\n" + "=".repeat(50));
  console.log(`✅ Upload complete in ${elapsed}s`);
  console.log(`   Sent:    ${totalSent}`);
  console.log(`   Skipped: ${totalSkipped}`);
  console.log(`   Errors:  ${totalErrors}`);
  console.log("=".repeat(50));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ===== WATCH MODE =====
const isWatch = process.argv.includes("--watch");

if (isWatch) {
  const { default: chokidar } = await import("chokidar");
  console.log("👁  Watch mode — waiting for CSV files in ./data/...");

  const watcher = chokidar.watch(DATA_FOLDER, {
    ignored: /^\./,
    persistent: true,
    ignoreInitial: false,
  });

  watcher.on("add", (filePath) => {
    if (filePath.endsWith(".csv")) {
      console.log(`\n📌 New file detected: ${path.basename(filePath)}`);
      processFile(filePath).catch(console.error);
    }
  });
} else {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
