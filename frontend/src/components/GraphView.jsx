import React, { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";

import EntityNode from "./EntityNode.jsx";

const nodeTypes = { entity: EntityNode };

export default function GraphView({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onPaneClick,
  topPadding = 130,
}) {
  const nodeColor = useMemo(
    () => (n) => (n.data?.isSeed ? "#00ffcc" : "rgba(123,111,255,0.6)"),
    []
  );

  return (
    <div style={{ width: "100%", height: "100%", paddingTop: topPadding }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={3}
        style={{ background: "transparent" }}
        defaultEdgeOptions={{
          style: { stroke: "rgba(123,111,255,0.3)", strokeWidth: 1.5 },
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="rgba(123,111,255,0.15)"
        />
        <Controls
          style={{
            background: "rgba(12,12,24,0.9)",
            border: "1px solid rgba(123,111,255,0.3)",
            borderRadius: 10,
          }}
        />
        <MiniMap
          nodeColor={nodeColor}
          style={{
            background: "rgba(12,12,24,0.9)",
            border: "1px solid rgba(123,111,255,0.3)",
            borderRadius: 10,
          }}
        />
      </ReactFlow>
    </div>
  );
}
