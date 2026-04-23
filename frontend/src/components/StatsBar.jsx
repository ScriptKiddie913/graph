import React, { useEffect, useState } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "";

const TYPE_COLORS = {
  name: "#00d4ff", phone: "#00ff9d", email: "#ff9d00",
  google_account: "#ea4335", facebook: "#1877f2", instagram: "#e1306c",
  twitter_x: "#888", telegram: "#2aabee", linkedin: "#0077b5",
  tiktok: "#ff0050", snapchat: "#fffc00", discord: "#5865f2",
  spotify: "#1db954", twitch: "#9146ff", steam: "#4c9ded",
  crypto_btc: "#f7931a", crypto_eth: "#627eea", crypto_other: "#e84142",
  paypal: "#003087", bank_account: "#00b894", upi: "#6c5ce7",
  ip_address: "#fd79a8", domain: "#a29bfe", url: "#74b9ff",
  address: "#55efc4",
};

export default function StatsBar() {
  const [stats, setStats] = useState(null);
  const [typeStats, setTypeStats] = useState([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await axios.get(`${API}/stats`);
        setStats(res.data);
      } catch {}
    };

    const fetchTypes = async () => {
      try {
        const res = await axios.get(`${API}/types`);
        setTypeStats(res.data.types?.slice(0, 5) || []);
      } catch {}
    };

    fetchStats();
    fetchTypes();

    const statsInterval = setInterval(fetchStats, 15000);
    const typesInterval = setInterval(fetchTypes, 30000);
    return () => {
      clearInterval(statsInterval);
      clearInterval(typesInterval);
    };
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
        gap: 16,
        alignItems: "center",
        fontSize: 11,
        fontFamily: "'Space Mono', monospace",
        color: "rgba(224,216,255,0.6)",
        flexWrap: "wrap",
        justifyContent: "flex-end",
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

      {/* Top-5 type distribution pills */}
      {typeStats.length > 0 && (
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {typeStats.map(({ type, count }) => {
            const color = TYPE_COLORS[type] || "#7b6fff";
            return (
              <span
                key={type}
                title={`${type}: ${count}`}
                style={{
                  background: `${color}22`,
                  border: `1px solid ${color}55`,
                  color,
                  borderRadius: 10,
                  padding: "2px 7px",
                  fontSize: 9,
                  fontFamily: "monospace",
                  whiteSpace: "nowrap",
                  cursor: "default",
                }}
              >
                {type} <span style={{ opacity: 0.75 }}>{count.toLocaleString()}</span>
              </span>
            );
          })}
        </div>
      )}

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
