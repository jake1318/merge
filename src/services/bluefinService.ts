// src/services/bluefinService.ts

import {
  SuiClient,
  Ed25519Keypair,
  toBigNumberStr,
  mainnet,
} from "@firefly-exchange/library-sui";
import {
  OnChainCalls,
  QueryChain,
} from "@firefly-exchange/library-sui/dist/src/spot";
import {
  TickMath,
  ClmmPoolUtil,
} from "@firefly-exchange/library-sui/dist/src/spot/clmm";
import Decimal from "decimal.js";
import BN from "bn.js";
import type { WalletContextState } from "@suiet/wallet-kit";
import type { PoolInfo } from "./coinGeckoService";

const SUI_RPC_URL = "https://fullnode.mainnet.sui.io:443";
const client = new SuiClient({ url: SUI_RPC_URL });

/**
 * Helper: convert a percentage (e.g. 0.5) into basis points (50)
 */
function pctToBps(pct: number): number {
  return Math.round(pct * 100);
}

/**
 * Open a new position *and* deposit liquidity in one step.
 */
export async function deposit(
  wallet: WalletContextState,
  poolId: string,
  amountA: number,
  amountB: number,
  poolInfo: PoolInfo
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }

  // 1) build your on-chain helper with the user’s key
  const keyPair = Ed25519Keypair.fromSecretKey(
    Buffer.from(wallet.account!.privateKeyHex!, "hex")
  );
  const oc = new OnChainCalls(client, mainnet, { signer: keyPair });
  const qc = new QueryChain(client);

  // 2) fetch the live pool from chain
  const pool = await qc.getPool(poolId);

  // 3) compute your tick range 20% either side of current price
  const currentPrice = new Decimal(pool.current_price);
  const lower = currentPrice.mul(0.8);
  const upper = currentPrice.mul(1.2);
  const lowerTick = TickMath.priceToInitializableTickIndex(
    lower,
    pool.coin_a.decimals,
    pool.coin_b.decimals,
    pool.ticks_manager.tick_spacing
  );
  const upperTick = TickMath.priceToInitializableTickIndex(
    upper,
    pool.coin_a.decimals,
    pool.coin_b.decimals,
    pool.ticks_manager.tick_spacing
  );

  // 4) convert your desired deposit into BigNumber form
  const amtABN = new BN(toBigNumberStr(amountA, pool.coin_a.decimals));

  // 5) estimate the “liquidity + coin B” outputs
  const liqInput = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
    lowerTick,
    upperTick,
    amtABN,
    true, // fix_amount_a
    true, // round_up
    pctToBps(parseFloat((amountB / amountA).toString())), // slippage ratio
    new BN(pool.current_sqrt_price)
  );

  // 6) one-step open+deposit
  const resp = await oc.openPositionWithFixedAmount(
    pool,
    lowerTick,
    upperTick,
    liqInput
  );

  return { success: true, digest: resp.digest };
}

/**
 * Add liquidity to an *existing* position.
 */
export async function provideLiquidityWithFixedAmount(
  wallet: WalletContextState,
  positionId: string,
  amountA: number,
  slippagePct: number = 0.5
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }

  const keyPair = Ed25519Keypair.fromSecretKey(
    Buffer.from(wallet.account!.privateKeyHex!, "hex")
  );
  const oc = new OnChainCalls(client, mainnet, { signer: keyPair });
  const qc = new QueryChain(client);

  // pull your position → pool
  const pos = await qc.getPositionDetails(positionId);
  const pool = await qc.getPool(pos.pool_id);

  // coin A in BN
  const amtABN = new BN(toBigNumberStr(amountA, pool.coin_a.decimals));

  // reuse the same estimator
  const liqInput = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
    pos.lower_tick,
    pos.upper_tick,
    amtABN,
    true,
    true,
    pctToBps(slippagePct),
    new BN(pool.current_sqrt_price)
  );

  const resp = await oc.provideLiquidityWithFixedAmount(
    pool,
    positionId,
    liqInput
  );
  return { success: true, digest: resp.digest };
}

/**
 * Remove some percentage of your liquidity.
 */
export async function removeLiquidity(
  wallet: WalletContextState,
  positionId: string,
  percent: number = 100
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }

  const keyPair = Ed25519Keypair.fromSecretKey(
    Buffer.from(wallet.account!.privateKeyHex!, "hex")
  );
  const oc = new OnChainCalls(client, mainnet, { signer: keyPair });
  const qc = new QueryChain(client);

  const pos = await qc.getPositionDetails(positionId);
  const totalLiq = new BN(pos.liquidity);
  const removeLiq = totalLiq.muln(percent).divn(100).toString();

  const resp = await oc.removeLiquidity(
    pos.pool_id,
    positionId,
    removeLiq,
    "0", // min_a
    "0" // min_b
  );
  return { success: true, digest: resp.digest };
}

/**
 * Collect fees (and rewards) from one position.
 */
export async function collectFees(
  wallet: WalletContextState,
  positionId: string
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }

  const keyPair = Ed25519Keypair.fromSecretKey(
    Buffer.from(wallet.account!.privateKeyHex!, "hex")
  );
  const oc = new OnChainCalls(client, mainnet, { signer: keyPair });
  const qc = new QueryChain(client);

  const pos = await qc.getPositionDetails(positionId);
  const resp = await oc.collectFee(pos.pool_id, positionId);

  return { success: true, digest: resp.digest };
}

/**
 * Close a position (optionally collecting fees/rewards first).
 */
export async function closePosition(
  wallet: WalletContextState,
  positionId: string,
  collectFirst: boolean = true
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }

  const keyPair = Ed25519Keypair.fromSecretKey(
    Buffer.from(wallet.account!.privateKeyHex!, "hex")
  );
  const oc = new OnChainCalls(client, mainnet, { signer: keyPair });
  const qc = new QueryChain(client);

  const pos = await qc.getPositionDetails(positionId);

  if (collectFirst) {
    try {
      await oc.collectFee(pos.pool_id, positionId);
      await oc.collectReward(pos.pool_id, positionId);
    } catch {
      /* ignore */
    }
  }

  const resp = await oc.closePosition(pos.pool_id, positionId);
  return { success: true, digest: resp.digest };
}
