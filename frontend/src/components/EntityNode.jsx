import React, { memo } from "react";
import { Handle, Position } from "reactflow";

const COLORS = {
  seed: "#00ffcc",
  entity: "#7b6fff",
  hover: "#ff6b9d",
};

function truncate(str, max = 20) {
  if (!str) return "";
  return str.length > max ? `${str.slice(0, max)}...` : str;
}

const EntityNode = memo(({ data, selected }) => {
  const { label, isSeed, connections, onClick } = data;

  const size = isSeed ? 64 : Math.max(44, Math.min(60, 44 + connections * 2));
  const color = isSeed ? COLORS.seed : COLORS.entity;
  const fontSize = isSeed ? 11 : 10;

  return (
    <div
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: isSeed
          ? "radial-gradient(circle at 30% 30%, #00ffee, #00aa88)"
          : "radial-gradient(circle at 30% 30%, #9b8fff, #4a3aaa)",
        border: selected
          ? `2px solid ${COLORS.hover}`
          : isSeed
            ? `2px solid ${color}`
            : "1.5px solid rgba(123,111,255,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: isSeed
          ? "0 0 20px rgba(0,255,204,0.5), 0 0 40px rgba(0,255,204,0.2)"
          : selected
            ? "0 0 15px rgba(255,107,157,0.5)"
            : "0 0 10px rgba(123,111,255,0.3)",
        transition: "all 0.2s ease",
        userSelect: "none",
        position: "relative",
      }}
      title={label}
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

      <span
        style={{
          fontSize,
          fontFamily: "'Space Mono', monospace",
          fontWeight: "bold",
          color: isSeed ? "#001a15" : "#e0d8ff",
          textAlign: "center",
          padding: "0 4px",
          lineHeight: 1.2,
          wordBreak: "break-all",
          maxWidth: size - 10,
        }}
      >
        {truncate(label, isSeed ? 12 : 10)}
      </span>

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
