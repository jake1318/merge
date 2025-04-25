import { useEffect, useRef } from "react";
import { formatLargeNumber, formatDollars } from "../utils/formatters";
import "../styles/components/Modals.scss";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  liquidity: number;
  valueUsd: number;
}

function WithdrawModal({
  isOpen,
  onClose,
  onConfirm,
  liquidity,
  valueUsd,
}: WithdrawModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm();
  };

  // Handle clicking outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Handle ESC key to close
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscKey);
    }
    return () => {
      document.removeEventListener("keydown", handleEscKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black bg-opacity-75">
      <div
        ref={modalRef}
        className="w-full max-w-md bg-gray-900 rounded-lg shadow-lg p-6 m-4"
      >
        <h3 className="text-lg font-medium text-white mb-4">
          Withdraw Liquidity
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="mt-2">
            <p className="text-sm text-gray-400 mb-4">
              You are about to withdraw all your liquidity from this pool.
            </p>

            <div className="bg-gray-800 rounded-lg p-4 mb-4">
              <div className="flex justify-between mb-3">
                <span className="text-gray-400">Total Value:</span>
                <span className="font-medium text-lg">
                  {formatDollars(valueUsd)}
                </span>
              </div>

              <div className="flex justify-between mb-2">
                <span className="text-gray-400">Total Liquidity:</span>
                <span className="font-medium">
                  {formatLargeNumber(liquidity)}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-400">Withdraw Amount:</span>
                <span className="font-medium">100%</span>
              </div>
            </div>

            <p className="text-sm text-yellow-500">
              Note: This will withdraw 100% of your liquidity from all positions
              in this pool.
            </p>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              className="inline-flex justify-center rounded-md border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex justify-center rounded-md border border-transparent bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 focus:outline-none"
            >
              Withdraw All
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default WithdrawModal;
