// src/components/PoolTable.tsx
import React from "react";
import { PoolInfo } from "../services/coinGeckoService";

import "../styles/components/PoolTable.scss";

interface PoolTableProps {
  pools: PoolInfo[];
  sortColumn: "dex" | "liquidityUSD" | "volumeUSD" | "feesUSD" | "apr";
  sortOrder: "asc" | "desc";
  onSortChange: (column: PoolTableProps["sortColumn"]) => void;
  onDexChange: (dex: string | null) => void;
  onDeposit: (pool: PoolInfo) => void;
}

const PoolTable: React.FC<PoolTableProps> = ({
  pools,
  sortColumn,
  sortOrder,
  onSortChange,
  onDexChange,
  onDeposit,
}) => {
  return (
    <div className="pool-table-container">
      <table className="pool-table">
        <thead>
          <tr>
            <th onClick={() => onSortChange("dex")}>
              DEX
              {sortColumn === "dex" && (
                <span className="sort-indicator">
                  {sortOrder === "asc" ? "↑" : "↓"}
                </span>
              )}
            </th>
            <th onClick={() => onSortChange("liquidityUSD")}>
              Liquidity (USD)
              {sortColumn === "liquidityUSD" && (
                <span className="sort-indicator">
                  {sortOrder === "asc" ? "↑" : "↓"}
                </span>
              )}
            </th>
            <th onClick={() => onSortChange("volumeUSD")}>
              Volume (24h)
              {sortColumn === "volumeUSD" && (
                <span className="sort-indicator">
                  {sortOrder === "asc" ? "↑" : "↓"}
                </span>
              )}
            </th>
            <th onClick={() => onSortChange("feesUSD")}>
              Fees (24h)
              {sortColumn === "feesUSD" && (
                <span className="sort-indicator">
                  {sortOrder === "asc" ? "↑" : "↓"}
                </span>
              )}
            </th>
            <th onClick={() => onSortChange("apr")}>
              APR
              {sortColumn === "apr" && (
                <span className="sort-indicator">
                  {sortOrder === "asc" ? "↑" : "↓"}
                </span>
              )}
            </th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {pools.length === 0 ? (
            <tr>
              <td colSpan={6} className="empty-state">
                No pools found
              </td>
            </tr>
          ) : (
            pools.map((pool) => {
              // Safely extract the fee tier (e.g. "0.3%") or fallback to "–"
              const feeMatch = pool.name.match(/(\d+(\.\d+)?)%/);
              const feeTier = feeMatch ? feeMatch[0] : "–";

              return (
                <tr key={pool.address} onClick={() => onDexChange(pool.dex)}>
                  <td>
                    <div className="pool-pair">
                      <div className="token-icons">
                        {pool.tokenAMetadata?.logoUrl ? (
                          <img
                            src={pool.tokenAMetadata.logoUrl}
                            alt={pool.tokenA}
                            className="token-logo"
                          />
                        ) : (
                          <div className="token-logo placeholder">
                            {pool.tokenA.charAt(0)}
                          </div>
                        )}
                        {pool.tokenBMetadata?.logoUrl ? (
                          <img
                            src={pool.tokenBMetadata.logoUrl}
                            alt={pool.tokenB}
                            className="token-logo"
                          />
                        ) : (
                          <div className="token-logo placeholder">
                            {pool.tokenB.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="pair-info">
                        <div className="pair-name">{pool.name}</div>
                        <div className="fee-tier">{feeTier}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {pool.liquidityUSD.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td>
                    {pool.volumeUSD.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td>
                    {pool.feesUSD.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td>{pool.apr.toFixed(2)}%</td>
                  <td>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeposit(pool);
                      }}
                    >
                      Deposit
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

export default PoolTable;
