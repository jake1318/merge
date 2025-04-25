import React, { useState } from "react";
import { PoolInfo } from "../services/coinGeckoService";
import { formatDollars } from "../utils/formatters";
import "../styles/components/DepositModal.scss";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeposit: (amount: string) => void;
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
  const [amount, setAmount] = useState<string>("");
  const [slippage, setSlippage] = useState<string>("0.5");

  if (!isOpen) return null;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numbers and decimal point
    const value = e.target.value.replace(/[^0-9.]/g, "");
    // Prevent multiple decimal points
    const parts = value.split(".");
    if (parts.length > 2) {
      return;
    }
    setAmount(value);
  };

  const handleMaxClick = () => {
    // Simulated max balance
    setAmount("1000");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    onDeposit(amount);
  };

  const isSubmitDisabled =
    !amount || parseFloat(amount) <= 0 || !walletConnected;

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

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="pool-info">
            <div className="token-pair">
              <div className="token-icons">
                <div className="token-icon">
                  {pool.tokenAMetadata?.logo_uri ? (
                    <img src={pool.tokenAMetadata.logo_uri} alt={pool.tokenA} />
                  ) : (
                    <span>{pool.tokenA.charAt(0)}</span>
                  )}
                </div>
                <div className="token-icon">
                  {pool.tokenBMetadata?.logo_uri ? (
                    <img src={pool.tokenBMetadata.logo_uri} alt={pool.tokenB} />
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
              <label htmlFor="tokenA-amount">Enter {pool.tokenA} amount:</label>
              <div className="input-with-max">
                <input
                  id="tokenA-amount"
                  type="text"
                  value={amount}
                  onChange={handleAmountChange}
                  placeholder="0.0"
                  className="token-input"
                />
                <button
                  type="button"
                  className="max-button"
                  onClick={handleMaxClick}
                >
                  MAX
                </button>
              </div>
              <div className="balance-info">
                <span className="balance-label">Balance:</span>
                <span className="balance-value">1,000 {pool.tokenA}</span>
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="tokenB-amount">Enter {pool.tokenB} amount:</label>
              <div className="input-with-max">
                <input
                  id="tokenB-amount"
                  type="text"
                  value={(parseFloat(amount) || 0) * 2} // Just for demo
                  disabled
                  className="token-input"
                  placeholder="0.0"
                />
                <button
                  type="button"
                  className="max-button"
                  onClick={handleMaxClick}
                >
                  MAX
                </button>
              </div>
              <div className="balance-info">
                <span className="balance-label">Balance:</span>
                <span className="balance-value">1,000 {pool.tokenB}</span>
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
              >
                0.1%
              </button>
              <button
                type="button"
                className={slippage === "0.5" ? "selected" : ""}
                onClick={() => setSlippage("0.5")}
              >
                0.5%
              </button>
              <button
                type="button"
                className={slippage === "1" ? "selected" : ""}
                onClick={() => setSlippage("1")}
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
        </form>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={isSubmitDisabled}
            onClick={handleSubmit}
          >
            Deposit
          </button>
        </div>
      </div>
    </div>
  );
};

export default DepositModal;
