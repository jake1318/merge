import React from "react";
import { PoolInfo } from "../services/coinGeckoService";

interface PoolRowProps {
  pool: PoolInfo;
  onDeposit: () => void;
}

const PoolRow: React.FC<PoolRowProps> = ({ pool, onDeposit }) => {
  // Format numeric values for display
  const liquidityStr =
    pool.liquidityUSD !== undefined
      ? pool.liquidityUSD.toLocaleString(undefined, {
          maximumFractionDigits: 2,
        })
      : "-";
  const volumeStr =
    pool.volumeUSD !== undefined
      ? pool.volumeUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : "-";
  const feesStr =
    pool.feesUSD !== undefined
      ? pool.feesUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : "-";
  const aprStr = pool.apr !== undefined ? pool.apr.toFixed(2) + "%" : "-";

  // Capitalize pool.dex for display
  const dexName = pool.dex.charAt(0).toUpperCase() + pool.dex.slice(1);

  // Extract fee tier percentage from pool name (if present)
  const feeTierMatch = pool.name.match(/(\d+(\.\d+)?)%/);
  const feeTier = feeTierMatch ? feeTierMatch[0] : "";

  return (
    <tr onClick={onDeposit}>
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
              <span className="token-fallback">{pool.tokenA.charAt(0)}</span>
            )}
            {pool.tokenBMetadata?.logoUrl ? (
              <img
                src={pool.tokenBMetadata.logoUrl}
                alt={pool.tokenB}
                className="token-logo"
              />
            ) : (
              <span className="token-fallback">{pool.tokenB.charAt(0)}</span>
            )}
          </div>
          <div>
            <div className="pair-name">{pool.name}</div>
            {feeTier && <div className="fee-tier">{feeTier}</div>}
          </div>
        </div>
      </td>
      <td>{liquidityStr}</td>
      <td>{volumeStr}</td>
      <td>{feesStr}</td>
      <td>{aprStr}</td>
      <td>
        <button type="button">Deposit</button>
      </td>
    </tr>
  );
};

export default PoolRow;
