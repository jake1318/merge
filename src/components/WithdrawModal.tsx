import React, { useState } from "react";

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

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">Withdraw Liquidity</h3>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p>You are about to withdraw liquidity from pool:</p>
          <p className="pool-address">{poolAddress}</p>
          <p>
            Total Liquidity: <strong>{totalLiquidity}</strong> (≈{" "}
            {valueUsd.toFixed(2)} USD)
          </p>
          <p>Positions: {positionIds.join(", ")}</p>
        </div>
        <div className="modal-footer">
          <div className="button-group">
            <button className="cancel" onClick={onClose} disabled={confirming}>
              Cancel
            </button>
            <button
              className="confirm"
              onClick={handleConfirm}
              disabled={confirming}
            >
              {confirming ? "Withdrawing..." : "Confirm Withdraw"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WithdrawModal;
