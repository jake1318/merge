import React from "react";

import "../styles/components/TransactionNotification.scss";

interface TransactionNotificationProps {
  message: string;
  txDigest?: string;
  isSuccess: boolean;
  onClose: () => void;
}

const TransactionNotification: React.FC<TransactionNotificationProps> = ({
  message,
  txDigest,
  isSuccess,
  onClose,
}) => {
  return (
    <div
      className={`transaction-notification ${isSuccess ? "success" : "error"}`}
    >
      <span className="status">{isSuccess ? "✓ Success" : "✗ Error"}</span>
      <button className="close" onClick={onClose}>
        ×
      </button>
      <p>{message}</p>
      {txDigest && (
        <a
          href={`https://explorer.sui.io/transaction/${txDigest}?network=mainnet`}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on explorer
        </a>
      )}
    </div>
  );
};

export default TransactionNotification;
