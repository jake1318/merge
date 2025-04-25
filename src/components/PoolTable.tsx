import React from "react";
import { PoolInfo } from "../services/coinGeckoService";
import "../styles/components/PoolTable.scss";

interface Props {
  pools: PoolInfo[];
  sortColumn: keyof PoolInfo;
  sortOrder: "asc" | "desc";
  onSortChange: (col: keyof PoolInfo) => void;
  onDeposit: (pool: PoolInfo) => void;
}

const PoolTable: React.FC<Props> = ({
  pools,
  sortColumn,
  sortOrder,
  onSortChange,
  onDeposit,
}) => {
  const headers: Array<{ key: keyof PoolInfo | "action"; label: string }> = [
    { key: "dex", label: "DEX" },
    { key: "liquidityUSD", label: "Liquidity (USD)" },
    { key: "volumeUSD", label: "Volume (24h)" },
    { key: "feesUSD", label: "Fees (24h)" },
    { key: "apr", label: "APR" },
    { key: "action", label: "Action" },
  ];

  return (
    <table className="pool-table">
      <thead>
        <tr>
          {headers.map((h) => (
            <th
              key={h.key}
              onClick={() =>
                h.key !== "action" && onSortChange(h.key as keyof PoolInfo)
              }
            >
              {h.label}
              {sortColumn === h.key && (
                <span className="sort-indicator">
                  {sortOrder === "asc" ? "↑" : "↓"}
                </span>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {pools.length === 0 && (
          <tr>
            <td colSpan={6} className="empty">
              No pools found
            </td>
          </tr>
        )}
        {pools.map((p) => {
          // safely extract fee tier from name
          const m = p.name.match(/(\d+(\.\d+)?)%/);
          const feeTier = m ? m[0] : "";

          return (
            <tr key={p.address}>
              <td>
                <div className="pair">
                  <img
                    src={p.tokenAMetadata?.logoUrl}
                    alt={p.tokenA}
                    className="logo"
                  />
                  <img
                    src={p.tokenBMetadata?.logoUrl}
                    alt={p.tokenB}
                    className="logo"
                  />
                  <span className="name">{p.name}</span>
                  <span className="fee">{feeTier}</span>
                </div>
              </td>
              <td>{p.liquidityUSD.toLocaleString()}</td>
              <td>{p.volumeUSD.toLocaleString()}</td>
              <td>{p.feesUSD.toLocaleString()}</td>
              <td>{p.apr.toFixed(2)}%</td>
              <td>
                <button onClick={() => onDeposit(p)}>Deposit</button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export default PoolTable;
