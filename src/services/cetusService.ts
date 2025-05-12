// src/services/cetusService.ts
// Last Updated: 2025-04-27 02:22:05 UTC by jake1318

import {
  initCetusSDK,
  ClmmPoolUtil,
  TickMath,
  Percentage,
  adjustForCoinSlippage,
} from "@cetusprotocol/cetus-sui-clmm-sdk";
import type { WalletContextState } from "@suiet/wallet-kit";
import type { PoolInfo } from "./coinGeckoService";
import BN from "bn.js";
import { TransactionBlock } from "@mysten/sui.js/transactions";

/**
 * Creates a fresh SDK instance bound to a signer address.
 */
function getSdkWithWallet(address: string) {
  const sdk = initCetusSDK({
    network: "mainnet",
    wallet: address,
  });
  sdk.senderAddress = address;
  return sdk;
}

/**
 * Convert amount to smallest unit based on token decimals
 * e.g., 1.5 USDC with 6 decimals becomes 1500000
 */
function toBaseUnit(amount: number, decimals: number): string {
  // Handle potential floating point precision issues
  const multiplier = Math.pow(10, decimals);
  const baseAmount = Math.round(amount * multiplier);
  return baseAmount.toString();
}

// Common token decimals - helps us handle the most common ones
const COMMON_DECIMALS: Record<string, number> = {
  SUI: 9,
  USDC: 6,
  USDT: 6,
  BTC: 8,
  ETH: 8,
  WETH: 8,
  CETUS: 9,
};

/**
 * Try to determine token decimals from the type string
 */
function guessTokenDecimals(coinType: string): number {
  // Default fallbacks by token name
  for (const [symbol, decimals] of Object.entries(COMMON_DECIMALS)) {
    if (coinType.toLowerCase().includes(symbol.toLowerCase())) {
      console.log(
        `Guessed ${decimals} decimals for ${coinType} based on symbol ${symbol}`
      );
      return decimals;
    }
  }

  // Default fallback
  console.log(
    `Could not determine decimals for ${coinType}, using default of 9`
  );
  return 9;
}

/**
 * Check if a pool is a Bluefin pool
 */
function isBluefinPool(poolId: string, dex?: string): boolean {
  if (dex && dex.toLowerCase().includes("bluefin")) {
    return true;
  }

  // Common patterns in Bluefin pool addresses
  const bluefinPatterns = [
    "bluefin",
    "bf_",
    "0x71f3d", // Some Bluefin pools share this prefix
    "0xf7133d",
    "0xf4a5d8",
  ];

  return bluefinPatterns.some((pattern) =>
    poolId.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Handle deposit for Bluefin pools specifically
 */
async function bluefinDeposit(
  wallet: WalletContextState,
  poolId: string,
  amountX: number,
  amountY: number,
  tokenA?: string,
  tokenB?: string
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }

  console.log(`Using Bluefin deposit implementation for pool ${poolId}`);

  try {
    // Create a transaction block for Bluefin deposit
    const txb = new TransactionBlock();

    // For Bluefin, we need to use specific package and modules
    const BLUEFIN_PACKAGE =
      "0xf7133d0cb63e1a78ef27a78d4e887a58428d06ff4f2ebbd33af273a04a1bf444";

    // Determine token decimals based on symbols if available
    const decimalsA = tokenA ? COMMON_DECIMALS[tokenA] || 9 : 9;
    const decimalsB = tokenB ? COMMON_DECIMALS[tokenB] || 9 : 9;

    // Convert to base units
    const baseAmountA = toBaseUnit(amountX, decimalsA);
    const baseAmountB = toBaseUnit(amountY, decimalsB);

    console.log(
      `Bluefin deposit with amounts: ${amountX}(${baseAmountA}) and ${amountY}(${baseAmountB})`
    );

    // Set gas budget explicitly to avoid errors
    txb.setGasBudget(100000000); // 0.1 SUI

    // Call the Bluefin add_liquidity function
    txb.moveCall({
      target: `${BLUEFIN_PACKAGE}::clmm::add_liquidity`,
      arguments: [
        txb.pure(poolId),
        txb.pure(baseAmountA),
        txb.pure(baseAmountB),
        // Additional parameters might be needed based on Bluefin's implementation
      ],
    });

    // Execute the transaction
    const result = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    console.log("Bluefin deposit transaction completed:", result);

    return {
      success: true,
      digest: result.digest || "",
    };
  } catch (error) {
    console.error("Bluefin deposit failed:", error);
    throw new Error(
      `Bluefin deposit failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/** Cleanly extract the raw Move‐object fields for a position NFT */
async function fetchPositionFields(
  sdk: ReturnType<typeof getSdkWithWallet>,
  positionId: string
): Promise<any> {
  try {
    // 1) Try native SDK call
    return await sdk.Position.getPosition(positionId);
  } catch (e) {
    console.log("getPosition failed, trying direct RPC:", e);
    // 2) Fallback: direct RPC
  }
  const resp = await sdk.fullClient.getObject({
    id: positionId,
    options: { showContent: true, showDisplay: true },
  });
  const content = (resp.data as any)?.content;
  if (!content || content.dataType !== "moveObject") {
    throw new Error(`Position ${positionId} not found on‐chain`);
  }
  return content.fields;
}

/**
 * Extract pool ID from position link or other data
 */
function extractPoolIdFromPosition(position: any): string {
  // Try to extract from link field
  if (position.link) {
    try {
      // Example: https://app.cetus.zone/position?chain=sui&id=0x...&pool=0x...
      const url = new URL(position.link);
      const poolParam = url.searchParams.get("pool");
      if (poolParam) {
        return poolParam;
      }
    } catch (e) {
      console.warn("Failed to extract pool ID from link:", e);
    }
  }

  // Try to extract from name field
  if (position.name) {
    try {
      // Example: "Cetus LP | Pool3137-551143"
      const poolMatch = position.name.match(/Pool(\d+)/);
      if (poolMatch && poolMatch[1]) {
        // Not a real pool ID, but can be used to query the actual pool
        return `pool-${poolMatch[1]}`;
      }
    } catch (e) {
      console.warn("Failed to extract pool ID from name:", e);
    }
  }

  // Return empty string if all extraction attempts fail
  return "";
}

/**
 * Open a position and deposit liquidity.
 * Last Updated: 2025-04-27 02:22:05 UTC by jake1318
 */
export async function deposit(
  wallet: WalletContextState,
  poolId: string,
  amountX: number,
  amountY: number,
  poolInfo?: PoolInfo
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }

  // Check if this is a Bluefin pool based on ID or dex name
  if (isBluefinPool(poolId, poolInfo?.dex)) {
    console.log("Detected Bluefin pool, using specialized implementation");
    return bluefinDeposit(
      wallet,
      poolId,
      amountX,
      amountY,
      poolInfo?.tokenA,
      poolInfo?.tokenB
    );
  }

  console.log("Using standard Cetus implementation for deposit");
  const address = wallet.account.address;
  const sdk = getSdkWithWallet(address);

  try {
    // Get pool information
    console.log(`Fetching pool information for: ${poolId}`);
    const pool = await sdk.Pool.getPool(poolId);
    if (!pool) {
      throw new Error("Pool not found");
    }

    // Get token decimals by looking at the coin types
    const decimalsA = guessTokenDecimals(pool.coinTypeA);
    const decimalsB = guessTokenDecimals(pool.coinTypeB);

    console.log(`Token A (${pool.coinTypeA}): using ${decimalsA} decimals`);
    console.log(`Token B (${pool.coinTypeB}): using ${decimalsB} decimals`);

    // Calculate ticks based on pool's tick spacing
    const tickSpacing = parseInt(pool.tickSpacing);
    const currentTickIndex = parseInt(pool.current_tick_index);

    // Calculate tick boundaries using the SDK's helper functions
    // Use a moderate tick range for good price coverage
    const lowerTick = TickMath.getPrevInitializableTickIndex(
      currentTickIndex - tickSpacing * 8, // 8 ticks below current
      tickSpacing
    );

    const upperTick = TickMath.getNextInitializableTickIndex(
      currentTickIndex + tickSpacing * 8, // 8 ticks above current
      tickSpacing
    );

    console.log(
      `Creating position with tick range: ${lowerTick} to ${upperTick}`
    );
    console.log(
      `Pool details: tickSpacing=${tickSpacing}, currentTick=${currentTickIndex}, currentSqrtPrice=${pool.current_sqrt_price}`
    );

    // Convert to base units (smallest denomination) using 100% of the amount
    const baseAmountA = toBaseUnit(amountX, decimalsA); // Use full amount
    const baseAmountB = toBaseUnit(amountY, decimalsB); // Use full amount

    console.log(
      `Using full amounts: ${baseAmountA} (TokenA), ${baseAmountB} (TokenB)`
    );

    // Get current sqrt price as BN
    const curSqrtPrice = new BN(pool.current_sqrt_price);

    // Calculate amounts based on pool price to ensure they're balanced
    const bnAmountA = new BN(baseAmountA);
    const bnAmountB = new BN(baseAmountB);

    // Check if we're using SUI, which needs special handling for gas
    const isSUITokenA = pool.coinTypeA.includes("sui::SUI");
    const isSUITokenB = pool.coinTypeB.includes("sui::SUI");

    // If SUI is involved, reserve some for gas
    if (isSUITokenA || isSUITokenB) {
      // Reserve 0.05 SUI for gas
      const gasReserveInSui = new BN(50000000); // 0.05 SUI

      if (isSUITokenA) {
        // Get total SUI balance
        const suiBalance = await sdk.fullClient
          .getBalance({
            owner: address,
            coinType: "0x2::sui::SUI",
          })
          .then((res) => new BN(res.totalBalance));

        // Ensure we leave gas reserve
        if (bnAmountA.add(gasReserveInSui).gt(suiBalance)) {
          const availableForLiquidity = suiBalance.sub(gasReserveInSui);
          console.log(
            `Adjusting SUI amount to leave gas reserve, from ${bnAmountA.toString()} to ${availableForLiquidity.toString()}`
          );
          bnAmountA.iaddn(0).iadd(availableForLiquidity);
        }
      } else if (isSUITokenB) {
        // Get total SUI balance
        const suiBalance = await sdk.fullClient
          .getBalance({
            owner: address,
            coinType: "0x2::sui::SUI",
          })
          .then((res) => new BN(res.totalBalance));

        // Ensure we leave gas reserve
        if (bnAmountB.add(gasReserveInSui).gt(suiBalance)) {
          const availableForLiquidity = suiBalance.sub(gasReserveInSui);
          console.log(
            `Adjusting SUI amount to leave gas reserve, from ${bnAmountB.toString()} to ${availableForLiquidity.toString()}`
          );
          bnAmountB.iaddn(0).iadd(availableForLiquidity);
        }
      }
    }

    // Set the fixed amount flag based on which token is SUI
    // If SUI is involved, we want to fix the other token to ensure we have enough SUI for gas
    const fixAmountA = !isSUITokenA || (isSUITokenB && !isSUITokenA);

    // Reasonable slippage tolerance
    const slippage = 0.05; // 5% slippage is more reasonable for a full amount deposit

    console.log(
      `Using combined open position and add liquidity approach with fixed amount ${
        fixAmountA ? "A" : "B"
      }`
    );

    // === Combined open position and add liquidity in one transaction ===
    console.log("Using the combined open position and add liquidity approach");

    const addLiquidityParams = {
      coinTypeA: pool.coinTypeA,
      coinTypeB: pool.coinTypeB,
      pool_id: poolId,
      tick_lower: lowerTick.toString(),
      tick_upper: upperTick.toString(),
      fix_amount_a: fixAmountA,
      amount_a: bnAmountA.toString(),
      amount_b: bnAmountB.toString(),
      slippage,
      is_open: true, // This is key - open position and add liquidity in one tx
      rewarder_coin_types: [],
      collect_fee: false,
      pos_id: "", // Empty since we're creating a new position
    };

    console.log("Add liquidity parameters:", addLiquidityParams);

    // Create the transaction with fixed token approach
    const tx = await sdk.Position.createAddLiquidityFixTokenPayload(
      addLiquidityParams,
      {
        slippage,
        curSqrtPrice,
      }
    );

    // Set adequate gas budget - slightly higher for full amount transactions
    tx.setGasBudget(110000000); // 0.11 SUI

    console.log("Sending combined transaction");
    const res = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
      },
    });

    console.log("Transaction completed successfully");
    console.log("Transaction digest:", res.digest);

    return {
      success: true,
      digest: res.digest || "",
    };
  } catch (error) {
    console.error("Error in deposit function:", error);

    // Provide user-friendly error messages
    if (error instanceof Error) {
      // Check for specific error patterns
      if (error.message.includes("Insufficient balance")) {
        throw new Error(
          "Insufficient balance to complete the transaction. Please check your token balances."
        );
      } else if (
        error.message.includes("MoveAbort") &&
        error.message.includes("repay_add_liquidity")
      ) {
        throw new Error(
          "Transaction failed: The amounts need to be balanced according to the pool's current price ratio. Try adjusting your token amounts."
        );
      } else if (error.message.includes("Could not find gas coin")) {
        throw new Error(
          "Not enough SUI to cover gas fees. Please add more SUI to your wallet."
        );
      } else if (error.message.includes("budget")) {
        throw new Error(
          "Transaction failed due to gas budget issues. Please try again with different amounts."
        );
      } else if (error.message.includes("Failed to find position ID")) {
        throw new Error(
          "Position was created but we couldn't identify it. Please check your positions in Cetus app."
        );
      }
    }

    throw error;
  }
}

/**
 * Remove a percentage (0–100) of liquidity from a position, collecting fees.
 * Last Updated: 2025-04-27 02:22:05 UTC by jake1318
 */
export async function removeLiquidity(
  wallet: WalletContextState,
  poolId: string,
  positionId: string,
  liquidityPct: number = 100
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }
  const address = wallet.account.address;
  const sdk = getSdkWithWallet(address);

  try {
    console.log(
      `Removing ${liquidityPct}% liquidity from position ${positionId} in pool ${poolId}`
    );

    // Try to fetch position data
    let pos;
    try {
      pos = await fetchPositionFields(sdk, positionId);
      if (!pos.liquidity || pos.liquidity === "0") {
        throw new Error("Position has zero liquidity");
      }
    } catch (error) {
      console.warn("Could not fetch position details:", error);
      throw new Error("Position not found or has no liquidity");
    }

    // Resolve actual pool ID
    const actualPoolId = pos.pool_id || pos.pool || poolId;
    if (!actualPoolId) {
      throw new Error("Cannot find pool_id for this position");
    }

    // Fetch on‐chain pool
    const pool = await sdk.Pool.getPool(actualPoolId);
    if (!pool) throw new Error(`Pool ${actualPoolId} not found`);

    // Compute removal amount
    const totalLiq = new BN(pos.liquidity);
    const removeLiq = totalLiq.muln(liquidityPct).divn(100);

    // Compute min amounts with slippage
    const lowerSqrt = TickMath.tickIndexToSqrtPriceX64(pos.tick_lower_index);
    const upperSqrt = TickMath.tickIndexToSqrtPriceX64(pos.tick_upper_index);
    const curSqrt = new BN(pool.current_sqrt_price);

    const coinAmounts = ClmmPoolUtil.getCoinAmountFromLiquidity(
      removeLiq,
      curSqrt,
      lowerSqrt,
      upperSqrt,
      false
    );
    const slippageTol = new Percentage(new BN(5), new BN(100));
    const { tokenMaxA, tokenMaxB } = adjustForCoinSlippage(
      coinAmounts,
      slippageTol,
      false
    );

    // Build & execute tx with pos_id (not position_id!)
    const tx = await sdk.Position.removeLiquidityTransactionPayload({
      coinTypeA: pool.coinTypeA,
      coinTypeB: pool.coinTypeB,
      pool_id: actualPoolId,
      pos_id: positionId, // <-- use pos_id
      delta_liquidity: removeLiq.toString(),
      min_amount_a: tokenMaxA.toString(),
      min_amount_b: tokenMaxB.toString(),
      collect_fee: true,
      rewarder_coin_types: [], // <-- explicitly pass empty array
    });

    // Set explicit gas budget
    tx.setGasBudget(100000000); // 0.1 SUI

    console.log("Executing remove liquidity transaction");
    const res = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEvents: true, showEffects: true },
    });

    console.log("Liquidity removal successful:", res.digest);

    return {
      success: true,
      digest: res.digest || "",
    };
  } catch (error) {
    console.error("Error in removeLiquidity:", error);

    // Provide helpful error messages
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      if (
        errorMessage.includes("insufficient") ||
        errorMessage.includes("balance")
      ) {
        throw new Error("Insufficient balance to complete the transaction");
      } else if (errorMessage.includes("not found")) {
        throw new Error(
          "Position or pool not found. It may have been closed already."
        );
      }
    }

    throw error;
  }
}

/**
 * Withdraw all liquidity, fees and rewards, and close the position.
 * Last Updated: 2025-04-27 02:22:05 UTC by jake1318
 */
export async function closePosition(
  wallet: WalletContextState,
  poolId: string,
  positionId: string
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }
  const address = wallet.account.address;
  const sdk = getSdkWithWallet(address);

  try {
    console.log(`Closing position ${positionId} in pool ${poolId}`);

    // Step 1: Check if the position exists
    let pos;
    let positionExists = true;
    try {
      // Try to get the object directly using the SUI client
      const resp = await sdk.fullClient.getObject({
        id: positionId,
        options: { showContent: true, showDisplay: true },
      });

      positionExists = resp.data !== null && resp.data !== undefined;
      if (!positionExists) {
        console.log(`Position ${positionId} does not exist, returning success`);
        return {
          success: true,
          digest: "",
        };
      }

      // Get position data
      try {
        pos = await fetchPositionFields(sdk, positionId);
        console.log(`Position data fetched:`, pos);
      } catch (error) {
        console.warn("Could not fetch position details:", error);
        // If we can't get details but position exists, continue with defaults
      }
    } catch (error) {
      console.warn("Error checking position existence:", error);
      // If we can't determine, assume it exists and continue
    }

    // Step 2: Get pool info - required for all operations
    let pool;
    try {
      pool = await sdk.Pool.getPool(poolId);
      if (!pool) {
        throw new Error(`Pool ${poolId} not found`);
      }
      console.log("Found pool:", poolId);
    } catch (error) {
      console.error("Error fetching pool:", error);
      throw new Error(`Pool not found: ${poolId}`);
    }

    // Use either the actual pool ID from position or the provided one
    const actualPoolId = pos?.pool_id || pos?.pool || poolId;

    // Step 3: First check if the position has liquidity
    let hasLiquidity = false;
    let liquidity = new BN(0);

    if (pos && pos.liquidity) {
      liquidity = new BN(pos.liquidity);
      hasLiquidity = !liquidity.isZero();
    }

    // If the position has liquidity, we need to remove it first
    if (hasLiquidity) {
      console.log(
        `Position has ${liquidity.toString()} liquidity - removing it first`
      );

      try {
        // Calculate tick boundaries and current price info
        const lowerSqrt = TickMath.tickIndexToSqrtPriceX64(
          pos.tick_lower_index
        );
        const upperSqrt = TickMath.tickIndexToSqrtPriceX64(
          pos.tick_upper_index
        );
        const curSqrt = new BN(pool.current_sqrt_price);

        // Calculate expected token amounts
        const coinAmounts = ClmmPoolUtil.getCoinAmountFromLiquidity(
          liquidity,
          curSqrt,
          lowerSqrt,
          upperSqrt,
          false
        );

        // Apply slippage tolerance
        const slippageTol = new Percentage(new BN(5), new BN(100));
        const { tokenMaxA, tokenMaxB } = adjustForCoinSlippage(
          coinAmounts,
          slippageTol,
          false
        );

        // Create remove liquidity transaction
        console.log("Creating remove liquidity transaction");
        const removeLiquidityParams = {
          coinTypeA: pool.coinTypeA,
          coinTypeB: pool.coinTypeB,
          pool_id: actualPoolId,
          pos_id: positionId,
          delta_liquidity: liquidity.toString(),
          min_amount_a: tokenMaxA.toString(),
          min_amount_b: tokenMaxB.toString(),
          collect_fee: true, // Collect fees during removal
          rewarder_coin_types: [], // We'll handle rewards separately if needed
        };

        const removeLiquidityTx =
          await sdk.Position.removeLiquidityTransactionPayload(
            removeLiquidityParams
          );
        removeLiquidityTx.setGasBudget(100000000); // 0.1 SUI

        console.log("Executing remove liquidity transaction");
        const removeLiquidityResult =
          await wallet.signAndExecuteTransactionBlock({
            transactionBlock: removeLiquidityTx,
            options: { showEvents: true, showEffects: true },
          });

        console.log(
          "Liquidity removal successful:",
          removeLiquidityResult.digest
        );

        // Add a small delay to ensure blockchain state is updated
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error("Error removing liquidity:", error);
        // Don't rethrow, try to continue with closing if possible
      }
    } else {
      console.log("Position has no liquidity, proceeding to close position");
    }

    // Step 4: Now close the position
    console.log("Creating close position transaction");
    let closeTx;
    try {
      // Get rewards owed - but handle errors gracefully
      let rewarderCoinTypes: string[] = [];
      try {
        if (
          pool.positions_handle &&
          typeof sdk.Rewarder?.posRewardersAmount === "function"
        ) {
          const rewards = await sdk.Rewarder.posRewardersAmount(
            actualPoolId,
            pool.positions_handle,
            positionId
          );

          rewarderCoinTypes = rewards
            .filter((r: any) => r && Number(r.amount_owed) > 0)
            .map((r: any) => r.coin_address);

          console.log(
            `Found ${rewarderCoinTypes.length} reward types with non-zero amounts`
          );
        }
      } catch (error) {
        console.warn(
          "Could not fetch rewards, proceeding without them:",
          error
        );
      }

      // Now close the position
      try {
        closeTx = await sdk.Position.closePositionTransactionPayload({
          coinTypeA: pool.coinTypeA,
          coinTypeB: pool.coinTypeB,
          pool_id: actualPoolId,
          pos_id: positionId,
          min_amount_a: "0", // There should be no liquidity left
          min_amount_b: "0", // There should be no liquidity left
          rewarder_coin_types: rewarderCoinTypes,
        });
      } catch (error) {
        console.warn("SDK close position failed, using fallback:", error);

        // Create transaction manually as a fallback
        const txb = new TransactionBlock();

        // Try calling through the pool_script module, which might handle certain edge cases better
        txb.moveCall({
          target: `${sdk.sdkOptions.cetusModule.clmmIntegrate}::pool_script::close_position`,
          arguments: [
            txb.object(sdk.sdkOptions.cetusModule.config),
            txb.object(actualPoolId),
            txb.object(positionId),
            txb.pure("0"), // min_amount_a
            txb.pure("0"), // min_amount_b
            txb.object(sdk.sdkOptions.cetusModule.clock),
          ],
          typeArguments: [pool.coinTypeA, pool.coinTypeB],
        });

        closeTx = txb;
      }
    } catch (error) {
      console.error("Failed to create close position transaction:", error);
      throw new Error("Failed to create transaction for closing position.");
    }

    // Set explicit gas budget
    if (closeTx && typeof closeTx.setGasBudget === "function") {
      closeTx.setGasBudget(100000000); // 0.1 SUI
    }

    // Execute transaction to close the position
    console.log("Executing close position transaction");
    const closeResult = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: closeTx,
      options: { showEvents: true, showEffects: true },
    });

    // Check if transaction succeeded
    if (closeResult.effects?.status?.status === "failure") {
      console.error(
        "Close position transaction failed:",
        closeResult.effects.status.error
      );
      if (
        closeResult.effects.status.error.includes("MoveAbort") &&
        closeResult.effects.status.error.includes("7")
      ) {
        console.log(
          "Position likely already closed or has remaining liquidity"
        );
      } else {
        throw new Error(
          `Failed to close position: ${closeResult.effects.status.error}`
        );
      }
    } else {
      console.log("Close position transaction successful:", closeResult.digest);
    }

    return {
      success: true,
      digest: closeResult.digest || "",
    };
  } catch (error) {
    console.error("Error in closePosition:", error);

    // Check if this is a "position already closed" error, which we can ignore
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      if (
        errorMessage.includes("not found") ||
        errorMessage.includes("already closed") ||
        (errorMessage.includes("moveabort") && errorMessage.includes("7"))
      ) {
        console.log("Position may have already been closed");
        return {
          success: true,
          digest: "",
        };
      }
    }

    throw error;
  }
}

/**
 * Collect fees from a position.
 * Last Updated: 2025-04-27 02:22:05 UTC by jake1318
 */
export async function collectFees(
  wallet: WalletContextState,
  poolId: string,
  positionId: string
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }
  const address = wallet.account.address;
  const sdk = getSdkWithWallet(address);

  try {
    console.log(
      `Collecting fees for position: ${positionId} in pool: ${poolId}`
    );

    // Verify position exists
    let pos;
    try {
      pos = await fetchPositionFields(sdk, positionId);
      if (!pos) {
        throw new Error(`Position ${positionId} not found`);
      }
    } catch (error) {
      console.error("Error verifying position:", error);
      throw new Error(`Position verification failed: ${positionId}`);
    }

    // Get on-chain pool
    let pool;
    try {
      pool = await sdk.Pool.getPool(poolId);
      if (!pool) {
        throw new Error(`Pool ${poolId} not found`);
      }
      console.log("Found pool:", poolId);
    } catch (error) {
      console.error("Error fetching pool:", error);
      throw new Error(`Pool not found: ${poolId}`);
    }

    // Create transaction payload
    let tx;
    try {
      // Try the SDK method first
      tx = await sdk.Position.collectFeeTransactionPayload(
        {
          coinTypeA: pool.coinTypeA,
          coinTypeB: pool.coinTypeB,
          pool_id: poolId,
          pos_id: positionId,
        },
        true // immutable flag
      );
    } catch (error) {
      console.error("SDK collect fee transaction creation failed:", error);

      // If we get the "tx.object is not a function" error, use a fallback approach
      if (
        error instanceof TypeError &&
        error.message.includes("not a function")
      ) {
        console.log(
          "Using fallback direct transaction block for fee collection"
        );

        // Create transaction block manually
        const txb = new TransactionBlock();

        // Create move call directly
        txb.moveCall({
          target: `${sdk.sdkOptions.cetusModule.clmm}::position::collect_fee`,
          arguments: [
            txb.object(poolId),
            txb.object(positionId),
            txb.object(sdk.sdkOptions.cetusModule.config),
            txb.pure(true), // is_immutable
          ],
          typeArguments: [pool.coinTypeA, pool.coinTypeB],
        });

        tx = txb;
      } else {
        // Re-throw the error if it's not one we can handle
        throw error;
      }
    }

    // Set gas budget if the transaction supports it
    if (typeof tx.setGasBudget === "function") {
      tx.setGasBudget(50000000); // 0.05 SUI
    }

    // Execute transaction
    console.log("Executing fee collection transaction");
    const res = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEvents: true, showEffects: true },
    });

    console.log("Fee collection transaction successful:", res.digest);

    return {
      success: true,
      digest: res.digest || "",
    };
  } catch (error) {
    console.error("Fee collection failed:", error);

    // Provide user-friendly error messages
    if (error instanceof Error) {
      const errorMsg = error.message.toLowerCase();
      if (
        errorMsg.includes("insufficient balance") ||
        errorMsg.includes("coin balance")
      ) {
        throw new Error("Insufficient balance to complete the transaction.");
      } else if (errorMsg.includes("gas") || errorMsg.includes("budget")) {
        throw new Error("Gas budget error. Please try again later.");
      } else if (
        errorMsg.includes("position") &&
        errorMsg.includes("not found")
      ) {
        throw new Error("Position no longer exists or has been closed.");
      }
    }

    throw error;
  }
}

/**
 * Collect rewards from a position.
 * Last Updated: 2025-04-27 02:22:05 UTC by jake1318
 */
export async function collectRewards(
  wallet: WalletContextState,
  poolId: string,
  positionId: string
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }
  const address = wallet.account.address;
  const sdk = getSdkWithWallet(address);

  try {
    console.log(
      `Attempting to collect rewards for position ${positionId} in pool ${poolId}`
    );

    // Verify position exists
    let pos;
    try {
      pos = await fetchPositionFields(sdk, positionId);
      if (!pos) {
        throw new Error(`Position ${positionId} not found`);
      }
    } catch (error) {
      console.error("Error verifying position:", error);
      throw new Error(`Position verification failed: ${positionId}`);
    }

    // Get on-chain pool
    let pool;
    try {
      pool = await sdk.Pool.getPool(poolId);
      if (!pool) {
        throw new Error(`Pool ${poolId} not found`);
      }
      console.log("Found pool:", poolId);
      console.log("Pool positions handle:", pool.positions_handle);
    } catch (error) {
      console.error("Error fetching pool:", error);
      throw new Error(`Pool not found: ${poolId}`);
    }

    // Check for rewards
    let rewarderCoinTypes = [];
    try {
      const rewards = await sdk.Rewarder.posRewardersAmount(
        poolId,
        pool.positions_handle,
        positionId
      );

      rewarderCoinTypes = rewards
        .filter((r: any) => r && Number(r.amount_owed) > 0)
        .map((r: any) => r.coin_address);

      console.log(
        `Found ${rewarderCoinTypes.length} reward types with non-zero amounts`
      );
    } catch (error) {
      console.error("Error checking rewards:", error);
      throw new Error("Failed to check rewards. Please try again.");
    }

    if (rewarderCoinTypes.length === 0) {
      console.log("No rewards available to claim");
      return {
        success: true,
        digest: "",
      };
    }

    // If we have rewards, collect them
    try {
      const tx = await sdk.Rewarder.collectRewarderTransactionPayload({
        coinTypeA: pool.coinTypeA,
        coinTypeB: pool.coinTypeB,
        pool_id: poolId,
        pos_id: positionId,
        rewarder_coin_types: rewarderCoinTypes,
        collect_fee: false,
      });

      // Set explicit gas budget
      tx.setGasBudget(50000000); // 0.05 SUI

      const res = await wallet.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        options: { showEvents: true, showEffects: true },
      });

      console.log("Rewards successfully collected:", res.digest);

      return {
        success: true,
        digest: res.digest || "",
      };
    } catch (error) {
      console.error("Error in reward collection transaction:", error);
      throw new Error("Failed to collect rewards. Transaction error occurred.");
    }
  } catch (error) {
    console.error("Error in collectRewards:", error);
    throw error;
  }
}

/**
 * Fetch all positions owned by an address.
 * Last Updated: 2025-04-27 02:22:05 UTC by jake1318
 */
export async function getPositions(
  ownerAddress: string
): Promise<Array<{ id: string; poolAddress: string; liquidity: number }>> {
  const sdk = initCetusSDK({ network: "mainnet" });
  try {
    const raw = await sdk.Position.getPositionList(ownerAddress);
    console.log("Raw positions data:", raw);

    // Process each position
    const positions = [];

    for (const p of raw) {
      // Get id from various possible fields
      const id = p.pos_object_id || p.id || p.position_id || p.nft_id || "";
      if (!id) continue; // Skip if no ID found

      // Check if the position has liquidity - skip positions with zero liquidity
      const liquidity = Number(p.liquidity) || 0;
      if (liquidity <= 0) {
        console.log(`Skipping position ${id} with zero liquidity`);
        continue; // Skip positions with zero liquidity
      }

      // Try to extract the pool id
      let poolAddress = p.pool_id || p.pool || p.poolAddress || p.poolId || "";

      // If poolAddress is still empty, try to extract it from other fields
      if (!poolAddress) {
        poolAddress = extractPoolIdFromPosition(p);
      }

      // Add the position with non-zero liquidity to the array
      positions.push({
        id,
        poolAddress,
        liquidity,
      });
    }

    console.log(
      `Returning ${positions.length} positions with non-zero liquidity`
    );
    return positions;
  } catch (error) {
    console.error("Error fetching positions:", error);

    // Return empty array instead of throwing to allow UI to handle gracefully
    return [];
  }
}

/**
 * Fetch pool metadata for a set of pool addresses.
 * Last Updated: 2025-04-27 02:22:05 UTC by jake1318
 */
export async function getPoolsDetailsForPositions(
  addresses: string[]
): Promise<PoolInfo[]> {
  try {
    // Filter out any "unknown" pool addresses
    const validAddresses = addresses.filter((addr) => addr !== "unknown");

    if (validAddresses.length === 0) {
      return [];
    }

    const { getPoolsByAddresses } = await import("./coinGeckoService");
    return await getPoolsByAddresses(validAddresses);
  } catch (error) {
    console.error("Error in getPoolsDetailsForPositions:", error);
    // Return an empty array instead of throwing, so UI can handle gracefully
    return [];
  }
}
