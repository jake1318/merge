// src/pages/Positions.tsx
// Last Updated: 2025-04-29 23:42:44 UTC by jake1318

import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@suiet/wallet-kit";
import BN from "bn.js";
import {
  Percentage,
  TickMath,
  ClmmPoolUtil,
  adjustForCoinSlippage,
} from "@cetusprotocol/cetus-sui-clmm-sdk";

import * as cetusService from "../../services/cetusService";
import * as bluefinService from "../../services/bluefinService"; // Import Bluefin service
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

// Add this function to determine which service to use based on the pool protocol
function getServiceForPool(
  protocol: string
): typeof cetusService | typeof bluefinService {
  // Determine which service to use based on protocol name
  if (protocol.toLowerCase() === "bluefin") {
    return bluefinService;
  }
  return cetusService;
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

  // Updated loadPositions function to fetch from both Cetus and Bluefin
  const loadPositions = useCallback(async () => {
    if (connected && account?.address) {
      setLoading(true);
      setError(null);
      try {
        // Get positions from BlockVision
        const blockVisionPositions = await blockVisionService.getDefiPortfolio(
          account.address
        );

        // First try with BlockVision data
        if (blockVisionPositions.length > 0) {
          setPoolPositions(blockVisionPositions);
        } else {
          console.log(
            "No BlockVision data, falling back to Cetus and Bluefin SDKs"
          );

          // Get positions from both Cetus and Bluefin
          const [cetusPositions, bluefinPositions] = await Promise.all([
            cetusService.getPositions(account.address),
            bluefinService.getPositions(account.address),
          ]);

          // Combine all positions
          const rawPositions = [
            ...cetusPositions.map((p) => ({ ...p, type: "cetus" })),
            ...bluefinPositions.map((p) => ({ ...p, type: "bluefin" })),
          ];

          console.log("Raw positions:", rawPositions);

          if (rawPositions.length > 0) {
            // Map positions to pool groups
            const poolsMap: Record<string, PoolGroup> = {};

            // Get pool details for the positions
            const poolsInfo = await cetusService.getPoolsDetailsForPositions(
              rawPositions.map((p) => p.poolAddress).filter(Boolean)
            );

            // Create pool groups from raw positions
            for (const position of rawPositions) {
              if (!position.poolAddress) continue;

              const poolInfo = poolsInfo.find(
                (p) => p.address === position.poolAddress
              );
              const isPoolBluefin =
                position.type === "bluefin" ||
                bluefinService.isBluefinPool(
                  position.poolAddress,
                  poolInfo?.dex
                );

              if (!poolsMap[position.poolAddress]) {
                poolsMap[position.poolAddress] = {
                  poolAddress: position.poolAddress,
                  poolName: poolInfo?.name || "Unknown Pool",
                  protocol: isPoolBluefin
                    ? "Bluefin"
                    : poolInfo?.dex || "Cetus",
                  tokenA: poolInfo?.tokenA || "Token A",
                  tokenB: poolInfo?.tokenB || "Token B",
                  tokenASymbol: poolInfo?.tokenA || "?",
                  tokenBSymbol: poolInfo?.tokenB || "?",
                  tokenALogo: poolInfo?.tokenAMetadata?.logo_uri,
                  tokenBLogo: poolInfo?.tokenBMetadata?.logo_uri,
                  positions: [],
                  totalValueUsd: 0,
                  totalLiquidity: 0,
                  apr: poolInfo?.apr || 0,
                };
              }

              // Add position to pool group
              poolsMap[position.poolAddress].positions.push({
                id: position.id,
                liquidity: position.liquidity.toString(),
                balanceA: "0", // Would need detailed position data
                balanceB: "0", // Would need detailed position data
                valueUsd: 0, // Would need detailed position data
                isOutOfRange: false,
                rewards: [], // Would need to fetch rewards data
                positionType: isPoolBluefin ? "bluefin" : "cetus", // Add position type for later use
              });

              // Update pool totals
              poolsMap[position.poolAddress].totalLiquidity +=
                position.liquidity;
            }

            setPoolPositions(Object.values(poolsMap));
          } else {
            setPoolPositions([]);
          }
        }
      } catch (err) {
        console.error("Failed to load positions:", err);
        setError("Failed to load your positions. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  }, [connected, account]);

  // Load user positions when wallet connects
  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

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
      totalRewards: pool.positions.flatMap((pos) => pos.rewards || []),
    });
    setClaimingPool(pool.poolAddress);
  };

  /**
   * Updated handleClaim to support both Cetus and Bluefin positions
   */
  const handleClaim = async (poolAddress: string, positionIds: string[]) => {
    if (!wallet.connected || positionIds.length === 0) {
      console.error("Wallet not connected or no position IDs provided");
      return;
    }

    setClaimingPool(poolAddress);

    try {
      // Find this pool in our positions to determine the protocol
      const pool = poolPositions.find((p) => p.poolAddress === poolAddress);
      if (!pool) {
        throw new Error("Pool not found");
      }

      // Get the appropriate service based on protocol
      const service = getServiceForPool(pool.protocol);

      // Use one position as representative for the claim
      const positionId = positionIds[0];

      console.log(
        `Claiming rewards for position: ${positionId} in pool: ${poolAddress} using ${pool.protocol} service`
      );

      // Call service function to collect rewards
      const result = await service.collectRewards(
        wallet,
        poolAddress,
        positionId
      );

      console.log("Claim transaction completed:", result);

      // Only show success with transaction if we got a digest back
      if (result.digest) {
        setNotification({
          visible: true,
          message: "Rewards claimed successfully!",
          txDigest: result.digest,
          isSuccess: true,
        });
      } else {
        // No rewards to claim case
        setNotification({
          visible: true,
          message: "No rewards available to claim at this time.",
          isSuccess: true,
        });
      }

      // Refresh position data
      await loadPositions();
    } catch (err) {
      console.error("Claim failed:", err);
      setNotification({
        visible: true,
        message: `Failed to claim rewards: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
        isSuccess: false,
      });
    } finally {
      setClaimingPool(null);
    }
  };

  /**
   * Updated handleCollectFees to support both Cetus and Bluefin positions
   */
  const handleCollectFees = async (poolAddress: string, positionId: string) => {
    if (!wallet.connected) {
      console.error("Wallet not connected");
      return;
    }

    try {
      // Find this pool in our positions to determine the protocol
      const pool = poolPositions.find((p) => p.poolAddress === poolAddress);
      if (!pool) {
        throw new Error("Pool not found");
      }

      // Get the appropriate service based on protocol
      const service = getServiceForPool(pool.protocol);

      console.log(
        `Collecting fees for position: ${positionId} in pool: ${poolAddress} using ${pool.protocol} service`
      );

      // Call service function to collect fees
      const result = await service.collectFees(wallet, poolAddress, positionId);

      console.log("Fee collection transaction completed:", result);

      setNotification({
        visible: true,
        message: "Fees collected successfully!",
        txDigest: result.digest,
        isSuccess: true,
      });

      // Refresh position data
      await loadPositions();
    } catch (err) {
      console.error("Fee collection failed:", err);
      setNotification({
        visible: true,
        message: `Failed to collect fees: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
        isSuccess: false,
      });
    }
  };

  /**
   * Updated handleRemoveLiquidity to support both Cetus and Bluefin positions
   */
  const handleRemoveLiquidity = async (
    poolAddress: string,
    positionId: string,
    percentage: number = 100
  ) => {
    if (!wallet.connected) {
      console.error("Wallet not connected");
      return;
    }

    try {
      // Find this pool in our positions to determine the protocol
      const pool = poolPositions.find((p) => p.poolAddress === poolAddress);
      if (!pool) {
        throw new Error("Pool not found");
      }

      // Get the appropriate service based on protocol
      const service = getServiceForPool(pool.protocol);

      console.log(
        `Removing ${percentage}% liquidity from position: ${positionId} in pool: ${poolAddress} using ${pool.protocol} service`
      );

      // Call service function to remove liquidity
      const result = await service.removeLiquidity(
        wallet,
        poolAddress,
        positionId,
        percentage
      );

      console.log("Remove liquidity transaction completed:", result);

      setNotification({
        visible: true,
        message: `Successfully removed ${percentage}% of liquidity!`,
        txDigest: result.digest,
        isSuccess: true,
      });

      // Refresh position data
      await loadPositions();
    } catch (err) {
      console.error("Remove liquidity failed:", err);
      setNotification({
        visible: true,
        message: `Failed to remove liquidity: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
        isSuccess: false,
      });
    }
  };

  /**
   * Updated handleClosePosition to support both Cetus and Bluefin positions
   */
  const handleClosePosition = async (
    poolAddress: string,
    positionId: string
  ) => {
    if (!wallet.connected) {
      console.error("Wallet not connected");
      return;
    }

    setWithdrawingPool(poolAddress);

    try {
      // Find this pool in our positions to determine the protocol
      const pool = poolPositions.find((p) => p.poolAddress === poolAddress);
      if (!pool) {
        throw new Error("Pool not found");
      }

      // Get the appropriate service based on protocol
      const service = getServiceForPool(pool.protocol);

      console.log(
        `Closing position: ${positionId} in pool: ${poolAddress} using ${pool.protocol} service`
      );

      // Call service function to close position
      const result = await service.closePosition(
        wallet,
        poolAddress,
        positionId
      );

      console.log("Close position transaction completed:", result);

      setNotification({
        visible: true,
        message: "Position closed successfully!",
        txDigest: result.digest,
        isSuccess: true,
      });

      // Refresh position data
      await loadPositions();
    } catch (err) {
      console.error("Close position failed:", err);
      setNotification({
        visible: true,
        message: `Failed to close position: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
        isSuccess: false,
      });
    } finally {
      setWithdrawingPool(null);
      // Close modal if open
      setWithdrawModal((prev) => ({ ...prev, isOpen: false }));
    }
  };

  const handleWithdrawConfirm = async () => {
    const { poolAddress, positionIds } = withdrawModal;

    if (!positionIds.length) {
      console.error("No position IDs provided for withdrawal");
      return;
    }

    try {
      setWithdrawingPool(poolAddress);

      // Find this pool in our positions to determine the protocol
      const pool = poolPositions.find((p) => p.poolAddress === poolAddress);
      if (!pool) {
        throw new Error("Pool not found");
      }

      // Get the appropriate service based on protocol
      const service = getServiceForPool(pool.protocol);

      // For multiple positions, close them one by one
      for (const positionId of positionIds) {
        const result = await service.closePosition(
          wallet,
          poolAddress,
          positionId
        );
        console.log(`Position ${positionId} closed, result:`, result);
      }

      setNotification({
        visible: true,
        message: "Successfully withdrew liquidity and closed position(s)!",
        isSuccess: true,
      });

      // Close the modal
      setWithdrawModal((prev) => ({ ...prev, isOpen: false }));

      // Refresh positions
      await loadPositions();
    } catch (err) {
      console.error("Withdraw failed:", err);
      setNotification({
        visible: true,
        message: `Failed to withdraw liquidity: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
        isSuccess: false,
      });
    } finally {
      setWithdrawingPool(null);
    }
  };

  const handleModalClose = () => {
    setWithdrawModal((prev) => ({ ...prev, isOpen: false }));
    setWithdrawingPool(null);
  };

  const handleNotificationClose = () => setNotification(null);

  // Helper function to get APR color class
  const getAprClass = (apr: number): string => {
    if (apr >= 100) return "high";
    if (apr >= 50) return "medium";
    return "low";
  };

  // Safety function to get the first character with null checking
  const safeFirstChar = (str?: string | null): string => {
    return str && typeof str === "string" ? str.charAt(0) : "?";
  };

  return (
    <div className="positions-page">
      <div className="content-container">
        <div className="page-header">
          <h1>Yield Generation</h1>
        </div>

        <div className="tabs-navigation">
          <Link to="/pools" className="tab-link">
            Pools
          </Link>
          <Link to="/positions" className="tab-link active">
            My Positions
          </Link>
        </div>

        {error ? (
          <div className="empty-state">
            <div className="empty-icon">⚠️</div>
            <h3>Error Loading Positions</h3>
            <p>{error}</p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        ) : !connected ? (
          <div className="empty-state">
            <div className="empty-icon">🔐</div>
            <h3>Wallet Not Connected</h3>
            <p>Please connect your wallet to view your positions.</p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => wallet.select()}
            >
              Connect Wallet
            </button>
          </div>
        ) : loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <div className="loading-text">Loading positions...</div>
          </div>
        ) : poolPositions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💧</div>
            <h3>No Positions Found</h3>
            <p>You don't have any liquidity positions yet.</p>
            <Link to="/pools" className="btn btn--primary">
              Add Liquidity
            </Link>
          </div>
        ) : (
          // Display positions in a table format similar to pools
          <div className="positions-table-container">
            <table>
              <thead>
                <tr>
                  <th>Pool</th>
                  <th>DEX</th>
                  <th className="align-right">Your Liquidity</th>
                  <th className="align-right">Value (USD)</th>
                  <th className="align-right">APR</th>
                  <th className="align-center">Status</th>
                  <th className="actions-column">Actions</th>
                </tr>
              </thead>
              <tbody>
                {poolPositions.map((poolPosition) => (
                  <React.Fragment key={poolPosition.poolAddress}>
                    <tr
                      className="position-row"
                      onClick={() => toggleDetails(poolPosition.poolAddress)}
                    >
                      <td className="pool-cell">
                        <div className="pool-item">
                          <div className="token-icons">
                            {poolPosition.tokenALogo ? (
                              <div className="token-icon">
                                <img
                                  src={poolPosition.tokenALogo}
                                  alt={poolPosition.tokenASymbol || "?"}
                                />
                              </div>
                            ) : (
                              <div className="token-icon placeholder">
                                {safeFirstChar(poolPosition.tokenASymbol)}
                              </div>
                            )}
                            {poolPosition.tokenBLogo ? (
                              <div className="token-icon">
                                <img
                                  src={poolPosition.tokenBLogo}
                                  alt={poolPosition.tokenBSymbol || "?"}
                                />
                              </div>
                            ) : (
                              <div className="token-icon placeholder">
                                {safeFirstChar(poolPosition.tokenBSymbol)}
                              </div>
                            )}
                          </div>
                          <div className="pool-info">
                            <div className="pair-name">
                              {poolPosition.tokenASymbol || "?"} /{" "}
                              {poolPosition.tokenBSymbol || "?"}
                            </div>
                            <div className="position-count">
                              {poolPosition.positions.length} position
                              {poolPosition.positions.length !== 1 ? "s" : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {/* Update to show different badge style based on protocol */}
                        <span
                          className={`dex-badge ${poolPosition.protocol.toLowerCase()}`}
                        >
                          {poolPosition.protocol || "Unknown"}
                        </span>
                      </td>
                      <td className="align-right liquidity-cell">
                        {formatLargeNumber(poolPosition.totalLiquidity)}
                      </td>
                      <td className="align-right">
                        {formatDollars(poolPosition.totalValueUsd)}
                      </td>
                      <td className="align-right">
                        <span
                          className={`apr-value ${getAprClass(
                            poolPosition.apr
                          )}`}
                        >
                          {poolPosition.apr.toFixed(2)}%
                        </span>
                      </td>
                      <td className="align-center">
                        {poolPosition.positions.some(
                          (pos) => pos.isOutOfRange
                        ) ? (
                          <span className="status-badge warning">
                            Partially Out of Range
                          </span>
                        ) : (
                          <span className="status-badge success">In Range</span>
                        )}
                      </td>
                      <td className="actions-cell">
                        <div className="action-buttons">
                          <button
                            className="btn btn--secondary btn--sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleDetails(poolPosition.poolAddress);
                            }}
                          >
                            {showDetails[poolPosition.poolAddress]
                              ? "Hide"
                              : "Details"}
                          </button>
                          <button
                            className="btn btn--primary btn--sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleWithdraw(
                                poolPosition.poolAddress,
                                poolPosition.positions.map((p) => p.id),
                                poolPosition.totalLiquidity,
                                poolPosition.totalValueUsd
                              );
                            }}
                            disabled={
                              withdrawingPool === poolPosition.poolAddress
                            }
                          >
                            {withdrawingPool === poolPosition.poolAddress ? (
                              <span className="loading-text">
                                <span className="dot-loader"></span>
                                Withdrawing
                              </span>
                            ) : (
                              "Withdraw"
                            )}
                          </button>
                          {poolPosition.positions.some(
                            (pos) =>
                              pos.rewards &&
                              pos.rewards.some(
                                (r) => parseFloat(r.formatted) > 0
                              )
                          ) && (
                            <button
                              className="btn btn--accent btn--sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClaim(
                                  poolPosition.poolAddress,
                                  poolPosition.positions.map((p) => p.id)
                                );
                              }}
                              disabled={
                                claimingPool === poolPosition.poolAddress
                              }
                            >
                              {claimingPool === poolPosition.poolAddress ? (
                                <span className="loading-text">
                                  <span className="dot-loader"></span>
                                  Claiming
                                </span>
                              ) : (
                                "Claim"
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {showDetails[poolPosition.poolAddress] && (
                      <tr className="details-row">
                        <td colSpan={7}>
                          <div className="position-details-container">
                            <div className="details-header">
                              <h4>Position Details</h4>
                            </div>
                            <div className="positions-detail-table">
                              <table>
                                <thead>
                                  <tr>
                                    <th>Position ID</th>
                                    <th>
                                      {poolPosition.tokenASymbol || "Token A"}{" "}
                                      Amount
                                    </th>
                                    <th>
                                      {poolPosition.tokenBSymbol || "Token B"}{" "}
                                      Amount
                                    </th>
                                    <th>Value (USD)</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {poolPosition.positions.map((position) => (
                                    <tr
                                      key={position.id}
                                      data-protocol={
                                        position.positionType ||
                                        poolPosition.protocol.toLowerCase()
                                      }
                                    >
                                      <td className="monospace">
                                        {position.id.substring(0, 8)}...
                                        {position.id.substring(
                                          position.id.length - 4
                                        )}
                                      </td>
                                      <td>
                                        {formatLargeNumber(
                                          parseInt(position.balanceA || "0")
                                        )}
                                      </td>
                                      <td>
                                        {formatLargeNumber(
                                          parseInt(position.balanceB || "0")
                                        )}
                                      </td>
                                      <td>
                                        {formatDollars(position.valueUsd)}
                                      </td>
                                      <td>
                                        {position.isOutOfRange ? (
                                          <span className="status-badge warning">
                                            Out of Range
                                          </span>
                                        ) : (
                                          <span className="status-badge success">
                                            In Range
                                          </span>
                                        )}
                                      </td>
                                      <td>
                                        <div className="action-buttons">
                                          <button
                                            className="btn btn--secondary btn--sm"
                                            onClick={() =>
                                              handleCollectFees(
                                                poolPosition.poolAddress,
                                                position.id
                                              )
                                            }
                                          >
                                            Collect Fees
                                          </button>
                                          <button
                                            className="btn btn--primary btn--sm"
                                            onClick={() =>
                                              handleClosePosition(
                                                poolPosition.poolAddress,
                                                position.id
                                              )
                                            }
                                            disabled={
                                              withdrawingPool ===
                                              poolPosition.poolAddress
                                            }
                                          >
                                            Close
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Unclaimed rewards section */}
                            {poolPosition.positions.some(
                              (pos) =>
                                pos.rewards &&
                                pos.rewards.some(
                                  (r) => parseFloat(r.formatted) > 0
                                )
                            ) && (
                              <div className="rewards-section">
                                <h4>Unclaimed Rewards</h4>
                                <div className="rewards-list">
                                  {Object.values(
                                    poolPosition.positions
                                      .flatMap((pos) => pos.rewards || [])
                                      .reduce((acc, reward) => {
                                        if (!reward) return acc;
                                        const key =
                                          reward.tokenSymbol || "Unknown";
                                        if (!acc[key]) {
                                          acc[key] = { ...reward };
                                        } else {
                                          // Sum up rewards of the same token
                                          const currentAmount = BigInt(
                                            acc[key].amount || "0"
                                          );
                                          const newAmount = BigInt(
                                            reward.amount || "0"
                                          );
                                          acc[key].amount = (
                                            currentAmount + newAmount
                                          ).toString();
                                          acc[key].formatted = (
                                            parseInt(acc[key].amount || "0") /
                                            Math.pow(10, reward.decimals || 0)
                                          ).toFixed(reward.decimals || 0);
                                          acc[key].valueUsd =
                                            (acc[key].valueUsd || 0) +
                                            (reward.valueUsd || 0);
                                        }
                                        return acc;
                                      }, {} as Record<string, blockVisionService.RewardInfo>)
                                  )
                                    .filter(
                                      (reward) =>
                                        reward &&
                                        parseFloat(reward.formatted || "0") > 0
                                    )
                                    .map((reward) => (
                                      <div
                                        key={reward.tokenSymbol}
                                        className="reward-item"
                                      >
                                        <span className="reward-token">
                                          {reward.tokenSymbol || "Unknown"}:
                                        </span>
                                        <span className="reward-amount">
                                          {parseFloat(
                                            reward.formatted || "0"
                                          ).toFixed(6)}
                                        </span>
                                        <span className="reward-value">
                                          ≈ ${(reward.valueUsd || 0).toFixed(2)}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                                <div className="rewards-actions">
                                  <button
                                    className="btn btn--accent btn--sm"
                                    onClick={() =>
                                      handleClaim(
                                        poolPosition.poolAddress,
                                        poolPosition.positions.map((p) => p.id)
                                      )
                                    }
                                    disabled={
                                      claimingPool === poolPosition.poolAddress
                                    }
                                  >
                                    {claimingPool === poolPosition.poolAddress
                                      ? "Claiming..."
                                      : "Claim All Rewards"}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
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
          <div className="notification-container">
            <TransactionNotification
              message={notification.message}
              txDigest={notification.txDigest}
              isSuccess={notification.isSuccess}
              onClose={handleNotificationClose}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default Positions;
