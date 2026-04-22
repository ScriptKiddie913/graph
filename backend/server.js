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
import { fileURLToPath } from "url";

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

if (!BOT_TOKEN) {
  console.warn("⚠️  BOT_TOKEN not set — Telegram sync disabled");
}

// ============================================================
// 🧠 GRAPH STORE (Memory-optimized for Render 500MB)
// ============================================================

/**
 * nodeMap: Map<nodeId, { id, value, type, connections: number }>
 *   - nodeId = "entity:<normalizedValue>"
 *   - stored as flat objects (not classes) for minimal overhead
 * 
 * adjacency: Map<nodeId, Set<nodeId>>
 *   - adjacency list (NOT matrix) — sparse, O(1) neighbor lookup
 *   - bidirectional edges stored both ways
 * 
 * Memory estimate:
 *   100k nodes × ~150 bytes ≈ 15MB
 *   500k nodes × ~150 bytes ≈ 75MB
 *   plus adjacency sets ≈ similar again
 *   Total 500k nodes ≈ ~150MB — well within 500MB
 */
const nodeMap = new Map();    // nodeId → node object
const adjacency = new Map();  // nodeId → Set<nodeId>
const insertOrder = [];       // LRU eviction queue

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

  const node = { id, value, type: "entity", connections: 0 };
  nodeMap.set(id, node);
  insertOrder.push(id);

  return node;
}

function addEdge(idA, idB) {
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
  }
}

function evictOldest(count) {
  const toRemove = insertOrder.splice(0, count);
  for (const id of toRemove) {
    // Clean up adjacency
    const neighbors = adjacency.get(id);
    if (neighbors) {
      for (const nId of neighbors) {
        adjacency.get(nId)?.delete(id);
      }
    }
    adjacency.delete(id);
    nodeMap.delete(id);
  }
  console.log(`♻️  Evicted ${toRemove.length} old nodes (LRU)`);
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
      const childNode = addNode(link.value.trim());
      addEdge(mainNode.id, childNode.id);
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

function processRawLine(line) {
  const parts = splitRawLine(line);
  if (!parts.length) return;

  const values = [...new Set(parts.map(normalizeRawValue).filter(Boolean))].slice(0, 40);
  if (values.length < 2) return;

  for (const value of values) {
    processRecord({
      type: "entity",
      value,
      links: values
        .filter((v) => v !== value)
        .slice(0, 25)
        .map((v) => ({ type: "entity", value: v })),
    });
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
  } catch (err) {
    console.error("❌ Telegram sync failed:", err.message);
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
        resultEdges.set(edgeKey, {
          id: edgeKey,
          source: id,
          target: nId,
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
app.get("/graph", (req, res) => {
  const { value, depth = "3" } = req.query;

  if (!value) {
    return res.status(400).json({ error: "Missing ?value= parameter" });
  }

  const maxDepth = Math.max(1, Math.min(5, parseInt(depth) || 3));
  const graph = buildSubgraph(value.toLowerCase().trim(), maxDepth);

  res.json(graph);
});

/**
 * GET /search?q=<query>
 * Full-text search across all node values.
 */
app.get("/search", (req, res) => {
  const { q, limit = "20" } = req.query;

  if (!q) {
    return res.status(400).json({ error: "Missing ?q= parameter" });
  }

  const results = searchNodes(q, parseInt(limit));
  res.json({ results, total: results.length });
});

/**
 * GET /stats
 * System health and graph statistics.
 */
app.get("/stats", (req, res) => {
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
});

/**
 * POST /sync
 * Force a full re-sync from Telegram.
 */
app.post("/sync", async (req, res) => {
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
 * GET /health
 * Health check
 */
app.get("/health", (req, res) => {
  res.json({
    service: "Graph Intel Backend",
    status: "running",
    nodes: nodeMap.size,
    synced: isSynced,
  });
});

// ============================================================
// 🌐 SERVE FRONTEND (single-service Render deployment)
// ============================================================
app.use(express.static(FRONTEND_DIST));
app.get("*", (req, res, next) => {
  // Keep API routes untouched
  if (req.path.startsWith("/graph") || req.path.startsWith("/search") || req.path.startsWith("/stats") || req.path.startsWith("/sync") || req.path.startsWith("/webhook")) {
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
  if (BOT_TOKEN) {
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
    console.log("⚠️  No BOT_TOKEN — running without Telegram sync");
    isSynced = true;
  }
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down gracefully...");
  process.exit(0);
});
