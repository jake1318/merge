import React from "react";

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
    <div className="transaction-notification">
      <div className="notification-header">
        <div className="status">
          {isSuccess ? (
            <span className="status-icon success">✓</span>
          ) : (
            <span className="status-icon error">✗</span>
          )}
          <strong>{isSuccess ? "Success" : "Error"}</strong>
        </div>
        <button className="close-button" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="notification-content">{message}</div>

      {txDigest && (
        <div className="notification-actions">
          <a
            href={`https://explorer.sui.io/txblock/${txDigest}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            View on explorer
          </a>
        </div>
      )}
    </div>
  );
};

export default TransactionNotification;
