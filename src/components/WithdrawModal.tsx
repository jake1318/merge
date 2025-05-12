// src/components/WithdrawModal.tsx
// Last Updated: 2025-04-26 21:23:35 UTC by jake1318

import React, { useState } from "react";
import { formatLargeNumber, formatDollars } from "../utils/formatters";

import "../styles/components/WithdrawModal.scss";

interface WithdrawModalProps {
  poolAddress: string;
  positionIds: string[];
  totalLiquidity: number;
  valueUsd: number;
  onConfirm: () => void;
  onClose: () => void;
}

const WithdrawModal: React.FC<WithdrawModalProps> = ({
  poolAddress,
  positionIds,
  totalLiquidity,
  valueUsd,
  onConfirm,
  onClose,
}) => {
  const [confirming, setConfirming] = useState(false);
  const [checked, setChecked] = useState(false);

  const handleConfirm = async () => {
    if (!checked) return;

    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  };

  // Format the pool address for display
  const formatPoolAddress = (address: string): string => {
    if (!address) return "";
    if (address.length <= 16) return address;
    return `${address.substring(0, 8)}...${address.substring(
      address.length - 8
    )}`;
  };

  // Format position ID for display
  const formatPositionId = (id: string): string => {
    if (!id) return "";
    if (id.length <= 14) return id;
    return `${id.substring(0, 8)}...${id.substring(id.length - 4)}`;
  };

  return (
    <div className="modal-overlay">
      <div className="withdraw-modal">
        <div className="modal-header">
          <h3>Withdraw Liquidity</h3>
          <button
            className="close-button"
            onClick={onClose}
            disabled={confirming}
          >
            <svg
              width="16"
              height="16"
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

        <div className="modal-body">
          <div className="pool-header">
            <div className="pool-id">{formatPoolAddress(poolAddress)}</div>
          </div>

          <div className="info-grid">
            <div className="info-item">
              <div className="label">Total Liquidity:</div>
              <div className="value">{formatLargeNumber(totalLiquidity)}</div>
            </div>

            <div className="info-item">
              <div className="label">Estimated Value:</div>
              <div className="value highlight">${valueUsd.toFixed(2)}</div>
            </div>

            <div className="info-item">
              <div className="label">Positions:</div>
              <div className="value">{positionIds.length} positions</div>
            </div>
          </div>

          <div className="position-list">
            <div className="list-label">Position IDs</div>
            <div className="positions-container">
              {positionIds.map((id, index) => (
                <div key={id} className="position-item">
                  <div className="position-num">#{index + 1}:</div>
                  <div className="position-id" title={id}>
                    {formatPositionId(id)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="warning-box">
            <div className="warning-icon">⚠️</div>
            <div className="warning-content">
              <div className="warning-title">Important Information</div>
              <p>
                You are about to withdraw all liquidity and close these
                positions.
              </p>
              <p>
                This action will collect any earned fees and rewards, then
                return all liquidity to your wallet.
              </p>
              <p>This action cannot be undone.</p>
            </div>
          </div>

          <div className="confirm-checkbox">
            <input
              type="checkbox"
              id="confirm-checkbox"
              checked={checked}
              onChange={() => setChecked(!checked)}
              disabled={confirming}
            />
            <label htmlFor="confirm-checkbox">
              I understand and want to withdraw my liquidity
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="cancel-btn"
            onClick={onClose}
            disabled={confirming}
          >
            Cancel
          </button>
          <button
            className="withdraw-btn"
            onClick={handleConfirm}
            disabled={confirming || !checked}
          >
            {confirming ? (
              <>
                <div className="spinner"></div>
                Withdrawing...
              </>
            ) : (
              "Withdraw"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WithdrawModal;
