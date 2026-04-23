import React from "react";

const TYPE_ACTIONS = {
  facebook:    (v) => ({ label: "Open Profile", url: v.startsWith("http") ? v : `https://facebook.com/${v}` }),
  instagram:   (v) => ({ label: "Open Profile", url: v.startsWith("http") ? v : `https://instagram.com/${v}` }),
  twitter_x:   (v) => ({ label: "Open Profile", url: v.startsWith("http") ? v : `https://x.com/${v}` }),
  telegram:    (v) => ({ label: "Open Telegram", url: v.startsWith("http") ? v : `https://t.me/${v.replace("@", "")}` }),
  linkedin:    (v) => ({ label: "Open LinkedIn", url: v.startsWith("http") ? v : `https://linkedin.com/in/${v}` }),
  tiktok:      (v) => ({ label: "Open TikTok", url: v.startsWith("http") ? v : `https://tiktok.com/@${v}` }),
  snapchat:    (v) => ({ label: "Open Snapchat", url: v.startsWith("http") ? v : `https://snapchat.com/add/${v}` }),
  discord:     (v) => ({ label: "Open Discord", url: v.startsWith("http") ? v : `https://discord.com/users/${v}` }),
  reddit:      (v) => ({ label: "Open Reddit", url: v.startsWith("http") ? v : `https://reddit.com/u/${v}` }),
  spotify:     (v) => ({ label: "Open Spotify", url: v.startsWith("http") ? v : `https://open.spotify.com/user/${v}` }),
  twitch:      (v) => ({ label: "Open Twitch", url: v.startsWith("http") ? v : `https://twitch.tv/${v}` }),
  steam:       (v) => ({ label: "Open Steam", url: v.startsWith("http") ? v : `https://steamcommunity.com/id/${v}` }),
  youtube:     (v) => ({ label: "Open YouTube", url: v.startsWith("http") ? v : `https://youtube.com/@${v}` }),
  url:         (v) => ({ label: "Open URL", url: v }),
  domain:      (v) => ({ label: "Open Domain", url: `https://${v}` }),
  crypto_btc:  (v) => ({ label: "View on Explorer", url: `https://blockchair.com/bitcoin/address/${v}` }),
  crypto_eth:  (v) => ({ label: "View on Etherscan", url: `https://etherscan.io/address/${v}` }),
  google_account: (v) => ({ label: "Open Gmail", url: `https://mail.google.com` }),
  google_maps: (v) => ({ label: "Open in Maps", url: v.startsWith("http") ? v : `https://maps.google.com/search?q=${encodeURIComponent(v)}` }),
  google_drive:(v) => ({ label: "Open Drive", url: v.startsWith("http") ? v : `https://drive.google.com` }),
  email:       (v) => ({ label: "Send Email", url: `mailto:${v}` }),
  phone:       (v) => ({ label: "Call", url: `tel:${v}` }),
  ip_address:  (v) => ({ label: "IP Lookup", url: `https://ipinfo.io/${v}` }),
};

export default function NodePanel({ node, onExpand, onClose }) {
  if (!node) return null;

  const action = node.type && TYPE_ACTIONS[node.type]
    ? TYPE_ACTIONS[node.type](node.value)
    : null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 20,
        left: 20,
        width: 290,
        background: "rgba(12,12,24,0.95)",
        border: "1px solid rgba(123,111,255,0.5)",
        borderRadius: 12,
        padding: 16,
        zIndex: 100,
        backdropFilter: "blur(12px)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
        animation: "slideIn 0.2s ease",
      }}
    >
      <style>{`
        @keyframes slideIn { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: "#7b6fff", fontFamily: "monospace", marginBottom: 4, letterSpacing: 1 }}>
            SELECTED NODE
          </div>
          <div
            style={{
              fontSize: 15,
              fontFamily: "'Space Mono', monospace",
              fontWeight: "bold",
              color: "#e0d8ff",
              wordBreak: "break-all",
            }}
          >
            {node.value}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(224,216,255,0.4)",
            cursor: "pointer",
            fontSize: 18,
            padding: "0 4px",
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: 12,
        }}
      >
        {[
          ["TYPE", node.type || "unknown"],
          ["CONNECTIONS", node.connections ?? "?"],
        ].map(([label, val]) => (
          <div
            key={label}
            style={{
              background: "rgba(123,111,255,0.1)",
              borderRadius: 8,
              padding: "8px 10px",
            }}
          >
            <div style={{ fontSize: 9, color: "#7b6fff", fontFamily: "monospace", letterSpacing: 1 }}>
              {label}
            </div>
            <div style={{ fontSize: 13, color: "#e0d8ff", fontFamily: "monospace", marginTop: 2 }}>
              {val}
            </div>
          </div>
        ))}
      </div>

      {/* Type-specific action button */}
      {action && (
        <a
          href={action.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            textAlign: "center",
            background: "rgba(0,212,255,0.12)",
            border: "1px solid rgba(0,212,255,0.35)",
            borderRadius: 8,
            padding: "8px 0",
            color: "#00d4ff",
            fontSize: 11,
            fontFamily: "'Space Mono', monospace",
            fontWeight: "bold",
            cursor: "pointer",
            textDecoration: "none",
            marginBottom: 8,
            transition: "opacity 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          🔗 {action.label}
        </a>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => onExpand(node.value, 2)}
          style={{
            flex: 1,
            background: "linear-gradient(135deg, #7b6fff, #4a3aaa)",
            border: "none",
            borderRadius: 8,
            padding: "9px 0",
            color: "#fff",
            fontSize: 11,
            fontFamily: "'Space Mono', monospace",
            fontWeight: "bold",
            cursor: "pointer",
            transition: "opacity 0.2s",
          }}
          onMouseEnter={(e) => (e.target.style.opacity = "0.8")}
          onMouseLeave={(e) => (e.target.style.opacity = "1")}
        >
          EXPAND (2)
        </button>
        <button
          onClick={() => onExpand(node.value, 3)}
          style={{
            flex: 1,
            background: "rgba(0,255,204,0.15)",
            border: "1px solid rgba(0,255,204,0.4)",
            borderRadius: 8,
            padding: "9px 0",
            color: "#00ffcc",
            fontSize: 11,
            fontFamily: "'Space Mono', monospace",
            fontWeight: "bold",
            cursor: "pointer",
            transition: "opacity 0.2s",
          }}
          onMouseEnter={(e) => (e.target.style.opacity = "0.7")}
          onMouseLeave={(e) => (e.target.style.opacity = "1")}
        >
          EXPAND (3)
        </button>
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: 10,
          color: "rgba(224,216,255,0.3)",
          fontFamily: "monospace",
          wordBreak: "break-all",
        }}
      >
        ID: {node.id}
      </div>
    </div>
  );
}
