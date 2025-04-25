import React, { useState, useEffect } from "react";
import { PoolInfo } from "../services/coinGeckoService";
import { useWallet } from "@suiet/wallet-kit";

interface DepositModalProps {
  pool: PoolInfo;
  onConfirm: (amountA: number, amountB: number) => void;
  onClose: () => void;
}

const DepositModal: React.FC<DepositModalProps> = ({
  pool,
  onConfirm,
  onClose,
}) => {
  const wallet = useWallet();
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [balanceA, setBalanceA] = useState<number | null>(null);
  const [balanceB, setBalanceB] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchBalances() {
      if (!wallet.connected) return;

      try {
        setLoading(true);
        // In a real app, this would fetch the balances from the wallet
        // For now we'll just use placeholders
        setBalanceA(100);
        setBalanceB(100);
      } catch (error) {
        console.error("Failed to fetch balances:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchBalances();
  }, [wallet.connected, pool]);

  const handleSetMax = (token: "A" | "B") => {
    if (token === "A" && balanceA !== null) {
      setAmountA(balanceA.toString());
    } else if (token === "B" && balanceB !== null) {
      setAmountB(balanceB.toString());
    }
  };

  const handleConfirm = () => {
    const numA = parseFloat(amountA);
    const numB = parseFloat(amountB);
    if (isNaN(numA) || isNaN(numB)) return;
    onConfirm(numA, numB);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">Deposit Liquidity</h3>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="input-group">
          <label>{pool.tokenA}</label>
          <input
            type="number"
            value={amountA}
            onChange={(e) => setAmountA(e.target.value)}
            placeholder={`Enter ${pool.tokenA} amount`}
          />
          <div className="balance">
            <span>
              Balance: {loading ? "Loading..." : balanceA?.toFixed(6)}
            </span>
            <button className="max-button" onClick={() => handleSetMax("A")}>
              MAX
            </button>
          </div>
        </div>

        <div className="input-group">
          <label>{pool.tokenB}</label>
          <input
            type="number"
            value={amountB}
            onChange={(e) => setAmountB(e.target.value)}
            placeholder={`Enter ${pool.tokenB} amount`}
          />
          <div className="balance">
            <span>
              Balance: {loading ? "Loading..." : balanceB?.toFixed(6)}
            </span>
            <button className="max-button" onClick={() => handleSetMax("B")}>
              MAX
            </button>
          </div>
        </div>

        <div className="button-group">
          <button className="cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="confirm"
            onClick={handleConfirm}
            disabled={!amountA || !amountB}
          >
            Deposit
          </button>
        </div>
      </div>
    </div>
  );
};

export default DepositModal;
