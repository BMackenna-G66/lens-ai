import React, { useMemo } from 'react';

interface NetworkNode {
  id: string;
  label: string;
  type: 'primary' | 'counterparty' | 'exchange' | 'unknown';
  value: number; // USD value
  txCount: number;
}

interface NetworkEdge {
  source: string;
  target: string;
  value: number;
  direction: 'in' | 'out';
}

interface TransactionNetworkGraphProps {
  walletAddress: string;
  transactions: any[];
}

export const TransactionNetworkGraph: React.FC<TransactionNetworkGraphProps> = ({ walletAddress, transactions }) => {
  const { nodes, edges } = useMemo(() => {
    const nodeMap = new Map<string, NetworkNode>();
    const edgeList: NetworkEdge[] = [];

    // Primary wallet node
    nodeMap.set(walletAddress, {
      id: walletAddress,
      label: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
      type: 'primary',
      value: 0,
      txCount: transactions.length,
    });

    transactions.slice(0, 20).forEach((tx: any) => {
      const counterparty = tx.from?.toLowerCase() === walletAddress.toLowerCase() ? tx.to : tx.from;
      if (!counterparty) return;

      if (!nodeMap.has(counterparty)) {
        nodeMap.set(counterparty, {
          id: counterparty,
          label: `${counterparty.slice(0, 6)}...${counterparty.slice(-4)}`,
          type: 'counterparty',
          value: parseFloat(tx.value || '0'),
          txCount: 1,
        });
      } else {
        const node = nodeMap.get(counterparty)!;
        node.txCount += 1;
        node.value += parseFloat(tx.value || '0');
      }

      const direction = tx.from?.toLowerCase() === walletAddress.toLowerCase() ? 'out' : 'in';
      edgeList.push({
        source: direction === 'out' ? walletAddress : counterparty,
        target: direction === 'out' ? counterparty : walletAddress,
        value: parseFloat(tx.value || '0'),
        direction,
      });
    });

    return { nodes: Array.from(nodeMap.values()), edges: edgeList };
  }, [walletAddress, transactions]);

  // Calculate node positions in a circle
  const width = 600;
  const height = 400;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 140;

  const nodePositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    positions[walletAddress] = { x: centerX, y: centerY };

    const counterparties = nodes.filter(n => n.type !== 'primary');
    counterparties.forEach((node, i) => {
      const angle = (i / counterparties.length) * 2 * Math.PI - Math.PI / 2;
      positions[node.id] = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      };
    });
    return positions;
  }, [nodes, walletAddress, centerX, centerY, radius]);

  if (transactions.length === 0) return null;

  return (
    <div className="mt-6 p-5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">🕸️ Red de Transacciones</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Visualización de las últimas {Math.min(20, transactions.length)} transacciones</p>

      <div className="overflow-x-auto">
        <svg width={width} height={height} className="mx-auto">
          {/* Arrow markers */}
          <defs>
            <marker id="arrow-in" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="#10b981" />
            </marker>
            <marker id="arrow-out" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="#f59e0b" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((edge, i) => {
            const source = nodePositions[edge.source];
            const target = nodePositions[edge.target];
            if (!source || !target) return null;
            return (
              <line
                key={i}
                x1={source.x} y1={source.y}
                x2={target.x} y2={target.y}
                stroke={edge.direction === 'in' ? '#10b981' : '#f59e0b'}
                strokeWidth={1.5}
                strokeOpacity={0.5}
                markerEnd={`url(#arrow-${edge.direction})`}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const pos = nodePositions[node.id];
            if (!pos) return null;
            const isPrimary = node.type === 'primary';
            return (
              <g key={node.id}>
                <circle
                  cx={pos.x} cy={pos.y}
                  r={isPrimary ? 28 : Math.min(18, 8 + node.txCount * 2)}
                  fill={isPrimary ? '#4f46e5' : '#64748b'}
                  stroke={isPrimary ? '#312e81' : '#475569'}
                  strokeWidth={2}
                  opacity={0.9}
                />
                <text
                  x={pos.x} y={isPrimary ? pos.y + 5 : pos.y + 4}
                  textAnchor="middle"
                  fill="white"
                  fontSize={isPrimary ? 9 : 8}
                  fontWeight="bold"
                >
                  {node.label}
                </text>
                {node.txCount > 1 && !isPrimary && (
                  <text
                    x={pos.x} y={pos.y - (Math.min(18, 8 + node.txCount * 2)) - 4}
                    textAnchor="middle"
                    fill="#64748b"
                    fontSize={9}
                  >
                    {node.txCount} txs
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 mt-3 justify-center text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-500 inline-block"></span>Entrada</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-amber-500 inline-block"></span>Salida</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-indigo-600 inline-block"></span>Tu wallet</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-slate-500 inline-block"></span>Contrapartes</span>
      </div>
    </div>
  );
};
