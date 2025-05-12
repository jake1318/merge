// src/components/DepositModal.tsx
// Last Updated: 2025-04-26 19:04:33 UTC by jake1318

import React, { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { PoolInfo } from "../services/coinGeckoService";
import { formatDollars } from "../utils/formatters";
import blockvisionService, {
  AccountCoin,
} from "../services/blockvisionService";
import TransactionNotification from "./TransactionNotification";
import "../styles/components/DepositModal.scss";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeposit: (
    amountA: string,
    amountB: string,
    slippage: string
  ) => Promise<{ success: boolean; digest: string }>;
  pool: PoolInfo;
  walletConnected: boolean;
}

const DepositModal: React.FC<DepositModalProps> = ({
  isOpen,
  onClose,
  onDeposit,
  pool,
  walletConnected,
}) => {
  const { account } = useWallet();
  const [amountA, setAmountA] = useState<string>("");
  const [amountB, setAmountB] = useState<string>("");
  const [slippage, setSlippage] = useState<string>("0.5");
  const [balances, setBalances] = useState<Record<string, AccountCoin | null>>({
    [pool.tokenA]: null,
    [pool.tokenB]: null,
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [txNotification, setTxNotification] = useState<{
    message: string;
    isSuccess: boolean;
    txDigest?: string;
  } | null>(null);

  // Fetch balances when modal opens and wallet is connected
  useEffect(() => {
    if (isOpen && walletConnected && account?.address) {
      fetchWalletBalances();
    }
  }, [isOpen, walletConnected, account?.address]);

  // Fetch wallet balances
  const fetchWalletBalances = async () => {
    if (!account?.address) return;

    setLoading(true);
    try {
      const { data: coins } = await blockvisionService.getAccountCoins(
        account.address
      );

      // Find the tokens we need balances for
      const tokenABalance = coins.find(
        (coin) =>
          coin.symbol.toUpperCase() === pool.tokenA.toUpperCase() ||
          (pool.tokenAAddress && coin.coinType === pool.tokenAAddress)
      );

      const tokenBBalance = coins.find(
        (coin) =>
          coin.symbol.toUpperCase() === pool.tokenB.toUpperCase() ||
          (pool.tokenBAddress && coin.coinType === pool.tokenBAddress)
      );

      // Update balances
      setBalances({
        [pool.tokenA]: tokenABalance || null,
        [pool.tokenB]: tokenBBalance || null,
      });

      console.log("Fetched token balances:", {
        [pool.tokenA]: tokenABalance,
        [pool.tokenB]: tokenBBalance,
      });
    } catch (error) {
      console.error("Error fetching wallet balances:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleAmountAChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numbers and decimal point
    const value = e.target.value.replace(/[^0-9.]/g, "");
    // Prevent multiple decimal points
    const parts = value.split(".");
    if (parts.length > 2) return;

    setAmountA(value);

    // Calculate corresponding amount B based on pool ratio
    // This is a simplified approach - in a real DEX, you'd use the pool price
    if (value && parseFloat(value) > 0) {
      // Example calculation - replace with actual pool logic
      const ratio = 1; // Replace with actual pool ratio
      setAmountB((parseFloat(value) * ratio).toString());
    } else {
      setAmountB("");
    }
  };

  const handleAmountBChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numbers and decimal point
    const value = e.target.value.replace(/[^0-9.]/g, "");
    // Prevent multiple decimal points
    const parts = value.split(".");
    if (parts.length > 2) return;

    setAmountB(value);

    // Calculate corresponding amount A based on pool ratio
    if (value && parseFloat(value) > 0) {
      // Example calculation - replace with actual pool logic
      const ratio = 1; // Replace with actual pool ratio
      setAmountA((parseFloat(value) / ratio).toString());
    } else {
      setAmountA("");
    }
  };

  const handleMaxAClick = () => {
    const tokenABalance = balances[pool.tokenA];
    if (tokenABalance) {
      // Convert from base units to display units
      const maxAmount = (
        parseInt(tokenABalance.balance) / Math.pow(10, tokenABalance.decimals)
      ).toString();
      setAmountA(maxAmount);

      // Calculate corresponding amount B
      const ratio = 1; // Replace with actual pool ratio
      setAmountB((parseFloat(maxAmount) * ratio).toString());
    }
  };

  const handleMaxBClick = () => {
    const tokenBBalance = balances[pool.tokenB];
    if (tokenBBalance) {
      // Convert from base units to display units
      const maxAmount = (
        parseInt(tokenBBalance.balance) / Math.pow(10, tokenBBalance.decimals)
      ).toString();
      setAmountB(maxAmount);

      // Calculate corresponding amount A
      const ratio = 1; // Replace with actual pool ratio
      setAmountA((parseFloat(maxAmount) / ratio).toString());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !amountA ||
      !amountB ||
      parseFloat(amountA) <= 0 ||
      parseFloat(amountB) <= 0
    )
      return;

    setIsSubmitting(true);
    setTxNotification({
      message: "Processing your deposit...",
      isSuccess: true,
    });

    try {
      const result = await onDeposit(amountA, amountB, slippage);

      if (result.success) {
        setTxNotification({
          message: `Successfully deposited ${amountA} ${pool.tokenA} and ${amountB} ${pool.tokenB}`,
          isSuccess: true,
          txDigest: result.digest,
        });

        // Reset form
        setAmountA("");
        setAmountB("");

        // Keep modal open to show success message
        // User can close manually with the "Done" button
      } else {
        throw new Error("Transaction failed");
      }
    } catch (error) {
      console.error("Deposit failed:", error);
      setTxNotification({
        message: `Deposit failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        isSuccess: false,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format balances for display
  const formatBalance = (token: string): string => {
    const tokenBalance = balances[token];
    if (!tokenBalance) return "Loading...";

    const balance =
      parseInt(tokenBalance.balance) / Math.pow(10, tokenBalance.decimals);
    return balance.toLocaleString(undefined, {
      maximumFractionDigits: 4,
    });
  };

  const isSubmitDisabled =
    !amountA ||
    !amountB ||
    parseFloat(amountA) <= 0 ||
    parseFloat(amountB) <= 0 ||
    !walletConnected ||
    isSubmitting;

  // Show a confirmation/result screen if we have a notification
  const showConfirmation = txNotification && txNotification.txDigest;

  return (
    <div className="modal-overlay">
      <div className="deposit-modal">
        <div className="modal-header">
          <h3>Deposit Liquidity</h3>
          <button className="close-button" onClick={onClose} aria-label="Close">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M18 6L6 18M6 6L18 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {showConfirmation ? (
          <div className="confirmation-screen">
            <div className="success-icon">
              <svg
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M22 11.08V12a10 10 0 1 1-5.93-9.14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M22 4L12 14.01l-3-3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 className="confirmation-title">Deposit Successful!</h3>
            <p className="confirmation-message">
              You have successfully added liquidity to the {pool.tokenA}/
              {pool.tokenB} pool.
            </p>
            {txNotification && txNotification.txDigest && (
              <div className="transaction-details">
                <p className="transaction-id">
                  Transaction ID:
                  <span className="hash">
                    {txNotification.txDigest.substring(0, 8)}...
                    {txNotification.txDigest.substring(
                      txNotification.txDigest.length - 8
                    )}
                  </span>
                </p>
                <a
                  href={`https://suivision.xyz/txblock/${txNotification.txDigest}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="explorer-link"
                >
                  View on SuiVision Explorer
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M15 3h6v6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M10 14L21 3"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
              </div>
            )}
            <div className="confirmation-actions">
              <button className="btn btn--primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="pool-info">
                <div className="token-pair">
                  <div className="token-icons">
                    <div className="token-icon">
                      {pool.tokenAMetadata?.logo_uri ? (
                        <img
                          src={pool.tokenAMetadata.logo_uri}
                          alt={pool.tokenA}
                        />
                      ) : (
                        <span>{pool.tokenA.charAt(0)}</span>
                      )}
                    </div>
                    <div className="token-icon">
                      {pool.tokenBMetadata?.logo_uri ? (
                        <img
                          src={pool.tokenBMetadata.logo_uri}
                          alt={pool.tokenB}
                        />
                      ) : (
                        <span>{pool.tokenB.charAt(0)}</span>
                      )}
                    </div>
                  </div>
                  <div className="pair-details">
                    <div className="pair-name">
                      {pool.tokenA} / {pool.tokenB}
                    </div>
                    {pool.name && pool.name.match(/(\d+(\.\d+)?)%/) && (
                      <div className="fee-rate">
                        {pool.name.match(/(\d+(\.\d+)?)%/)![0]} fee
                      </div>
                    )}
                  </div>
                </div>
                <div className="dex-badge">{pool.dex}</div>
              </div>

              <div className="input-groups">
                <div className="input-group">
                  <label htmlFor="tokenA-amount">
                    Enter {pool.tokenA} amount:
                  </label>
                  <div className="input-with-max">
                    <input
                      id="tokenA-amount"
                      type="text"
                      value={amountA}
                      onChange={handleAmountAChange}
                      placeholder="0.0"
                      className="token-input"
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      className="max-button"
                      onClick={handleMaxAClick}
                      disabled={!balances[pool.tokenA] || isSubmitting}
                    >
                      MAX
                    </button>
                  </div>
                  <div className="balance-info">
                    <span className="balance-label">Balance:</span>
                    <span className="balance-value">
                      {loading ? "Loading..." : formatBalance(pool.tokenA)}{" "}
                      {pool.tokenA}
                    </span>
                  </div>
                </div>

                <div className="input-group">
                  <label htmlFor="tokenB-amount">
                    Enter {pool.tokenB} amount:
                  </label>
                  <div className="input-with-max">
                    <input
                      id="tokenB-amount"
                      type="text"
                      value={amountB}
                      onChange={handleAmountBChange}
                      className="token-input"
                      placeholder="0.0"
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      className="max-button"
                      onClick={handleMaxBClick}
                      disabled={!balances[pool.tokenB] || isSubmitting}
                    >
                      MAX
                    </button>
                  </div>
                  <div className="balance-info">
                    <span className="balance-label">Balance:</span>
                    <span className="balance-value">
                      {loading ? "Loading..." : formatBalance(pool.tokenB)}{" "}
                      {pool.tokenB}
                    </span>
                  </div>
                </div>
              </div>

              <div className="slippage-setting">
                <label>Slippage Tolerance:</label>
                <div className="slippage-options">
                  <button
                    type="button"
                    className={slippage === "0.1" ? "selected" : ""}
                    onClick={() => setSlippage("0.1")}
                    disabled={isSubmitting}
                  >
                    0.1%
                  </button>
                  <button
                    type="button"
                    className={slippage === "0.5" ? "selected" : ""}
                    onClick={() => setSlippage("0.5")}
                    disabled={isSubmitting}
                  >
                    0.5%
                  </button>
                  <button
                    type="button"
                    className={slippage === "1" ? "selected" : ""}
                    onClick={() => setSlippage("1")}
                    disabled={isSubmitting}
                  >
                    1%
                  </button>
                  <div className="custom-slippage">
                    <input
                      type="text"
                      value={slippage}
                      onChange={(e) =>
                        setSlippage(e.target.value.replace(/[^0-9.]/g, ""))
                      }
                      placeholder="Custom"
                      disabled={isSubmitting}
                    />
                    <span className="percent-sign">%</span>
                  </div>
                </div>
              </div>

              <div className="summary-panel">
                <div className="summary-item">
                  <span className="item-label">Estimated APR:</span>
                  <span className="item-value highlight">
                    {pool.apr.toFixed(2)}%
                  </span>
                </div>
                <div className="summary-item">
                  <span className="item-label">Pool Liquidity:</span>
                  <span className="item-value">
                    {formatDollars(pool.liquidityUSD)}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="item-label">24h Volume:</span>
                  <span className="item-value">
                    {formatDollars(pool.volumeUSD)}
                  </span>
                </div>
              </div>

              {!walletConnected && (
                <div className="wallet-warning">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                  <span>Connect your wallet to deposit</span>
                </div>
              )}

              {txNotification && !txNotification.txDigest && (
                <div
                  className={`transaction-notification ${
                    txNotification.isSuccess ? "success" : "error"
                  }`}
                >
                  {txNotification.isSuccess ? (
                    <div className="spinner"></div>
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      <line
                        x1="15"
                        y1="9"
                        x2="9"
                        y2="15"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      <line
                        x1="9"
                        y1="9"
                        x2="15"
                        y2="15"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                    </svg>
                  )}
                  <span>{txNotification.message}</span>
                </div>
              )}
            </form>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={isSubmitDisabled}
                onClick={handleSubmit}
              >
                {isSubmitting ? (
                  <span className="loading-text">
                    <span className="spinner-small"></span>
                    Processing...
                  </span>
                ) : (
                  "Deposit"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DepositModal;
