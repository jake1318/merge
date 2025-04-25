import React from "react";
import { PoolInfo } from "../services/coinGeckoService";

interface PoolRowProps {
  pool: PoolInfo;
  onDeposit: () => void;
}

const PoolRow: React.FC<PoolRowProps> = ({ pool, onDeposit }) => {
  // Format values for display
  const liquidityStr =
    pool.liquidityUSD !== undefined
      ? pool.liquidityUSD.toLocaleString(undefined, {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 2,
        })
      : "-";
  const volumeStr =
    pool.volumeUSD !== undefined
      ? pool.volumeUSD.toLocaleString(undefined, {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 2,
        })
      : "-";
  const feesStr =
    pool.feesUSD !== undefined
      ? pool.feesUSD.toLocaleString(undefined, {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 2,
        })
      : "-";
  const aprStr =
    pool.apr !== undefined
      ? `${parseFloat(pool.apr.toString()).toFixed(2)}%`
      : "-";
  // Fee tier string
  const feeTierStr =
    pool.fee !== undefined
      ? typeof pool.fee === "string"
        ? pool.fee
        : `${pool.fee}${pool.fee.toString().endsWith("%") ? "" : "%"}`
      : "";

  // Rewards tokens string (comma separated symbols)
  const rewardsStr =
    pool.rewardSymbols && pool.rewardSymbols.length > 0
      ? pool.rewardSymbols.join(", ")
      : "";

  return (
    <tr>
      <td>
        <span className="pool-name-cell">
          <span>{pool.name}</span>
          {feeTierStr && <span className="fee-tier">{feeTierStr}</span>}
        </span>
      </td>
      <td className="numeric">{liquidityStr}</td>
      <td className="numeric">{volumeStr}</td>
      <td className="numeric">{feesStr}</td>
      <td>{rewardsStr || "–"}</td>
      <td className="numeric">{aprStr}</td>
      <td>
        <button className="btn primary" onClick={onDeposit}>
          Deposit
        </button>
      </td>
    </tr>
  );
};

export default PoolRow;
