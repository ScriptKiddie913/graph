import React, { memo, useState } from "react";
import { Handle, Position } from "reactflow";

// Favicon domains for known services — loaded from Google's public favicon CDN
const FAVICON_DOMAINS = {
  facebook:       "facebook.com",
  instagram:      "instagram.com",
  twitter_x:      "x.com",
  telegram:       "telegram.org",
  linkedin:       "linkedin.com",
  tiktok:         "tiktok.com",
  snapchat:       "snapchat.com",
  discord:        "discord.com",
  spotify:        "spotify.com",
  twitch:         "twitch.tv",
  steam:          "steampowered.com",
  youtube:        "youtube.com",
  netflix:        "netflix.com",
  reddit:         "reddit.com",
  paypal:         "paypal.com",
  google_account: "gmail.com",
  google_maps:    "maps.google.com",
  google_drive:   "drive.google.com",
  apple_music:    "music.apple.com",
  epic_games:     "epicgames.com",
  xbox:           "xbox.com",
  playstation:    "playstation.com",
  pinterest:      "pinterest.com",
};

function getFaviconUrl(entityType) {
  const domain = FAVICON_DOMAINS[entityType];
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

function truncate(str, max = 20) {
  if (!str) return "";
  return str.length > max ? `${str.slice(0, max)}...` : str;
}

const EntityNode = memo(({ data, selected }) => {
  const { label, isSeed, connections, entityType, icon, color, onClick } = data;
  const [faviconFailed, setFaviconFailed] = useState(false);
  const [hovered, setHovered] = useState(false);

  const size = isSeed ? 64 : Math.max(44, Math.min(60, 44 + connections * 2));
  const nodeColor = isSeed ? "#00ffcc" : (color || "#7b6fff");
  const faviconUrl = !isSeed && !faviconFailed ? getFaviconUrl(entityType) : null;

  // Build background gradient using the entity color
  const bg = isSeed
    ? "radial-gradient(circle at 30% 30%, #00ffee, #00aa88)"
    : `radial-gradient(circle at 30% 30%, ${nodeColor}55, ${nodeColor}22)`;

  const borderColor = selected
    ? "#ff6b9d"
    : hovered
      ? nodeColor
      : isSeed
        ? nodeColor
        : `${nodeColor}99`;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        border: `${selected || isSeed ? 2 : 1.5}px solid ${borderColor}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: isSeed
          ? `0 0 20px ${nodeColor}80, 0 0 40px ${nodeColor}30`
          : selected || hovered
            ? `0 0 14px ${nodeColor}66`
            : `0 0 8px ${nodeColor}33`,
        transition: "all 0.2s ease",
        userSelect: "none",
        position: "relative",
        overflow: "visible",
      }}
      title={`${label}${entityType ? ` (${entityType})` : ""}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ opacity: 0, width: 1, height: 1 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0, width: 1, height: 1 }}
      />

      {/* Favicon or emoji icon */}
      {!isSeed && faviconUrl ? (
        <img
          src={faviconUrl}
          alt={entityType}
          width={size > 52 ? 18 : 14}
          height={size > 52 ? 18 : 14}
          style={{ borderRadius: 3, marginBottom: 1, flexShrink: 0 }}
          onError={() => setFaviconFailed(true)}
        />
      ) : !isSeed && icon ? (
        <span style={{ fontSize: size > 52 ? 14 : 11, lineHeight: 1, marginBottom: 1 }}>
          {icon}
        </span>
      ) : null}

      <span
        style={{
          fontSize: isSeed ? 11 : 9,
          fontFamily: "'Space Mono', monospace",
          fontWeight: "bold",
          color: isSeed ? "#001a15" : "#e0d8ff",
          textAlign: "center",
          padding: "0 3px",
          lineHeight: 1.2,
          wordBreak: "break-all",
          maxWidth: size - 8,
        }}
      >
        {truncate(label, isSeed ? 12 : 9)}
      </span>

      {/* Type chip on hover */}
      {hovered && !isSeed && entityType && entityType !== "unknown" && (
        <div
          style={{
            position: "absolute",
            bottom: -20,
            left: "50%",
            transform: "translateX(-50%)",
            background: `${nodeColor}dd`,
            color: "#fff",
            borderRadius: 4,
            padding: "2px 6px",
            fontSize: 8,
            fontFamily: "monospace",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 10,
            boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
          }}
        >
          {entityType}
        </div>
      )}

      {connections > 1 && (
        <div
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            background: "#ff6b9d",
            color: "#fff",
            borderRadius: "50%",
            width: 18,
            height: 18,
            fontSize: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "monospace",
            fontWeight: "bold",
            boxShadow: "0 0 6px rgba(255,107,157,0.7)",
          }}
        >
          {connections > 99 ? "99+" : connections}
        </div>
      )}
    </div>
  );
});

export default EntityNode;
