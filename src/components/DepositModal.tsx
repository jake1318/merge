import React, { useEffect, useState } from "react";
import { PoolInfo } from "../services/coinGeckoService";
import {
  blockvisionService,
  AccountCoin,
} from "../services/blockvisionService";
import "../styles/components/DepositModal.scss";

interface Props {
  pool: PoolInfo;
  onClose: () => void;
  onSuccess: (message: string, txDigest: string) => void;
  onFailure: (message: string) => void;
}

const DepositModal: React.FC<Props> = ({
  pool,
  onClose,
  onSuccess,
  onFailure,
}) => {
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [balanceA, setBalanceA] = useState<number>(0);
  const [balanceB, setBalanceB] = useState<number>(0);
  const [loadingBalances, setLoadingBalances] = useState(true);

  // fetch wallet balances via Blockvision
  useEffect(() => {
    (async () => {
      try {
        // assume window.suiWallet?.address gives the connected account
        const addr = (window as any).suiWallet?.address;
        if (!addr) throw new Error("No wallet connected");
        const { data: coins } = await blockvisionService.getAccountCoins(addr);
        // find matching coin balances
        const aCoin = coins.find((c) => c.coinType === pool.tokenAAddress);
        const bCoin = coins.find((c) => c.coinType === pool.tokenBAddress);
        setBalanceA(
          aCoin ? parseFloat(aCoin.balance) / 10 ** aCoin.decimals : 0
        );
        setBalanceB(
          bCoin ? parseFloat(bCoin.balance) / 10 ** bCoin.decimals : 0
        );
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingBalances(false);
      }
    })();
  }, [pool]);

  const handleConfirm = async () => {
    try {
      // call your Cetus deposit service here, e.g.:
      const result = await (
        await import("../services/cetusService")
      ).deposit(pool.address, parseFloat(amountA), parseFloat(amountB));
      onSuccess("Deposit submitted", result.digest);
      onClose();
    } catch (e: any) {
      console.error(e);
      onFailure(e.message || "Deposit failed");
    }
  };

  return (
    <div className="deposit-modal-backdrop">
      <div className="deposit-modal">
        <h2>Deposit to {pool.name}</h2>
        {loadingBalances ? (
          <p>Loading balances…</p>
        ) : (
          <div className="inputs">
            <label>
              {pool.tokenA}: ({balanceA})
              <input
                type="number"
                value={amountA}
                onChange={(e) => setAmountA(e.target.value)}
                max={balanceA}
              />
            </label>
            <label>
              {pool.tokenB}: ({balanceB})
              <input
                type="number"
                value={amountB}
                onChange={(e) => setAmountB(e.target.value)}
                max={balanceB}
              />
            </label>
          </div>
        )}
        <div className="actions">
          <button onClick={onClose}>Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={loadingBalances || !amountA || !amountB}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default DepositModal;
