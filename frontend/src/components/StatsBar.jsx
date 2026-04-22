import React, { useEffect, useState } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "";

export default function StatsBar() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await axios.get(`${API}/stats`);
        setStats(res.data);
      } catch {}
    };
    fetch();
    const interval = setInterval(fetch, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) return null;

  const dot = stats.sync?.synced
    ? { color: "#00ffcc", label: "LIVE" }
    : stats.sync?.syncing
    ? { color: "#ffd700", label: "SYNCING…" }
    : { color: "#ff6b9d", label: "OFFLINE" };

  return (
    <div
      style={{
        display: "flex",
        gap: 20,
        alignItems: "center",
        fontSize: 11,
        fontFamily: "'Space Mono', monospace",
        color: "rgba(224,216,255,0.6)",
      }}
    >
      <span>
        <span style={{ color: "#7b6fff" }}>NODES</span>{" "}
        {stats.graph?.nodes?.toLocaleString() || "—"}
      </span>
      <span>
        <span style={{ color: "#7b6fff" }}>EDGES</span>{" "}
        {stats.graph?.edges?.toLocaleString() || "—"}
      </span>
      <span>
        <span style={{ color: "#7b6fff" }}>RAM</span>{" "}
        {stats.memory?.rssMB || "—"}MB
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: dot.color,
            display: "inline-block",
            boxShadow: `0 0 6px ${dot.color}`,
            animation: dot.label === "SYNCING…" ? "pulse 1s infinite" : "none",
          }}
        />
        <span style={{ color: dot.color }}>{dot.label}</span>
      </span>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  );
}
