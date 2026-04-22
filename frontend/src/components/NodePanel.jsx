import React from "react";

export default function NodePanel({ node, onExpand, onClose }) {
  if (!node) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 20,
        left: 20,
        width: 280,
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
        <div>
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
          marginBottom: 14,
        }}
      >
        {[
          ["TYPE", node.type || "entity"],
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
