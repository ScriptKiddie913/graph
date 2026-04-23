import React, { useState, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "";

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
  const [holeheOpen, setHoleheOpen] = useState(false);
  const [holeheSites, setHoleheSites] = useState(null);
  const [holeheLoading, setHoleheLoading] = useState(false);
  const [holeheError, setHoleheError] = useState(null);

  const [linkedinOpen, setLinkedinOpen] = useState(false);
  const [linkedinResults, setLinkedinResults] = useState(null);
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [linkedinError, setLinkedinError] = useState(null);

  const isEmail = node?.type === "email" || node?.type === "google_account";
  const isName = node?.type === "name";

  const scanHolehe = useCallback(async () => {
    if (!node) return;
    if (holeheSites !== null) {
      setHoleheOpen((o) => !o);
      return;
    }
    setHoleheLoading(true);
    setHoleheError(null);
    setHoleheOpen(true);
    try {
      const res = await fetch(`${API}/holehe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: node.value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setHoleheSites(data.found || []);
    } catch (err) {
      setHoleheError(err.message);
      setHoleheSites([]);
    } finally {
      setHoleheLoading(false);
    }
  }, [node, holeheSites]);

  const searchLinkedin = useCallback(async () => {
    if (!node) return;
    if (linkedinResults !== null) {
      setLinkedinOpen((o) => !o);
      return;
    }
    setLinkedinLoading(true);
    setLinkedinError(null);
    setLinkedinOpen(true);
    try {
      const res = await fetch(`${API}/linkedin-search?name=${encodeURIComponent(node.value)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setLinkedinResults(data.results || []);
    } catch (err) {
      setLinkedinError(err.message);
      setLinkedinResults([]);
    } finally {
      setLinkedinLoading(false);
    }
  }, [node, linkedinResults]);

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

      {/* Holehe email scan */}
      {isEmail && (
        <div style={{ marginBottom: 8 }}>
          <button
            onClick={scanHolehe}
            disabled={holeheLoading}
            style={{
              width: "100%",
              background: "rgba(255,157,0,0.12)",
              border: "1px solid rgba(255,157,0,0.4)",
              borderRadius: 8,
              padding: "8px 0",
              color: "#ff9d00",
              fontSize: 11,
              fontFamily: "'Space Mono', monospace",
              fontWeight: "bold",
              cursor: holeheLoading ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              opacity: holeheLoading ? 0.7 : 1,
              transition: "opacity 0.2s",
            }}
          >
            {holeheLoading ? (
              <>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    border: "2px solid #ff9d00",
                    borderTopColor: "transparent",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
                Scanning…
              </>
            ) : (
              <>🔍 {holeheOpen && holeheSites !== null ? "▲" : "▼"} Account Scanner</>
            )}
          </button>

          {holeheOpen && (
            <div
              style={{
                marginTop: 4,
                background: "rgba(255,157,0,0.07)",
                border: "1px solid rgba(255,157,0,0.25)",
                borderRadius: 8,
                padding: "8px 10px",
                maxHeight: 180,
                overflowY: "auto",
              }}
            >
              {holeheError ? (
                <div style={{ fontSize: 11, color: "#ff6b9d", fontFamily: "monospace" }}>
                  ⚠️ {holeheError}
                </div>
              ) : holeheSites && holeheSites.length === 0 ? (
                <div style={{ fontSize: 11, color: "rgba(224,216,255,0.4)", fontFamily: "monospace" }}>
                  No accounts found
                </div>
              ) : (
                (holeheSites || []).map((site, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 11,
                      color: "#ff9d00",
                      fontFamily: "monospace",
                      padding: "3px 0",
                      borderBottom: i < holeheSites.length - 1 ? "1px solid rgba(255,157,0,0.1)" : "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span style={{ color: "#00ff9d" }}>✔</span> {site}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* LinkedIn name search */}
      {isName && (
        <div style={{ marginBottom: 8 }}>
          <button
            onClick={searchLinkedin}
            disabled={linkedinLoading}
            style={{
              width: "100%",
              background: "rgba(0,119,181,0.12)",
              border: "1px solid rgba(0,119,181,0.45)",
              borderRadius: 8,
              padding: "8px 0",
              color: "#0099d4",
              fontSize: 11,
              fontFamily: "'Space Mono', monospace",
              fontWeight: "bold",
              cursor: linkedinLoading ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              opacity: linkedinLoading ? 0.7 : 1,
              transition: "opacity 0.2s",
            }}
          >
            {linkedinLoading ? (
              <>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    border: "2px solid #0099d4",
                    borderTopColor: "transparent",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
                Searching…
              </>
            ) : (
              <>💼 {linkedinOpen && linkedinResults !== null ? "▲" : "▼"} LinkedIn Search</>
            )}
          </button>

          {linkedinOpen && (
            <div
              style={{
                marginTop: 4,
                background: "rgba(0,119,181,0.07)",
                border: "1px solid rgba(0,119,181,0.25)",
                borderRadius: 8,
                padding: "8px 10px",
                maxHeight: 220,
                overflowY: "auto",
              }}
            >
              {linkedinError ? (
                <div style={{ fontSize: 11, color: "#ff6b9d", fontFamily: "monospace" }}>
                  ⚠️ {linkedinError}
                </div>
              ) : linkedinResults && linkedinResults.length === 0 ? (
                <div style={{ fontSize: 11, color: "rgba(224,216,255,0.4)", fontFamily: "monospace" }}>
                  No LinkedIn profiles found
                </div>
              ) : (
                (linkedinResults || []).map((r, i) => (
                  <a
                    key={i}
                    href={r.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "block",
                      padding: "6px 0",
                      borderBottom: i < linkedinResults.length - 1 ? "1px solid rgba(0,119,181,0.15)" : "none",
                      textDecoration: "none",
                    }}
                  >
                    <div style={{ fontSize: 11, color: "#0099d4", fontFamily: "monospace", fontWeight: "bold" }}>
                      💼 {r.title}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "rgba(224,216,255,0.5)",
                        fontFamily: "monospace",
                        marginTop: 2,
                        lineHeight: 1.4,
                      }}
                    >
                      {r.snippet}
                    </div>
                  </a>
                ))
              )}
            </div>
          )}
        </div>
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
