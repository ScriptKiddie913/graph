import React, { useState, useCallback, useMemo } from "react";
import { useNodesState, useEdgesState, MarkerType } from "reactflow";
import axios from "axios";

import SearchBar from "./components/SearchBar.jsx";
import StatsBar from "./components/StatsBar.jsx";
import GraphView from "./components/GraphView.jsx";
import NodePanel from "./components/NodePanel.jsx";
import TypeFilterPanel from "./components/TypeFilterPanel.jsx";

const API = import.meta.env.VITE_API_URL || "";

// ===== LAYOUT =====
// Arrange nodes in concentric rings around the seed
function computeLayout(rawNodes, seedId) {
  const seed = rawNodes.find((n) => n.id === seedId);
  if (!seed) return {};

  const cx = 0;
  const cy = 0;
  const positions = { [seedId]: { x: cx, y: cy } };
  const others = rawNodes.filter((n) => n.id !== seedId);

  const RINGS = [
    { count: 8, radius: 180 },
    { count: 16, radius: 360 },
    { count: 24, radius: 540 },
    { count: 32, radius: 720 },
    { count: 999, radius: 900 },
  ];

  let placed = 0;
  for (const ring of RINGS) {
    if (placed >= others.length) break;
    const slice = others.slice(placed, placed + ring.count);
    slice.forEach((n, i) => {
      const angle = (i / slice.length) * 2 * Math.PI - Math.PI / 2;
      // Add jitter to avoid perfect alignment
      const jitter = (Math.random() - 0.5) * 30;
      positions[n.id] = {
        x: cx + (ring.radius + jitter) * Math.cos(angle),
        y: cy + (ring.radius + jitter) * Math.sin(angle),
      };
    });
    placed += slice.length;
  }

  return positions;
}

// Convert API response to ReactFlow format
function toReactFlowNodes(apiNodes, positions, seedId, onNodeClick) {
  return apiNodes.map((n) => ({
    id: n.id,
    type: "entity",
    position: positions[n.id] || { x: Math.random() * 600 - 300, y: Math.random() * 600 - 300 },
    data: {
      label: n.value,
      isSeed: n.id === seedId,
      connections: n.connections || 0,
      entityType: n.type || "unknown",
      icon: n.icon,
      color: n.color,
      onClick: () => onNodeClick(n),
    },
  }));
}

function toReactFlowEdges(apiEdges) {
  return apiEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "default",
    style: {
      stroke: "rgba(123,111,255,0.35)",
      strokeWidth: 1.5,
    },
    markerEnd: {
      type: MarkerType.None,
    },
  }));
}

// ===== MAIN APP =====
export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [depthSetting, setDepthSetting] = useState(3);
  const [currentSeed, setCurrentSeed] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeTypeFilters, setActiveTypeFilters] = useState(new Set());

  // ===== TYPE FILTER =====
  const typeCounts = useMemo(() => {
    const counts = {};
    for (const n of nodes) {
      const t = n.data?.entityType || "unknown";
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [nodes]);

  const displayNodes = useMemo(() => {
    if (activeTypeFilters.size === 0) return nodes;
    return nodes.filter((n) => n.data?.isSeed || activeTypeFilters.has(n.data?.entityType));
  }, [nodes, activeTypeFilters]);

  const displayEdges = useMemo(() => {
    if (activeTypeFilters.size === 0) return edges;
    const visibleIds = new Set(displayNodes.map((n) => n.id));
    return edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
  }, [edges, displayNodes, activeTypeFilters]);

  const handleToggleFilter = useCallback((type) => {
    setActiveTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const handleClearFilters = useCallback(() => {
    setActiveTypeFilters(new Set());
  }, []);

  // ===== LOAD GRAPH =====
  const loadGraph = useCallback(
    async (value, depth) => {
      if (!value) return;

      setLoading(true);
      setError(null);
      setSelectedNode(null);

      try {
        const res = await axios.get(`${API}/graph`, {
          params: { value: value.trim().toLowerCase(), depth: depth || depthSetting },
        });

        const { nodes: apiNodes, edges: apiEdges, found } = res.data;

        if (!found || apiNodes.length === 0) {
          setError(`No data found for "${value}"`);
          setLoading(false);
          return;
        }

        const seedId = `entity:${value.trim().toLowerCase()}`;
        const positions = computeLayout(apiNodes, seedId);

        const rfNodes = toReactFlowNodes(apiNodes, positions, seedId, (n) => {
          setSelectedNode(n);
        });

        const rfEdges = toReactFlowEdges(apiEdges);

        setNodes(rfNodes);
        setEdges(rfEdges);
        setCurrentSeed(value);
        setHistory((h) => [...h.slice(-9), value]);

      } catch (err) {
        setError(err.response?.data?.error || "Failed to load graph. Is the backend running?");
      } finally {
        setLoading(false);
      }
    },
    [depthSetting, setNodes, setEdges]
  );

  // ===== NODE EXPAND (click on node panel) =====
  const handleExpand = useCallback(
    (value, depth) => {
      setSelectedNode(null);
      loadGraph(value, depth);
    },
    [loadGraph]
  );

  // ===== MERGE MODE: add new graph onto existing =====
  const mergeGraph = useCallback(
    async (value, depth) => {
      setLoading(true);
      setError(null);

      try {
        const res = await axios.get(`${API}/graph`, {
          params: { value: value.trim().toLowerCase(), depth: depth || 2 },
        });

        const { nodes: apiNodes, edges: apiEdges, found } = res.data;
        if (!found) return;

        const seedId = `entity:${value.trim().toLowerCase()}`;

        // Only add nodes that don't already exist
        const existingIds = new Set(nodes.map((n) => n.id));
        const newApiNodes = apiNodes.filter((n) => !existingIds.has(n.id));

        // Position new nodes around the expanded seed
        const seedNode = nodes.find((n) => n.id === seedId);
        const seedPos = seedNode?.position || { x: 0, y: 0 };

        const newPositions = {};
        newApiNodes.forEach((n, i) => {
          const angle = (i / newApiNodes.length) * 2 * Math.PI;
          newPositions[n.id] = {
            x: seedPos.x + 200 * Math.cos(angle),
            y: seedPos.y + 200 * Math.sin(angle),
          };
        });

        const rfNewNodes = toReactFlowNodes(newApiNodes, newPositions, seedId, (n) => {
          setSelectedNode(n);
        });

        // Add new edges (deduplicate)
        const existingEdgeIds = new Set(edges.map((e) => e.id));
        const newEdges = toReactFlowEdges(apiEdges.filter((e) => !existingEdgeIds.has(e.id)));

        setNodes((prev) => [...prev, ...rfNewNodes]);
        setEdges((prev) => [...prev, ...newEdges]);
      } catch (err) {
        setError("Merge failed: " + (err.message || "Unknown error"));
      } finally {
        setLoading(false);
      }
    },
    [nodes, edges, setNodes, setEdges]
  );

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#0a0a0f",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* ===== HEADER ===== */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background: "rgba(10,10,15,0.85)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(123,111,255,0.2)",
          padding: "14px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Top row: logo + stats */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "radial-gradient(circle, #00ffcc, #4a3aaa)",
                boxShadow: "0 0 16px rgba(0,255,204,0.4)",
              }}
            />
            <div>
              <div
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontWeight: "bold",
                  fontSize: 14,
                  color: "#e0d8ff",
                  letterSpacing: 2,
                }}
              >
                GRAPH INTEL
              </div>
              <div style={{ fontSize: 10, color: "rgba(224,216,255,0.4)", fontFamily: "monospace" }}>
                {currentSeed ? `SEED: ${currentSeed}` : "INTELLIGENCE SYSTEM"}
              </div>
            </div>
          </div>
          <StatsBar />
        </div>

        {/* Search row */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <SearchBar onSearch={loadGraph} loading={loading} />
          </div>

          {/* Depth selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: "rgba(224,216,255,0.5)", fontFamily: "monospace" }}>
              DEPTH
            </span>
            {[1, 2, 3, 4, 5].map((d) => (
              <button
                key={d}
                onClick={() => setDepthSetting(d)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background:
                    depthSetting === d
                      ? "linear-gradient(135deg, #7b6fff, #4a3aaa)"
                      : "rgba(255,255,255,0.05)",
                  border:
                    depthSetting === d
                      ? "1px solid #7b6fff"
                      : "1px solid rgba(255,255,255,0.1)",
                  color: depthSetting === d ? "#fff" : "rgba(224,216,255,0.5)",
                  fontSize: 12,
                  fontFamily: "monospace",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              background: "rgba(255,107,157,0.1)",
              border: "1px solid rgba(255,107,157,0.3)",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 12,
              color: "#ff6b9d",
              fontFamily: "monospace",
            }}
          >
            ⚠️ {error}
          </div>
        )}
      </div>

      <GraphView
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onPaneClick={() => setSelectedNode(null)}
        topPadding={error ? 160 : 130}
      />

      {/* ===== TYPE FILTER PANEL ===== */}
      {nodes.length > 0 && (
        <TypeFilterPanel
          typeCounts={typeCounts}
          activeFilters={activeTypeFilters}
          onToggle={handleToggleFilter}
          onClearAll={handleClearFilters}
        />
      )}

      {/* ===== EMPTY STATE ===== */}
      {nodes.length === 0 && !loading && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            pointerEvents: "none",
            marginTop: 40,
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(0,255,204,0.2), transparent)",
              border: "2px dashed rgba(0,255,204,0.3)",
              margin: "0 auto 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
            }}
          >
            🧠
          </div>
          <div
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 16,
              color: "rgba(224,216,255,0.5)",
              marginBottom: 8,
            }}
          >
            Enter any value to explore
          </div>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 12,
              color: "rgba(224,216,255,0.25)",
            }}
          >
            phone • email • name • city • anything
          </div>
        </div>
      )}

      {/* ===== LOADING OVERLAY ===== */}
      {loading && (
        <div
          style={{
            position: "absolute",
            bottom: 20,
            right: 20,
            background: "rgba(12,12,24,0.95)",
            border: "1px solid rgba(123,111,255,0.4)",
            borderRadius: 10,
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            zIndex: 200,
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              border: "2px solid #7b6fff",
              borderTopColor: "transparent",
              animation: "spin 0.7s linear infinite",
            }}
          />
          <span style={{ fontFamily: "monospace", fontSize: 12, color: "#7b6fff" }}>
            Building graph…
          </span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ===== HISTORY PILLS ===== */}
      {history.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 6,
            zIndex: 50,
          }}
        >
          {history.slice(-5).map((h, i) => (
            <button
              key={i}
              onClick={() => loadGraph(h)}
              style={{
                background: "rgba(12,12,24,0.9)",
                border: "1px solid rgba(123,111,255,0.3)",
                borderRadius: 20,
                padding: "5px 12px",
                color: "rgba(224,216,255,0.6)",
                fontSize: 11,
                fontFamily: "monospace",
                cursor: "pointer",
                transition: "all 0.15s",
                maxWidth: 120,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                e.target.style.borderColor = "rgba(123,111,255,0.8)";
                e.target.style.color = "#e0d8ff";
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = "rgba(123,111,255,0.3)";
                e.target.style.color = "rgba(224,216,255,0.6)";
              }}
              title={h}
            >
              {h.length > 14 ? h.slice(0, 14) + "…" : h}
            </button>
          ))}
        </div>
      )}

      {/* ===== NODE DETAIL PANEL ===== */}
      <NodePanel
        key={selectedNode?.id}
        node={selectedNode}
        onExpand={handleExpand}
        onClose={() => setSelectedNode(null)}
      />
    </div>
  );
}
