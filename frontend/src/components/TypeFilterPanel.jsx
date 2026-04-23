import React, { useState } from "react";

const CATEGORY_GROUPS = {
  "👤 Identity":  ["name", "phone", "email", "national_id", "device_id"],
  "📱 Social":    ["facebook", "instagram", "twitter_x", "telegram", "tiktok", "discord", "snapchat", "linkedin", "reddit", "whatsapp", "viber", "line"],
  "🎧 Streaming": ["spotify", "youtube", "twitch", "netflix", "apple_music", "youtube_music", "steam", "epic_games", "xbox", "playstation"],
  "💰 Finance":   ["crypto_btc", "crypto_eth", "crypto_other", "paypal", "bank_account", "upi"],
  "🌐 Network":   ["ip_address", "domain", "url", "username"],
  "📍 Location":  ["address", "city", "coordinates", "postcode", "country"],
  "🔴 Google":    ["google_account", "google_maps", "google_drive"],
};

const TYPE_COLORS = {
  name: "#00d4ff", phone: "#00ff9d", email: "#ff9d00",
  google_account: "#ea4335", facebook: "#1877f2", instagram: "#e1306c",
  twitter_x: "#888", telegram: "#2aabee", linkedin: "#0077b5",
  tiktok: "#ff0050", snapchat: "#fffc00", discord: "#5865f2",
  spotify: "#1db954", twitch: "#9146ff", steam: "#4c9ded",
  crypto_btc: "#f7931a", crypto_eth: "#627eea", crypto_other: "#e84142",
  paypal: "#003087", bank_account: "#00b894", upi: "#6c5ce7",
  ip_address: "#fd79a8", domain: "#a29bfe", url: "#74b9ff",
  address: "#55efc4", unknown: "#7b6fff",
};

export default function TypeFilterPanel({ typeCounts = {}, activeFilters = new Set(), onToggle, onClearAll }) {
  const [open, setOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(new Set(["👤 Identity"]));

  const totalActive = activeFilters.size;

  const toggleGroup = (group) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 0,
      }}
    >
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Filter by entity type"
        style={{
          background: totalActive > 0
            ? "linear-gradient(135deg, #7b6fff, #4a3aaa)"
            : "rgba(12,12,24,0.92)",
          border: "1px solid rgba(123,111,255,0.5)",
          borderRadius: open ? "8px 8px 0 0" : 8,
          padding: "8px 12px",
          color: "#e0d8ff",
          fontSize: 13,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "monospace",
          backdropFilter: "blur(12px)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
          transition: "all 0.15s",
          whiteSpace: "nowrap",
        }}
      >
        🔭
        <span style={{ fontSize: 11, letterSpacing: 1 }}>
          FILTER{totalActive > 0 ? ` (${totalActive})` : ""}
        </span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          style={{
            background: "rgba(12,12,24,0.97)",
            border: "1px solid rgba(123,111,255,0.4)",
            borderTop: "none",
            borderRadius: "0 8px 8px 8px",
            padding: "10px 8px",
            minWidth: 200,
            maxHeight: "60vh",
            overflowY: "auto",
            backdropFilter: "blur(16px)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
          }}
        >
          {totalActive > 0 && (
            <button
              onClick={onClearAll}
              style={{
                width: "100%",
                background: "rgba(255,107,157,0.12)",
                border: "1px solid rgba(255,107,157,0.35)",
                borderRadius: 6,
                padding: "5px 0",
                color: "#ff6b9d",
                fontSize: 10,
                fontFamily: "monospace",
                cursor: "pointer",
                marginBottom: 8,
                letterSpacing: 1,
              }}
            >
              ✕ CLEAR ALL FILTERS
            </button>
          )}

          {Object.entries(CATEGORY_GROUPS).map(([group, types]) => {
            const groupTypes = types.filter((t) => typeCounts[t] > 0);
            if (groupTypes.length === 0) return null;
            const isExpanded = expandedGroups.has(group);
            return (
              <div key={group} style={{ marginBottom: 4 }}>
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group)}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    borderRadius: 5,
                    padding: "4px 6px",
                    color: "rgba(224,216,255,0.7)",
                    fontSize: 11,
                    fontFamily: "monospace",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    letterSpacing: 0.5,
                  }}
                >
                  <span>{group}</span>
                  <span style={{ opacity: 0.5 }}>{isExpanded ? "▲" : "▼"}</span>
                </button>

                {isExpanded && (
                  <div style={{ paddingLeft: 4 }}>
                    {groupTypes.map((type) => {
                      const count = typeCounts[type] || 0;
                      const isActive = activeFilters.has(type);
                      const color = TYPE_COLORS[type] || "#7b6fff";
                      return (
                        <button
                          key={type}
                          onClick={() => onToggle(type)}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            width: "100%",
                            background: isActive
                              ? `${color}22`
                              : "transparent",
                            border: isActive
                              ? `1px solid ${color}66`
                              : "1px solid transparent",
                            borderRadius: 5,
                            padding: "3px 8px",
                            color: isActive ? color : "rgba(224,216,255,0.5)",
                            fontSize: 10,
                            fontFamily: "monospace",
                            cursor: "pointer",
                            transition: "all 0.12s",
                            marginBottom: 2,
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.background = `${color}11`;
                              e.currentTarget.style.color = "rgba(224,216,255,0.8)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.background = "transparent";
                              e.currentTarget.style.color = "rgba(224,216,255,0.5)";
                            }
                          }}
                        >
                          <span>{type}</span>
                          <span
                            style={{
                              background: isActive ? color : "rgba(123,111,255,0.2)",
                              color: isActive ? "#fff" : "rgba(224,216,255,0.5)",
                              borderRadius: 10,
                              padding: "1px 5px",
                              fontSize: 9,
                              fontWeight: "bold",
                            }}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
