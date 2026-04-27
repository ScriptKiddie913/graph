/**
 * ============================================================
 * GRAPH INTEL — BACKEND SERVER
 * 
 * - Syncs ALL messages from Telegram on startup
 * - Builds in-memory graph (nodes + adjacency list)
 * - REST API for graph traversal, search, stats
 * - Webhook endpoint for live Telegram updates
 * - LRU eviction to stay under 500MB on Render free tier
 * ============================================================
 */

import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { classifyEntity, enrichEntity } from "./entityClassifier.js";
import { getLinkMeta, buildLinksFromRow } from "./entityLinker.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIST = path.resolve(__dirname, "../frontend/dist");

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const PORT = process.env.PORT || 3001;
const MAX_NODES = parseInt(process.env.MAX_NODES || "500000");
const NO_STORE_MODE = String(process.env.NO_STORE_MODE || "false").toLowerCase() === "true";
const TELETHON_MODE = String(process.env.TELETHON_MODE || "false").toLowerCase() === "true";
const TELETHON_PYTHON = process.env.TELETHON_PYTHON || "python3";
const execFileAsync = promisify(execFile);

if (!BOT_TOKEN) {
  console.warn("⚠️  BOT_TOKEN not set — Telegram sync disabled");
}

// ============================================================
// 🧠 GRAPH STORE (Memory-optimized for Render 500MB)
// ============================================================

/**
 * nodeMap: Map<nodeId, { id, value, type, category, icon, color, connections: number }>
 *   - nodeId = "entity:<normalizedValue>"
 *   - type/category/icon/color come from entityClassifier
 *   - stored as flat objects (not classes) for minimal overhead
 *
 * adjacency: Map<nodeId, Set<nodeId>>
 *   - adjacency list (NOT matrix) — sparse, O(1) neighbor lookup
 *   - bidirectional edges stored both ways
 *
 * edgeMetaMap: Map<edgeKey, { weight, label, category }>
 *   - stores rich edge metadata keyed by canonical "idA~~idB" string
 *
 * Memory estimate:
 *   100k nodes × ~200 bytes ≈ 20MB
 *   500k nodes × ~200 bytes ≈ 100MB
 *   plus adjacency sets ≈ similar again
 *   Total 500k nodes ≈ ~200MB — well within 500MB
 */
const nodeMap = new Map();       // nodeId → node object
const adjacency = new Map();     // nodeId → Set<nodeId>
const edgeMetaMap = new Map();   // edgeKey → { weight, label, category }
const insertOrder = [];          // LRU eviction queue

// ===== NODE OPERATIONS =====

function makeId(value) {
  return `entity:${value}`;
}

function addNode(value) {
  const id = makeId(value);

  if (nodeMap.has(id)) {
    return nodeMap.get(id);
  }

  // LRU eviction: remove oldest nodes if over limit
  if (nodeMap.size >= MAX_NODES) {
    evictOldest(1000);
  }

  const enriched = enrichEntity(value);
  const node = {
    id,
    value,
    type: enriched.type,
    category: enriched.category,
    icon: enriched.icon,
    color: enriched.color,
    connections: 0,
  };
  nodeMap.set(id, node);
  insertOrder.push(id);

  return node;
}

function addEdge(idA, idB, meta) {
  if (idA === idB) return;

  if (!adjacency.has(idA)) adjacency.set(idA, new Set());
  if (!adjacency.has(idB)) adjacency.set(idB, new Set());

  const wasNew = !adjacency.get(idA).has(idB);
  adjacency.get(idA).add(idB);
  adjacency.get(idB).add(idA);

  if (wasNew) {
    // Update connection counts
    const nodeA = nodeMap.get(idA);
    const nodeB = nodeMap.get(idB);
    if (nodeA) nodeA.connections++;
    if (nodeB) nodeB.connections++;

    // Store edge metadata
    if (meta) {
      const edgeKey = idA < idB ? `${idA}~~${idB}` : `${idB}~~${idA}`;
      if (!edgeMetaMap.has(edgeKey)) {
        edgeMetaMap.set(edgeKey, meta);
      }
    }
  }
}

function evictOldest(count) {
  const toRemove = insertOrder.splice(0, count);
  for (const id of toRemove) {
    // Clean up adjacency and edge metadata
    const neighbors = adjacency.get(id);
    if (neighbors) {
      for (const nId of neighbors) {
        adjacency.get(nId)?.delete(id);
        const edgeKey = id < nId ? `${id}~~${nId}` : `${nId}~~${id}`;
        edgeMetaMap.delete(edgeKey);
      }
    }
    adjacency.delete(id);
    nodeMap.delete(id);
  }
  console.log(`♻️  Evicted ${toRemove.length} old nodes (LRU)`);
}

function clearGraph() {
  nodeMap.clear();
  adjacency.clear();
  edgeMetaMap.clear();
  insertOrder.length = 0;
}

// ===== PROCESS TELEGRAM MESSAGE =====

function processRecord(data) {
  try {
    if (!data || typeof data.value !== "string") return;

    const value = data.value.trim();
    if (!value) return;

    const mainNode = addNode(value);

    for (const link of data.links || []) {
      if (!link?.value) continue;
      const linkedValue = link.value.trim();
      const childNode = addNode(linkedValue);
      const meta = getLinkMeta(mainNode.type, childNode.type);
      addEdge(mainNode.id, childNode.id, meta);
    }
  } catch (err) {
    // Malformed records are silently ignored
  }
}

function normalizeRawValue(value) {
  if (value === null || value === undefined) return null;
  let v = String(value).trim().replace(/^["'`]|["'`]$/g, "");
  if (!v) return null;

  const lower = v.toLowerCase();
  if (["null", "<blank>", "-----", "none", "n/a", "na", "-"].includes(lower)) {
    return null;
  }

  // Phone-like values -> keep digits only
  if (/^\+?[\d\s\-().]{7,20}$/.test(v)) {
    const digits = v.replace(/\D/g, "");
    if (digits.length >= 7) return digits;
  }

  // Collapse extra whitespace, preserve unicode text
  v = v.replace(/\s+/g, " ").trim().toLowerCase();
  if (v.length < 2 && !/^\d+$/.test(v)) return null;
  return v;
}

function splitRawLine(line) {
  const clean = line.trim();
  if (!clean) return [];

  // host:user:password style dumps
  if (clean.includes(":") && (clean.match(/:/g) || []).length >= 2 && !clean.includes(",") && !clean.includes("\t")) {
    const parts = clean.split(":").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) return parts;
  }

  // key: value style
  if (clean.includes(":") && !clean.includes(",") && !clean.includes("\t")) {
    const idx = clean.indexOf(":");
    return [clean.slice(0, idx).trim(), clean.slice(idx + 1).trim()];
  }

  // mixed ":" + "," lines (e.g. "name : address,5")
  // First split CSV segments, then split each segment by ":" to keep all entities.
  if (clean.includes(":") && clean.includes(",")) {
    const csvParts = clean.split(",").map((p) => p.trim()).filter(Boolean);
    const mixed = [];
    for (const part of csvParts) {
      if (part.includes(":")) {
        const sub = part.split(":").map((p) => p.trim()).filter(Boolean);
        mixed.push(...sub);
      } else {
        mixed.push(part);
      }
    }
    if (mixed.length) return mixed;
  }

  // tab-delimited
  if (clean.includes("\t")) {
    return clean.split("\t").map((p) => p.trim());
  }

  // csv-like
  if (clean.includes(",")) {
    return clean.split(",").map((p) => p.trim());
  }

  // 2+ spaces separated report line
  if (/\s{2,}/.test(clean)) {
    return clean.split(/\s{2,}/).map((p) => p.trim());
  }

  return [clean];
}

function safeClassify(value) {
  try {
    return classifyEntity(value);
  } catch {
    return "unknown";
  }
}

function isLikelyPassword(value) {
  // Common password patterns — mixed complexity or word+digits pattern
  return (
    /^(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{6,}$/.test(value) ||
    /^[a-z]{4,10}\d{2,6}[!@#$%]?$/i.test(value)
  );
}

function processRawLine(line) {
  const parts = splitRawLine(line);
  if (!parts.length) return;

  const values = [...new Set(parts.map(normalizeRawValue).filter(Boolean))].slice(0, 40);
  if (values.length < 2) return;

  // Ensure all nodes exist
  for (const value of values) {
    addNode(value);
    // Reclassify as "password" if unknown and matches password heuristic
    const node = nodeMap.get(makeId(value));
    if (node && node.type === "unknown" && isLikelyPassword(value)) {
      node.type = "password";
    }
  }

  // Use smart linker — reuse types already stored in nodeMap to avoid re-classifying
  const getType = (v) => nodeMap.get(makeId(v))?.type || safeClassify(v);
  const links = buildLinksFromRow(values, getType);
  for (const link of links) {
    const fromId = makeId(link.from.value);
    const toId = makeId(link.to.value);
    const meta = getLinkMeta(link.from.type, link.to.type);
    addEdge(fromId, toId, meta);
  }
}

function processRawTextBlock(text) {
  if (!text) return;
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    processRawLine(line);
  }
}

function tryParseAndProcess(text) {
  if (!text) return;

  // Preferred format: uploader JSON
  if (text.startsWith("{")) {
    try {
      const data = JSON.parse(text);
      processRecord(data);
      return;
    } catch {
      // fall through to raw parser
    }
  }

  // Fallback: raw text record parsing (line-by-line)
  processRawTextBlock(text);
}

// ============================================================
// 📡 TELEGRAM SYNC
// ============================================================

let syncOffset = 0;
let isSynced = false;
let isSyncing = false;
let lastSyncTime = null;
let totalMessagesProcessed = 0;

/**
 * Fetches ALL historical messages from Telegram.
 * Uses offset-based pagination (100 messages per request).
 * Telegram Bot API getUpdates only returns updates from the bot's
 * perspective (messages in groups where the bot is a member).
 */
async function syncFromTelegram() {
  if (isSyncing) {
    console.log("⏳ Sync already in progress...");
    return;
  }

  isSyncing = true;
  console.log("🔄 Starting Telegram sync...");

  // Check if a webhook is active — getUpdates won't work alongside a webhook
  try {
    const info = await axios.get(`${TELEGRAM_API}/getWebhookInfo`, { timeout: 5000 });
    const activeWebhook = info.data?.result?.url;
    if (activeWebhook) {
      console.warn(`⚠️  Active webhook detected (${activeWebhook}). getUpdates is disabled while a webhook is set.`);
      console.warn("    • New messages will arrive via the /webhook endpoint.");
      console.warn("    • For full channel history: set TELETHON_MODE=true with TG_API_ID / TG_API_HASH / TG_CHANNEL / TG_STRING_SESSION.");
      console.warn("    • To switch to polling: call GET /webhook/delete, then POST /sync.");
      isSynced = true;
      lastSyncTime = new Date();
      isSyncing = false;
      return;
    }
  } catch (err) {
    // Ignore webhook check errors and proceed with getUpdates
    console.warn(`⚠️  Could not check webhook status: ${err.message} — proceeding with getUpdates.`);
  }

  let offset = 0;
  let fetched = 0;
  let processed = 0;

  try {
    while (true) {
      const res = await axios.get(`${TELEGRAM_API}/getUpdates`, {
        params: {
          offset,
          limit: 100,
          timeout: 0,
          allowed_updates: JSON.stringify(["message", "channel_post"]),
        },
        timeout: 30000,
      });

      const updates = res.data?.result || [];
      if (updates.length === 0) break;

      for (const update of updates) {
        const text =
          update.message?.text ||
          update.channel_post?.text ||
          update.edited_message?.text;

        if (text) {
          tryParseAndProcess(text);
          processed++;
        }

        offset = update.update_id + 1;
        fetched++;
      }

      if (updates.length < 100) break; // Last page

      // Small delay to avoid hammering Telegram
      await sleep(100);
    }

    syncOffset = offset;
    isSynced = true;
    lastSyncTime = new Date();
    totalMessagesProcessed += processed;

    console.log(`✅ Sync complete: ${fetched} updates, ${processed} records parsed`);
    console.log(`   Graph: ${nodeMap.size} nodes, ${countEdges()} edges`);

    if (fetched === 0) {
      console.warn("⚠️  No Telegram updates received. Possible reasons:");
      console.warn("    • Bot is not an admin in the channel — only admin bots receive channel_post updates.");
      console.warn("    • All prior updates were already consumed — getUpdates only returns unread updates.");
      console.warn("    • For full channel history: set TELETHON_MODE=true with TG_API_ID / TG_API_HASH / TG_CHANNEL / TG_STRING_SESSION.");
    }
  } catch (err) {
    console.error("❌ Telegram sync failed:", err.message);
    const desc = err.response?.data?.description || "";
    if (err.response?.status === 409 || desc.toLowerCase().includes("webhook")) {
      console.error("    Hint: A webhook appears to be active. Call GET /webhook/delete to remove it, then POST /sync.");
    }
  } finally {
    isSyncing = false;
  }
}

/**
 * Poll for new updates since last sync.
 * Called periodically or via webhook.
 */
async function pollNewUpdates() {
  if (!BOT_TOKEN || isSyncing) return;

  try {
    const res = await axios.get(`${TELEGRAM_API}/getUpdates`, {
      params: {
        offset: syncOffset,
        limit: 100,
        timeout: 0,
      },
      timeout: 15000,
    });

    const updates = res.data?.result || [];

    for (const update of updates) {
      const text =
        update.message?.text ||
        update.channel_post?.text ||
        update.edited_message?.text;

      if (text) tryParseAndProcess(text);
      syncOffset = update.update_id + 1;
      totalMessagesProcessed++;
    }
  } catch {
    // Silent fail on poll errors
  }
}

async function rebuildGraphFromTelethonSnapshot() {
  const scriptPath = path.resolve(__dirname, "telethon_fetch.py");

  let stdout, stderr;
  try {
    ({ stdout, stderr } = await execFileAsync(
      TELETHON_PYTHON,
      [scriptPath],
      {
        env: process.env,
        timeout: 180000,
        maxBuffer: 30 * 1024 * 1024,
      }
    ));
  } catch (err) {
    // execFileAsync rejects on non-zero exit code; err.stdout contains the Python JSON error
    let detail = String(err.stdout || err.stderr || err.message || "").trim();
    try {
      const parsed = JSON.parse(err.stdout || "{}");
      detail = parsed.message || parsed.error || detail;
    } catch { /* ignore */ }
    throw new Error(`Telethon fetch failed: ${detail}`);
  }

  if (stderr && stderr.trim()) {
    console.warn(`telethon_fetch.py warnings: ${stderr.trim()}`);
  }

  let messages;
  try {
    messages = JSON.parse(stdout || "[]");
  } catch {
    throw new Error("Failed to parse Telethon output as JSON");
  }

  if (!Array.isArray(messages)) {
    const detail = messages?.message || messages?.error || "unexpected output format";
    throw new Error(`Telethon error: ${detail}`);
  }

  // Only clear the graph after a successful fetch so a failure never leaves an empty graph
  clearGraph();
  for (const msg of messages) {
    if (msg?.text) {
      tryParseAndProcess(msg.text);
    }
  }
}

/**
 * NO_STORE_MODE path:
 * Rebuild graph from Telegram updates for each request.
 * Does not persist offset/state between requests.
 */
async function rebuildGraphFromTelegramSnapshot() {
  if (TELETHON_MODE) {
    await rebuildGraphFromTelethonSnapshot();
    return;
  }

  if (!BOT_TOKEN) return;

  let offset = 0;
  let loops = 0;
  const MAX_LOOPS = 200; // safety cap (200 * 100 updates max scanned)
  const collected = []; // collect texts before clearing graph

  while (loops < MAX_LOOPS) {
    loops++;
    const res = await axios.get(`${TELEGRAM_API}/getUpdates`, {
      params: {
        offset,
        limit: 100,
        timeout: 0,
        allowed_updates: JSON.stringify(["message", "channel_post"]),
      },
      timeout: 30000,
    });

    const updates = res.data?.result || [];
    if (updates.length === 0) break;

    for (const update of updates) {
      const text =
        update.message?.text ||
        update.channel_post?.text ||
        update.edited_message?.text;

      if (text) collected.push(text);
      offset = update.update_id + 1;
    }

    if (updates.length < 100) break;
    await sleep(80);
  }

  // Only clear the graph after a successful fetch so a failure never leaves an empty graph
  clearGraph();
  for (const text of collected) {
    tryParseAndProcess(text);
  }
}

function countEdges() {
  let total = 0;
  for (const set of adjacency.values()) {
    total += set.size;
  }
  return total / 2; // bidirectional, count once
}

// ============================================================
// 🔍 GRAPH TRAVERSAL (BFS)
// ============================================================

/**
 * BFS from a seed node, up to maxDepth hops.
 * Returns { nodes: [...], edges: [...] } suitable for ReactFlow.
 * 
 * Caps result at maxNodes to prevent memory/performance issues
 * when a high-degree node is the seed.
 */
function buildSubgraph(seedValue, maxDepth = 3, maxResultNodes = 500) {
  const seedId = makeId(seedValue);

  if (!nodeMap.has(seedId)) {
    return { nodes: [], edges: [], found: false };
  }

  const visitedNodes = new Set();
  const resultEdges = new Map(); // edgeKey → { id, source, target }

  const queue = [{ id: seedId, depth: 0 }];

  while (queue.length > 0 && visitedNodes.size < maxResultNodes) {
    const { id, depth } = queue.shift();

    if (visitedNodes.has(id)) continue;
    visitedNodes.add(id);

    if (depth >= maxDepth) continue;

    const neighbors = adjacency.get(id);
    if (!neighbors) continue;

    for (const nId of neighbors) {
      // Create a canonical edge key (alphabetical) to deduplicate
      const edgeKey =
        id < nId ? `${id}~~${nId}` : `${nId}~~${id}`;

      if (!resultEdges.has(edgeKey)) {
        const meta = edgeMetaMap.get(edgeKey) || { weight: 3, label: "linked to", category: "generic" };
        resultEdges.set(edgeKey, {
          id: edgeKey,
          source: id,
          target: nId,
          weight: meta.weight,
          label: meta.label,
          category: meta.category,
        });
      }

      if (!visitedNodes.has(nId) && visitedNodes.size < maxResultNodes) {
        queue.push({ id: nId, depth: depth + 1 });
      }
    }
  }

  // Build node list with position hints (rings around seed)
  const nodeList = [];
  const visited = Array.from(visitedNodes);

  visited.forEach((id, i) => {
    const node = nodeMap.get(id);
    if (!node) return;

    const isSeed = id === seedId;
    const ring = isSeed ? 0 : Math.ceil((i + 1) / 8);
    const posInRing = i % 8;
    const radius = ring * 160;
    const angle = (posInRing / 8) * 2 * Math.PI;

    nodeList.push({
      ...node,
      isSeed,
      // Hint positions for frontend layout (can be overridden)
      hintX: Math.cos(angle) * radius,
      hintY: Math.sin(angle) * radius,
    });
  });

  return {
    nodes: nodeList,
    edges: Array.from(resultEdges.values()),
    found: true,
    total: visitedNodes.size,
  };
}

// ============================================================
// 🔎 SEARCH
// ============================================================

function searchNodes(query, limit = 20) {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const results = [];

  for (const [, node] of nodeMap) {
    if (node.value.includes(q)) {
      results.push({
        ...node,
        neighbors: adjacency.get(node.id)?.size || 0,
      });
      if (results.length >= limit) break;
    }
  }

  // Sort: exact matches first, then by connection count
  return results.sort((a, b) => {
    const aExact = a.value === q ? 1 : 0;
    const bExact = b.value === q ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    return b.connections - a.connections;
  });
}

// ============================================================
// 🌐 API ROUTES
// ============================================================

/**
 * GET /graph?value=<seed>&depth=<1-5>
 * Returns subgraph centered on the seed value.
 */
app.get("/graph", async (req, res) => {
  const { value, depth = "3" } = req.query;

  if (!value) {
    return res.status(400).json({ error: "Missing ?value= parameter" });
  }

  try {
    if (NO_STORE_MODE) {
      await rebuildGraphFromTelegramSnapshot();
    }
    const maxDepth = Math.max(1, Math.min(5, parseInt(depth) || 3));
    const graph = buildSubgraph(value.toLowerCase().trim(), maxDepth);

    res.json(graph);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to build graph" });
  } finally {
    if (NO_STORE_MODE) {
      clearGraph();
    }
  }
});

/**
 * GET /search?q=<query>
 * Full-text search across all node values.
 */
app.get("/search", async (req, res) => {
  const { q, limit = "20" } = req.query;

  if (!q) {
    return res.status(400).json({ error: "Missing ?q= parameter" });
  }

  try {
    if (NO_STORE_MODE) {
      await rebuildGraphFromTelegramSnapshot();
    }
    const results = searchNodes(q, parseInt(limit));
    res.json({ results, total: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message || "Search failed" });
  } finally {
    if (NO_STORE_MODE) {
      clearGraph();
    }
  }
});

/**
 * GET /stats
 * System health and graph statistics.
 */
app.get("/stats", async (req, res) => {
  try {
    if (NO_STORE_MODE) {
      await rebuildGraphFromTelegramSnapshot();
    }
  const memUsage = process.memoryUsage();

  res.json({
    graph: {
      nodes: nodeMap.size,
      edges: countEdges(),
      maxNodes: MAX_NODES,
    },
    sync: {
      synced: isSynced,
      syncing: isSyncing,
      lastSync: lastSyncTime,
      totalMessages: totalMessagesProcessed,
      offset: syncOffset,
    },
    memory: {
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      rssMB: Math.round(memUsage.rss / 1024 / 1024),
    },
    uptime: Math.round(process.uptime()),
  });
  } catch (err) {
    res.status(500).json({ error: err.message || "Stats failed" });
  } finally {
    if (NO_STORE_MODE) {
      clearGraph();
    }
  }
});

/**
 * GET /types
 * Returns entity type distribution for the current graph,
 * sorted by count descending.
 */
app.get("/types", async (req, res) => {
  try {
    if (NO_STORE_MODE) {
      await rebuildGraphFromTelegramSnapshot();
    }

    const counts = {};
    for (const [, node] of nodeMap) {
      const t = node.type || "unknown";
      counts[t] = (counts[t] || 0) + 1;
    }

    const types = Object.entries(counts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    res.json({ types, total: nodeMap.size });
  } catch (err) {
    res.status(500).json({ error: err.message || "Types failed" });
  } finally {
    if (NO_STORE_MODE) {
      clearGraph();
    }
  }
});

// Simple in-memory rate limiter for resource-intensive endpoints
// Tracks request count per IP in a sliding 60-second window
const rateLimitMap = new Map(); // ip → [timestamps]
function checkRateLimit(ip, maxRequests = 5, windowMs = 60000) {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) return false;
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return true;
}

const HOLEHE_PROVIDERS = [
  { key: "google", aliases: ["google", "gmail"], domains: ["gmail.com", "googlemail.com"] },
  { key: "microsoft", aliases: ["microsoft", "outlook", "hotmail", "live"], domains: ["outlook.com", "hotmail.com", "live.com", "msn.com"] },
  { key: "yahoo", aliases: ["yahoo", "ymail", "rocketmail"], domains: ["yahoo.com", "ymail.com", "rocketmail.com"] },
  { key: "proton", aliases: ["proton", "protonmail"], domains: ["proton.me", "protonmail.com"] },
  { key: "icloud", aliases: ["icloud", "apple", "me"], domains: ["icloud.com", "me.com", "mac.com"] },
];

function normalizeHoleheSite(site) {
  return String(site || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function reasonHoleheResults(email, found) {
  const domain = String(email || "").split("@")[1]?.toLowerCase() || "";
  const seen = new Set();

  return (found || [])
    .map((site) => {
      const label = String(site || "").trim();
      const normalized = normalizeHoleheSite(label);
      if (!normalized || seen.has(normalized)) return null;
      seen.add(normalized);

      const compact = normalized.replace(/\s+/g, "");
      const provider = HOLEHE_PROVIDERS.find((entry) =>
        entry.aliases.some((alias) => alias === normalized || alias === compact)
      );
      let confidence = 0.7;
      let reason = "Holehe reported the account as in-use";

      if (provider) {
        confidence = 0.85;
        reason = "Matched known provider alias";
        if (domain && provider.domains.includes(domain)) {
          confidence = 0.97;
          reason = "Email domain matches provider";
        }
      }

      return { site: label, normalized, confidence, reason };
    })
    .filter(Boolean)
    .sort((a, b) => b.confidence - a.confidence || a.site.localeCompare(b.site));
}

/**
 * POST /holehe
 * Run holehe email scanner on the given email and return found sites.
 * Body: { "email": "user@example.com" }
 */
app.post("/holehe", async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  if (!checkRateLimit(ip, 5, 60000)) {
    return res.status(429).json({ error: "Rate limit exceeded — max 5 scans per minute" });
  }

  const { email } = req.body || {};

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "Missing or invalid email" });
  }

  const scriptPath = path.resolve(__dirname, "holehe_runner.py");
  const python = TELETHON_PYTHON; // reuse python3 env var

  try {
    const { stdout, stderr } = await execFileAsync(python, [scriptPath, email.trim()], {
      timeout: 100000,
      maxBuffer: 2 * 1024 * 1024,
    });

    if (stderr && stderr.trim()) {
      console.warn(`holehe_runner.py warnings: ${stderr.trim()}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(stdout || "[]");
    } catch {
      return res.status(500).json({ error: "Failed to parse holehe output" });
    }

    const found = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.found) ? parsed.found : [];
    const runnerError = typeof parsed?.error === "string" ? parsed.error : null;
    const reasoned = reasonHoleheResults(email, found);

    if (runnerError && reasoned.length === 0) {
      return res.status(503).json({ error: runnerError });
    }

    res.json({ email, found, reasoned, count: found.length, warning: runnerError || null });
  } catch (err) {
    const detail = String(err.stdout || err.stderr || err.message || "").trim();
    res.status(500).json({ error: `holehe failed: ${detail}` });
  }
});

/**
 * POST /sync
 * Force a full re-sync from Telegram.
 */
app.post("/sync", async (req, res) => {
  if (NO_STORE_MODE) {
    return res.json({ message: "NO_STORE_MODE enabled: data is fetched on-demand from Telegram", syncing: false });
  }

  if (!BOT_TOKEN) {
    return res.status(400).json({ error: "BOT_TOKEN not configured" });
  }

  // Don't wait — return immediately
  syncFromTelegram().catch(console.error);

  res.json({ message: "Sync started", syncing: true });
});

/**
 * POST /webhook
 * Receive live Telegram updates (set via setWebhook).
 * Forward all group messages here as they arrive.
 */
app.post("/webhook", (req, res) => {
  if (NO_STORE_MODE) {
    return res.sendStatus(200);
  }

  const update = req.body;

  const text =
    update?.message?.text ||
    update?.channel_post?.text ||
    update?.edited_message?.text;

  if (text) {
    tryParseAndProcess(text);
    if (update.update_id) {
      syncOffset = Math.max(syncOffset, update.update_id + 1);
    }
  }

  res.sendStatus(200);
});

/**
 * GET /webhook/set
 * Sets the Telegram webhook to this server.
 * Call once after deployment: GET /webhook/set?url=https://your-backend.onrender.com
 */
app.get("/webhook/set", async (req, res) => {
  const { url } = req.query;
  const webhookUrl = url || process.env.WEBHOOK_URL;

  if (!webhookUrl) {
    return res.status(400).json({ error: "Missing ?url= or WEBHOOK_URL env" });
  }

  if (!BOT_TOKEN) {
    return res.status(400).json({ error: "BOT_TOKEN not configured" });
  }

  try {
    const response = await axios.post(`${TELEGRAM_API}/setWebhook`, {
      url: `${webhookUrl}/webhook`,
      allowed_updates: ["message", "channel_post"],
      drop_pending_updates: false,
    });
    res.json({ success: true, telegram: response.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /webhook/delete
 * Removes the active Telegram webhook so getUpdates polling can be used.
 * After deleting the webhook, call POST /sync to pull pending updates.
 */
app.get("/webhook/delete", async (req, res) => {
  if (!BOT_TOKEN) {
    return res.status(400).json({ error: "BOT_TOKEN not configured" });
  }

  try {
    const response = await axios.post(`${TELEGRAM_API}/deleteWebhook`, {
      drop_pending_updates: false,
    });
    res.json({ success: true, telegram: response.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /health
 * Health check
 */
app.get("/health", (req, res) => {
  res.json({
    service: "Graph Intel Backend",
    status: "running",
    nodes: nodeMap.size,
    synced: isSynced,
    noStoreMode: NO_STORE_MODE,
  });
});

// ============================================================
// 🌐 SERVE FRONTEND (single-service Render deployment)
// ============================================================
app.use(express.static(FRONTEND_DIST));
const API_ROUTE_PREFIXES = ["/graph", "/search", "/stats", "/sync", "/webhook", "/types", "/health", "/holehe"];
app.get("*", (req, res, next) => {
  // Keep API routes untouched
  if (API_ROUTE_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
    return next();
  }
  return res.sendFile(path.join(FRONTEND_DIST, "index.html"));
});

// ============================================================
// ⚡ START
// ============================================================

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

app.listen(PORT, async () => {
  console.log(`\n🧠 Graph Intel Backend`);
  console.log(`🚀 Running on port ${PORT}`);
  console.log(`📊 Max nodes: ${MAX_NODES.toLocaleString()}`);
  console.log(`💾 Memory limit: ~500MB (Render free tier)\n`);

  // Start Telegram sync on boot
  if (BOT_TOKEN && !NO_STORE_MODE) {
    // Small delay to let server fully initialize
    await sleep(500);
    syncFromTelegram().catch(console.error);

    // Poll every 60 seconds for new messages (fallback when no webhook)
    setInterval(() => {
      if (isSynced && !isSyncing) {
        pollNewUpdates().catch(console.error);
      }
    }, 60_000);
  } else {
    if (NO_STORE_MODE) {
      console.log("🛡️  NO_STORE_MODE enabled — no persistent in-memory cache");
    } else {
      console.log("⚠️  No BOT_TOKEN — running without Telegram sync");
    }
    isSynced = true;
  }

  // Keep-alive ping: prevent Render free tier from sleeping (spins down after 15 min inactivity)
  const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  setInterval(() => {
    axios.get(`${SELF_URL}/health`).catch(() => {});
  }, 14 * 60 * 1000); // every 14 minutes
  console.log(`❤️  Keep-alive ping enabled → ${SELF_URL}/health every 14 min`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down gracefully...");
  process.exit(0);
});
