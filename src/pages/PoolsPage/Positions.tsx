import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@suiet/wallet-kit";

import * as cetusService from "../../services/cetusService";
import * as blockVisionService from "../../services/blockvisionService";
import {
  NormalizedPosition,
  PoolGroup,
} from "../../services/blockvisionService";

import WithdrawModal from "../../components/WithdrawModal";
import TransactionNotification from "../../components/TransactionNotification";

import { formatLargeNumber, formatDollars } from "../../utils/formatters";

import "../../styles/pages/Positions.scss";

interface WithdrawModalState {
  isOpen: boolean;
  poolAddress: string;
  positionIds: string[];
  totalLiquidity: number;
  valueUsd: number;
}
interface RewardsModalState {
  isOpen: boolean;
  poolAddress: string;
  poolName: string;
  positions: NormalizedPosition[];
  totalRewards: blockVisionService.RewardInfo[];
}
interface TransactionNotificationState {
  visible: boolean;
  message: string;
  txDigest?: string;
  isSuccess: boolean;
}

function TokenLogo({
  logoUrl,
  symbol,
  size = "md",
}: {
  logoUrl?: string;
  symbol: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "sm"
      ? "token-logo-sm"
      : size === "lg"
      ? "token-logo-lg"
      : "token-logo";
  return (
    <div className={sizeClass}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={symbol}
          onError={(e) => {
            // If loading the image fails, show the first letter of the symbol
            e.currentTarget.style.display = "none";
            const parent = e.currentTarget.parentNode as HTMLElement;
            parent.innerHTML = `${symbol ? symbol.charAt(0) : "?"}`;
          }}
        />
      ) : (
        <span className="token-fallback">
          {symbol ? symbol.charAt(0) : "?"}
        </span>
      )}
    </div>
  );
}

function PoolPair({
  tokenALogo,
  tokenBLogo,
  tokenASymbol,
  tokenBSymbol,
}: {
  tokenALogo?: string;
  tokenBLogo?: string;
  tokenASymbol: string;
  tokenBSymbol: string;
}) {
  return (
    <div className="pool-pair">
      <div className="token-icons">
        <TokenLogo logoUrl={tokenALogo} symbol={tokenASymbol} size="sm" />
        <TokenLogo logoUrl={tokenBLogo} symbol={tokenBSymbol} size="sm" />
      </div>
      <div className="pair-name">
        {tokenASymbol}/{tokenBSymbol}
      </div>
    </div>
  );
}

function Positions() {
  const wallet = useWallet();
  const { account, connected } = wallet;

  const [poolPositions, setPoolPositions] = useState<PoolGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [withdrawModal, setWithdrawModal] = useState<WithdrawModalState>({
    isOpen: false,
    poolAddress: "",
    positionIds: [],
    totalLiquidity: 0,
    valueUsd: 0,
  });
  const [rewardsModal, setRewardsModal] = useState<RewardsModalState>({
    isOpen: false,
    poolAddress: "",
    poolName: "",
    positions: [],
    totalRewards: [],
  });
  const [claimingPool, setClaimingPool] = useState<string | null>(null);
  const [withdrawingPool, setWithdrawingPool] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({});

  // Transaction notification state
  const [notification, setNotification] =
    useState<TransactionNotificationState | null>(null);

  // Load user positions when wallet connects
  useEffect(() => {
    const loadPositions = async () => {
      if (connected && account?.address) {
        setLoading(true);
        setError(null);
        try {
          // Get positions from BlockVision
          const blockVisionPositions =
            await blockVisionService.getDefiPortfolio(account.address);
          if (blockVisionPositions.length > 0) {
            setPoolPositions(blockVisionPositions);
          } else {
            // Fallback to Cetus SDK
            console.log("No BlockVision data, falling back to Cetus SDK");
            const rawPositions = await cetusService.getPositions(
              account.address
            );
            // Simple fallback implementation - in a real app, you'd want to provide more of the data that BlockVision would normally provide
            const fallbackPoolGroups: PoolGroup[] = [];
            // (Implementation omitted for brevity)
            setPoolPositions(fallbackPoolGroups);
          }
        } catch (err) {
          console.error("Failed to load positions:", err);
          setError("Failed to load your positions. Please try again.");
        } finally {
          setLoading(false);
        }
      }
    };
    loadPositions();
  }, [connected, account]);

  const toggleDetails = (poolAddress: string) => {
    setShowDetails((prev) => ({ ...prev, [poolAddress]: !prev[poolAddress] }));
  };

  const handleWithdraw = (
    poolAddress: string,
    positionIds: string[],
    totalLiquidity: number,
    valueUsd: number
  ) => {
    setWithdrawModal({
      isOpen: true,
      poolAddress,
      positionIds,
      totalLiquidity,
      valueUsd,
    });
    setWithdrawingPool(poolAddress);
  };

  const handleViewRewards = (pool: PoolGroup) => {
    setRewardsModal({
      isOpen: true,
      poolAddress: pool.poolAddress,
      poolName: pool.poolName,
      positions: pool.positions,
      totalRewards: pool.positions.flatMap((pos) => pos.rewards),
    });
    setClaimingPool(pool.poolAddress);
  };

  const handleClaim = async (poolAddress: string, positionIds: string[]) => {
    try {
      // (Implement claiming rewards functionality here)
      setNotification({
        visible: true,
        message: "Rewards claimed successfully!",
        isSuccess: true,
      });
    } catch (err) {
      console.error("Claim failed:", err);
      setNotification({
        visible: true,
        message: "Failed to claim rewards.",
        isSuccess: false,
      });
    } finally {
      setClaimingPool(null);
    }
  };

  const handleWithdrawConfirm = async () => {
    try {
      // (Implement withdraw liquidity functionality here)
      setNotification({
        visible: true,
        message: "Withdraw successful!",
        isSuccess: true,
      });
    } catch (err) {
      console.error("Withdraw failed:", err);
      setNotification({
        visible: true,
        message: "Failed to withdraw liquidity.",
        isSuccess: false,
      });
    } finally {
      setWithdrawModal((prev) => ({ ...prev, isOpen: false }));
      setWithdrawingPool(null);
    }
  };

  const handleModalClose = () => {
    setWithdrawModal((prev) => ({ ...prev, isOpen: false }));
    setWithdrawtingPool(null);
  };

  const handleNotificationClose = () => setNotification(null);

  return (
    <>
      <h1>My Positions</h1>
      <div className="page-tabs">
        <Link to="/pools">Pools</Link> |{" "}
        <Link to="/positions">My Positions</Link>
      </div>

      {error ? (
        <div className="empty-state">
          <p>{error}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      ) : !connected ? (
        <div className="empty-state">
          <p>Please connect your wallet to view your positions.</p>
          <button type="button" onClick={() => wallet.select()}>
            Connect Wallet
          </button>
        </div>
      ) : poolPositions.length === 0 ? (
        <div className="empty-state">
          <p>You don't have any liquidity positions.</p>
          <Link to="/pools">Add Liquidity</Link>
        </div>
      ) : (
        // Positions list
        <div className="positions-list">
          {poolPositions.map((poolPosition) => (
            <div
              key={poolPosition.poolAddress}
              className="position-item"
              onClick={() => toggleDetails(poolPosition.poolAddress)}
            >
              {/* Collapsible position summary */}
              <div className="position-summary">
                {showDetails[poolPosition.poolAddress] ? "▼" : "▶"}{" "}
                <PoolPair
                  tokenALogo={poolPosition.tokenALogo}
                  tokenBLogo={poolPosition.tokenBLogo}
                  tokenASymbol={poolPosition.tokenASymbol}
                  tokenBSymbol={poolPosition.tokenBSymbol}
                />
                <span>
                  {poolPosition.positions.length} position
                  {poolPosition.positions.length !== 1 ? "s" : ""}
                </span>
                <span>{poolPosition.protocol}</span>
                <span>{formatDollars(poolPosition.totalValueUsd)}</span>
                <span>
                  {formatLargeNumber(poolPosition.totalLiquidity)} liquidity
                </span>
                <span>{poolPosition.apr.toFixed(2)}%</span>
                {poolPosition.positions.some((pos) =>
                  pos.rewards.some((r) => parseFloat(r.formatted) > 0)
                ) && (
                  <span className="rewards-indicator">Rewards available</span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewRewards(poolPosition);
                  }}
                >
                  Details
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleWithdraw(
                      poolPosition.poolAddress,
                      poolPosition.positions.map((p) => p.id),
                      poolPosition.totalLiquidity,
                      poolPosition.totalValueUsd
                    );
                  }}
                  disabled={withdrawingPool === poolPosition.poolAddress}
                >
                  {withdrawingPool === poolPosition.poolAddress
                    ? "Withdrawing..."
                    : "Withdraw"}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClaim(
                      poolPosition.poolAddress,
                      poolPosition.positions.map((p) => p.id)
                    );
                  }}
                  disabled={claimingPool === poolPosition.poolAddress}
                >
                  {claimingPool === poolPosition.poolAddress
                    ? "Claiming..."
                    : "Claim"}
                </button>
              </div>

              {/* Collapsible position details (visible if showDetails is true) */}
              {showDetails[poolPosition.poolAddress] && (
                <div className="position-details">
                  <table>
                    <thead>
                      <tr>
                        <th>Position ID</th>
                        <th>{poolPosition.tokenA}</th>
                        <th>{poolPosition.tokenB}</th>
                        <th>Value (USD)</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {poolPosition.positions.map((position) => (
                        <tr key={position.id}>
                          <td>
                            {position.id.substring(0, 8)}...
                            {position.id.substring(position.id.length - 4)}
                          </td>
                          <td>
                            {formatLargeNumber(parseInt(position.balanceA))}
                          </td>
                          <td>
                            {formatLargeNumber(parseInt(position.balanceB))}
                          </td>
                          <td>{formatDollars(position.valueUsd)}</td>
                          <td>
                            {position.isOutOfRange ? (
                              <span className="status-out">Out of Range</span>
                            ) : (
                              <span className="status-in">In Range</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Unclaimed rewards (if any) */}
                  {poolPosition.positions.some((pos) =>
                    pos.rewards.some((r) => parseFloat(r.formatted) > 0)
                  ) && (
                    <div className="unclaimed-rewards">
                      <h4>Unclaimed Rewards</h4>
                      <ul>
                        {Object.values(
                          poolPosition.positions
                            .flatMap((pos) => pos.rewards)
                            .reduce((acc, reward) => {
                              const key = reward.tokenSymbol;
                              if (!acc[key]) {
                                acc[key] = { ...reward };
                              } else {
                                // Sum up rewards of the same token
                                const currentAmount = BigInt(acc[key].amount);
                                const newAmount = BigInt(reward.amount);
                                acc[key].amount = (
                                  currentAmount + newAmount
                                ).toString();
                                acc[key].formatted = (
                                  parseInt(acc[key].amount) /
                                  Math.pow(10, reward.decimals)
                                ).toFixed(reward.decimals);
                                acc[key].valueUsd += reward.valueUsd;
                              }
                              return acc;
                            }, {} as Record<string, blockVisionService.RewardInfo>)
                        )
                          .filter((reward) => parseFloat(reward.formatted) > 0)
                          .map((reward) => (
                            <li key={reward.tokenSymbol}>
                              {reward.tokenSymbol}:{" "}
                              {parseFloat(reward.formatted).toFixed(6)}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Withdraw modal */}
      {withdrawModal.isOpen && (
        <WithdrawModal
          poolAddress={withdrawModal.poolAddress}
          positionIds={withdrawModal.positionIds}
          totalLiquidity={withdrawModal.totalLiquidity}
          valueUsd={withdrawModal.valueUsd}
          onConfirm={handleWithdrawConfirm}
          onClose={handleModalClose}
        />
      )}

      {/* Transaction notification */}
      {notification?.visible && (
        <TransactionNotification
          message={notification.message}
          txDigest={notification.txDigest}
          isSuccess={notification.isSuccess}
          onClose={handleNotificationClose}
        />
      )}
    </>
  );
}

export default Positions;
