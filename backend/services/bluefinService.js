// services/bluefinService.js
// Last Updated: 2025-05-12 08:25:30 UTC by jake1318

import dotenv from "dotenv";
import { SuiClient, TransactionBlock } from "@mysten/sui";

dotenv.config();

// Updated Bluefin constants from environment variables or defaults
const SUI_RPC_URL =
  process.env.SUI_RPC_URL || "https://fullnode.mainnet.sui.io:443";
const BLUEFIN_PACKAGE_ID =
  process.env.BLUEFIN_PACKAGE_ID ||
  "0x6c796c3ab3421a68158e0df18e4657b2827b1f8fed5ed4b82dba9c935988711b";
const GLOBAL_CONFIG_ID =
  process.env.BLUEFIN_CONFIG_ID ||
  "0x03db251ba509a8d5d8777b6338836082335d93eecbdd09a11e190a1cff51c352";
const SUI_CLOCK_OBJECT_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000006"; // Sui Clock object (immutable)

// Initialize Sui client
const suiClient = new SuiClient({ url: SUI_RPC_URL });

/**
 * Calculate tick index from price
 * @param {number} price - Price value to convert to a tick
 * @param {number} tickSpacing - The tick spacing for this pool (e.g., 60)
 * @return {number} The tick index, rounded to the appropriate tick spacing
 */
export function priceToTick(price, tickSpacing = 60) {
  // Formula: tick = log_1.0001(price) = ln(price) / ln(1.0001)
  const rawTick = Math.floor(Math.log(price) / Math.log(1.0001));

  // Round down to the nearest valid tick index based on tickSpacing
  return Math.floor(rawTick / tickSpacing) * tickSpacing;
}

/**
 * Convert a tick index to price
 * @param {number} tick - The tick index
 * @return {number} The price corresponding to this tick
 */
export function tickToPrice(tick) {
  // Formula: price = 1.0001^tick
  return Math.pow(1.0001, tick);
}

/**
 * Get pool details by pool ID with additional field parsing
 * @param {string} poolId - The pool object ID
 * @return {Object} Enhanced pool details
 */
export async function getPoolDetails(poolId) {
  try {
    console.log(`Fetching pool details for ${poolId}`);
    const response = await suiClient.getObject({
      id: poolId,
      options: { showContent: true, showType: true, showOwner: true },
    });

    if (!response.data) {
      throw new Error(`Pool ${poolId} not found`);
    }

    // Extract relevant pool data
    const poolData = response.data;
    const fields = poolData.content?.fields || {};

    // Parse the pool data to get useful properties
    const parsed = {
      id: poolId,
      coinTypeA: fields.coin_a?.fields?.name,
      coinTypeB: fields.coin_b?.fields?.name,
      fee: Number(fields.fee || 0),
      tickSpacing: Number(fields.tick_spacing || 60),
      liquidity: fields.liquidity,
      currentSqrtPrice: fields.current_sqrt_price,
      currentTick: Number(fields.current_tick || 0),
    };

    // Calculate current price
    const currentPrice = tickToPrice(parsed.currentTick);

    return {
      ...poolData,
      parsed,
      currentPrice,
    };
  } catch (error) {
    console.error("Error fetching pool details:", error);
    throw error;
  }
}

/**
 * Get positions for a wallet address
 * @param {string} walletAddress - The owner's wallet address
 * @returns {Array} Array of position objects with enhanced details
 */
export async function getPositionsByOwner(walletAddress) {
  try {
    console.log(`Fetching positions for wallet ${walletAddress}`);
    const response = await suiClient.getOwnedObjects({
      owner: walletAddress,
      filter: {
        StructType: `${BLUEFIN_PACKAGE_ID}::position::Position`,
      },
      options: { showContent: true, showDisplay: true },
    });

    // Map response to a more useful format
    const positions = await Promise.all(
      response.data.map(async (item) => {
        const positionData = item.data;
        const fields = positionData?.content?.fields || {};
        const poolId = fields.pool_id || "";

        // Optionally fetch pool details to get coin types
        let poolDetails = {};
        try {
          if (poolId) {
            const poolData = await getPoolDetails(poolId);
            poolDetails = poolData.parsed || {};
          }
        } catch (err) {
          console.warn(`Failed to fetch details for pool ${poolId}:`, err);
        }

        return {
          id: positionData.objectId,
          poolAddress: poolId,
          liquidity: BigInt(fields.liquidity || "0"),
          lowerTick: Number(fields.lower_tick || 0),
          upperTick: Number(fields.upper_tick || 0),
          lowerPrice: tickToPrice(Number(fields.lower_tick || 0)),
          upperPrice: tickToPrice(Number(fields.upper_tick || 0)),
          feeGrowthInsideA: fields.fee_growth_inside_a,
          feeGrowthInsideB: fields.fee_growth_inside_b,
          tokenA: poolDetails.coinTypeA || "Unknown",
          tokenB: poolDetails.coinTypeB || "Unknown",
          tickSpacing: poolDetails.tickSpacing || 60,
          // Convert fields.owner to string if it exists
          owner: fields.owner ? fields.owner.toString() : walletAddress,
          type: "bluefin",
        };
      })
    );

    return positions;
  } catch (error) {
    console.error("Error fetching positions:", error);
    throw error;
  }
}

/**
 * Create a deposit transaction with both coins
 * @param {string} poolId - The Bluefin pool object ID
 * @param {number} amountA - Amount of token A (e.g., SUI)
 * @param {number} amountB - Amount of token B (e.g., USDC)
 * @param {Object} options - Options for creating the deposit
 * @param {Array<string>} options.coinAObjectIds - List of Coin A object IDs to use
 * @param {Array<string>} options.coinBObjectIds - List of Coin B object IDs to use
 * @param {Object} options.priceRange - Price range configuration
 * @param {number} options.priceRange.currentPrice - Current price of token A in terms of token B
 * @param {number} options.priceRange.lowerPriceMultiplier - Lower bound multiplier (e.g., 0.5 for 50% below current price)
 * @param {number} options.priceRange.upperPriceMultiplier - Upper bound multiplier (e.g., 2.0 for 100% above current price)
 * @param {number} options.priceRange.tickSpacing - Tick spacing for this pool (defaults to 60)
 * @param {string} options.coinTypeA - Coin A type (fully qualified Move type)
 * @param {string} options.coinTypeB - Coin B type (fully qualified Move type)
 * @param {number} options.slippagePct - Slippage tolerance in percentage (e.g., 0.5 for 0.5%)
 */
export async function createDepositTransaction(
  poolId,
  amountA,
  amountB,
  options = {}
) {
  try {
    console.log(
      `Creating deposit transaction for pool ${poolId} with amounts: A=${amountA}, B=${amountB}`
    );

    // Default options
    const {
      coinAObjectIds = [], // Default to empty if not provided
      coinBObjectIds = [], // Default to empty if not provided
      priceRange = {}, // Default to empty if not provided
      slippagePct = 0.5, // Default 0.5% slippage
    } = options;

    // Fetch pool details to get coin types and tick spacing if not provided
    const pool = options.pool || (await getPoolDetails(poolId));
    const tickSpacing =
      options.priceRange?.tickSpacing || pool.parsed?.tickSpacing || 60;
    const coinTypeA =
      options.coinTypeA || pool.parsed?.coinTypeA || "0x2::sui::SUI";
    const coinTypeB =
      options.coinTypeB ||
      pool.parsed?.coinTypeB ||
      "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";
    const currentPrice =
      options.priceRange?.currentPrice || pool.currentPrice || 4.08;

    // Get price range multipliers
    const {
      lowerPriceMultiplier = 0.5, // 50% below current price by default
      upperPriceMultiplier = 2.0, // 100% above current price by default
    } = priceRange;

    // Calculate lower and upper prices
    const lowerPrice = currentPrice * lowerPriceMultiplier;
    const upperPrice = currentPrice * upperPriceMultiplier;

    // Convert prices to ticks
    const lowerTick = priceToTick(lowerPrice, tickSpacing);
    const upperTick = priceToTick(upperPrice, tickSpacing);

    console.log(
      `Setting tick range based on prices: ${lowerPrice} to ${upperPrice}`
    );
    console.log(`Calculated ticks: ${lowerTick} to ${upperTick}`);

    // Get token decimals (could be fetched from the pool or token metadata)
    const decimalsA = options.decimalsA || 9; // SUI has 9 decimals
    const decimalsB = options.decimalsB || 6; // USDC has 6 decimals

    // Convert amounts to on-chain units
    const amountAOnChain = BigInt(
      Math.floor(amountA * Math.pow(10, decimalsA))
    );
    const amountBOnChain = BigInt(
      Math.floor(amountB * Math.pow(10, decimalsB))
    );

    console.log(`On-chain amounts: A=${amountAOnChain}, B=${amountBOnChain}`);

    // Create transaction block
    const tx = new TransactionBlock();

    // Handle coin inputs for both assets
    let coinAInput, coinBInput;

    // Handle Coin A
    if (coinAObjectIds.length > 0) {
      // User provided specific coins
      if (coinAObjectIds.length === 1) {
        // Only one coin, use it directly
        const coinA = tx.object(coinAObjectIds[0]);
        coinAInput = tx.splitCoins(coinA, [tx.pure(amountAOnChain)]);
      } else {
        // Multiple coins, merge and split
        const primaryCoinA = tx.object(coinAObjectIds[0]);
        const otherCoinsA = coinAObjectIds.slice(1).map((id) => tx.object(id));
        const mergedCoinA = tx.mergeCoins(primaryCoinA, otherCoinsA);
        coinAInput = tx.splitCoins(mergedCoinA, [tx.pure(amountAOnChain)]);
      }
    } else if (amountAOnChain > 0) {
      // No specific coins provided, use gas coin for SUI
      coinAInput = tx.splitCoins(tx.gas, [tx.pure(amountAOnChain)]);
    } else {
      // Zero amount, use empty placeholder
      coinAInput = tx.pure(0);
    }

    // Handle Coin B
    if (coinBObjectIds.length > 0) {
      if (coinBObjectIds.length === 1) {
        const coinB = tx.object(coinBObjectIds[0]);
        coinBInput = tx.splitCoins(coinB, [tx.pure(amountBOnChain)]);
      } else {
        const primaryCoinB = tx.object(coinBObjectIds[0]);
        const otherCoinsB = coinBObjectIds.slice(1).map((id) => tx.object(id));
        const mergedCoinB = tx.mergeCoins(primaryCoinB, otherCoinsB);
        coinBInput = tx.splitCoins(mergedCoinB, [tx.pure(amountBOnChain)]);
      }
    } else if (amountBOnChain > 0) {
      // If no coin B objects but amount > 0, we can't proceed
      throw new Error(
        "Coin B object IDs must be provided for non-zero amount B"
      );
    } else {
      // Zero amount, use empty placeholder
      coinBInput = tx.pure(0);
    }

    // First create the position
    const position = tx.moveCall({
      target: `${BLUEFIN_PACKAGE_ID}::pool::open_position`,
      typeArguments: [coinTypeA, coinTypeB],
      arguments: [
        tx.object(GLOBAL_CONFIG_ID), // Global config is required for Bluefin v2
        tx.object(poolId),
        tx.pure(lowerTick),
        tx.pure(upperTick),
      ],
    });

    // Calculate minimum amounts for slippage protection
    const minLiquidity = 0; // For simplicity, set to 0

    // Then add liquidity to the position
    tx.moveCall({
      target: `${BLUEFIN_PACKAGE_ID}::gateway::add_liquidity`,
      typeArguments: [coinTypeA, coinTypeB],
      arguments: [
        tx.object(GLOBAL_CONFIG_ID),
        tx.object(poolId),
        position,
        coinAInput,
        coinBInput,
        tx.pure(minLiquidity),
      ],
    });

    console.log("Transaction block created successfully");

    // Serialize the transaction block to a base64 string
    const serializedTx = await tx.serialize();

    return {
      success: true,
      transaction: serializedTx,
      coinAAmount: amountAOnChain.toString(),
      coinBAmount: amountBOnChain.toString(),
      lowerTick,
      upperTick,
      lowerPrice,
      upperPrice,
      poolDetails: {
        coinTypeA,
        coinTypeB,
        decimalsA,
        decimalsB,
        tickSpacing,
      },
    };
  } catch (error) {
    console.error("Error creating deposit transaction:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create a remove liquidity transaction with dynamic amount calculation
 * @param {string} poolId - The Bluefin pool object ID
 * @param {string} positionId - The position object ID
 * @param {number} percent - Percentage of liquidity to remove (1-100)
 * @param {Object} options - Additional options
 * @param {BigInt} options.currentLiquidity - Current liquidity in the position
 * @param {string} options.coinTypeA - Coin A type (fully qualified Move type)
 * @param {string} options.coinTypeB - Coin B type (fully qualified Move type)
 * @param {number} options.slippagePct - Slippage tolerance in percentage
 */
export async function createRemoveLiquidityTransaction(
  poolId,
  positionId,
  percent = 100,
  options = {}
) {
  try {
    console.log(
      `Creating remove liquidity transaction for position ${positionId} (${percent}%)`
    );

    if (percent <= 0 || percent > 100) {
      throw new Error("Percentage must be between 1 and 100");
    }

    // Get position details if not provided
    let currentLiquidity = options.currentLiquidity;
    if (!currentLiquidity) {
      try {
        const position = await suiClient.getObject({
          id: positionId,
          options: { showContent: true },
        });
        currentLiquidity = BigInt(
          position.data?.content?.fields?.liquidity || "0"
        );
      } catch (err) {
        console.error("Error fetching position details:", err);
        throw new Error(`Failed to fetch liquidity for position ${positionId}`);
      }
    }

    // Calculate liquidity to remove based on percentage
    const liquidityToRemove =
      (currentLiquidity * BigInt(percent)) / BigInt(100);
    console.log(
      `Removing ${liquidityToRemove} liquidity (${percent}% of ${currentLiquidity})`
    );

    // Fetch pool details to get coin types if not provided
    let coinTypeA = options.coinTypeA;
    let coinTypeB = options.coinTypeB;

    if (!coinTypeA || !coinTypeB) {
      try {
        const pool = await getPoolDetails(poolId);
        coinTypeA = pool.parsed?.coinTypeA || "0x2::sui::SUI";
        coinTypeB =
          pool.parsed?.coinTypeB ||
          "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";
      } catch (err) {
        console.error("Error fetching pool details:", err);
        // Fallback to default types
        coinTypeA = "0x2::sui::SUI";
        coinTypeB =
          "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";
      }
    }

    // Create a transaction block
    const tx = new TransactionBlock();

    // Calculate minimum expected amounts for slippage protection
    // For simplicity, using 0 here, but in a real app you would calculate based on current pool prices
    const minAmountA = "0";
    const minAmountB = "0";

    // Call gateway::remove_liquidity
    tx.moveCall({
      target: `${BLUEFIN_PACKAGE_ID}::gateway::remove_liquidity`,
      typeArguments: [coinTypeA, coinTypeB],
      arguments: [
        tx.object(GLOBAL_CONFIG_ID),
        tx.object(poolId),
        tx.object(positionId),
        tx.pure(liquidityToRemove.toString()),
        tx.pure(minAmountA),
        tx.pure(minAmountB),
      ],
    });

    console.log("Remove liquidity transaction created successfully");

    // Serialize the transaction block to a base64 string
    const serializedTx = await tx.serialize();

    return {
      success: true,
      transaction: serializedTx,
      liquidityToRemove: liquidityToRemove.toString(),
      percent,
    };
  } catch (error) {
    console.error("Error creating remove liquidity transaction:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create a collect fees transaction
 * @param {string} poolId - The Bluefin pool object ID
 * @param {string} positionId - The position object ID
 * @param {Object} options - Additional options
 * @param {string} options.coinTypeA - Coin A type (fully qualified Move type)
 * @param {string} options.coinTypeB - Coin B type (fully qualified Move type)
 */
export async function createCollectFeesTransaction(
  poolId,
  positionId,
  options = {}
) {
  try {
    console.log(`Creating collect fees transaction for position ${positionId}`);

    // Fetch pool details to get coin types if not provided
    let coinTypeA = options.coinTypeA;
    let coinTypeB = options.coinTypeB;

    if (!coinTypeA || !coinTypeB) {
      try {
        const pool = await getPoolDetails(poolId);
        coinTypeA = pool.parsed?.coinTypeA || "0x2::sui::SUI";
        coinTypeB =
          pool.parsed?.coinTypeB ||
          "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";
      } catch (err) {
        console.error("Error fetching pool details:", err);
        // Fallback to default types
        coinTypeA = "0x2::sui::SUI";
        coinTypeB =
          "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";
      }
    }

    // Create a transaction block
    const tx = new TransactionBlock();

    // Call gateway::collect_fee
    tx.moveCall({
      target: `${BLUEFIN_PACKAGE_ID}::gateway::collect_fee`,
      typeArguments: [coinTypeA, coinTypeB],
      arguments: [
        tx.object(GLOBAL_CONFIG_ID),
        tx.object(poolId),
        tx.object(positionId),
      ],
    });

    console.log("Collect fees transaction created successfully");

    // Serialize the transaction block to a base64 string
    const serializedTx = await tx.serialize();

    return {
      success: true,
      transaction: serializedTx,
      positionId,
      poolId,
    };
  } catch (error) {
    console.error("Error creating collect fees transaction:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create a collect rewards transaction for incentivized pools, supporting multiple reward types
 * @param {string} poolId - The Bluefin pool object ID
 * @param {string} positionId - The position object ID
 * @param {Object} options - Additional options
 * @param {Array<string>} options.rewardCoinTypes - Array of reward coin types to collect
 * @param {string} options.coinTypeA - Coin A type (fully qualified Move type)
 * @param {string} options.coinTypeB - Coin B type (fully qualified Move type)
 */
export async function createCollectRewardsTransaction(
  poolId,
  positionId,
  options = {}
) {
  try {
    console.log(
      `Creating collect rewards transaction for position ${positionId}`
    );

    // Fetch pool details to get coin types if not provided
    let coinTypeA = options.coinTypeA;
    let coinTypeB = options.coinTypeB;

    if (!coinTypeA || !coinTypeB) {
      try {
        const pool = await getPoolDetails(poolId);
        coinTypeA = pool.parsed?.coinTypeA || "0x2::sui::SUI";
        coinTypeB =
          pool.parsed?.coinTypeB ||
          "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";
      } catch (err) {
        console.error("Error fetching pool details:", err);
        // Fallback to default types
        coinTypeA = "0x2::sui::SUI";
        coinTypeB =
          "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";
      }
    }

    // Get reward coin types or use default
    const rewardCoinTypes = options.rewardCoinTypes || [
      "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::blue::BLUE",
    ];

    // Create a transaction block
    const tx = new TransactionBlock();

    // Create separate calls for each reward type
    for (const rewardCoinType of rewardCoinTypes) {
      console.log(`Adding collect reward call for ${rewardCoinType}`);

      // Call gateway::collect_reward for this reward type
      tx.moveCall({
        target: `${BLUEFIN_PACKAGE_ID}::gateway::collect_reward`,
        typeArguments: [coinTypeA, coinTypeB, rewardCoinType],
        arguments: [
          tx.object(GLOBAL_CONFIG_ID),
          tx.object(poolId),
          tx.object(positionId),
          tx.object(SUI_CLOCK_OBJECT_ID), // Clock needed for reward calculation
        ],
      });
    }

    console.log("Collect rewards transaction created successfully");

    // Serialize the transaction block to a base64 string
    const serializedTx = await tx.serialize();

    return {
      success: true,
      transaction: serializedTx,
      positionId,
      poolId,
      rewardCoinTypes,
    };
  } catch (error) {
    console.error("Error creating collect rewards transaction:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create an all-in-one transaction to collect both fees and rewards
 * @param {string} poolId - The Bluefin pool object ID
 * @param {string} positionId - The position object ID
 * @param {Object} options - Additional options
 * @param {Array<string>} options.rewardCoinTypes - Array of reward coin types to collect
 * @param {string} options.coinTypeA - Coin A type (fully qualified Move type)
 * @param {string} options.coinTypeB - Coin B type (fully qualified Move type)
 */
export async function createCollectFeesAndRewardsTransaction(
  poolId,
  positionId,
  options = {}
) {
  try {
    console.log(
      `Creating collect fees and rewards transaction for position ${positionId}`
    );

    // Fetch pool details to get coin types if not provided
    let coinTypeA = options.coinTypeA;
    let coinTypeB = options.coinTypeB;

    if (!coinTypeA || !coinTypeB) {
      try {
        const pool = await getPoolDetails(poolId);
        coinTypeA = pool.parsed?.coinTypeA || "0x2::sui::SUI";
        coinTypeB =
          pool.parsed?.coinTypeB ||
          "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";
      } catch (err) {
        console.error("Error fetching pool details:", err);
        // Fallback to default types
        coinTypeA = "0x2::sui::SUI";
        coinTypeB =
          "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";
      }
    }

    // Get reward coin types or use default
    const rewardCoinTypes = options.rewardCoinTypes || [
      "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::blue::BLUE",
    ];

    // Create a transaction block
    const tx = new TransactionBlock();

    // First collect trading fees
    tx.moveCall({
      target: `${BLUEFIN_PACKAGE_ID}::gateway::collect_fee`,
      typeArguments: [coinTypeA, coinTypeB],
      arguments: [
        tx.object(GLOBAL_CONFIG_ID),
        tx.object(poolId),
        tx.object(positionId),
      ],
    });

    // Then collect each reward type
    for (const rewardCoinType of rewardCoinTypes) {
      tx.moveCall({
        target: `${BLUEFIN_PACKAGE_ID}::gateway::collect_reward`,
        typeArguments: [coinTypeA, coinTypeB, rewardCoinType],
        arguments: [
          tx.object(GLOBAL_CONFIG_ID),
          tx.object(poolId),
          tx.object(positionId),
          tx.object(SUI_CLOCK_OBJECT_ID),
        ],
      });
    }

    console.log("Collect fees and rewards transaction created successfully");

    // Serialize the transaction block to a base64 string
    const serializedTx = await tx.serialize();

    return {
      success: true,
      transaction: serializedTx,
      positionId,
      poolId,
      rewardCoinTypes,
    };
  } catch (error) {
    console.error(
      "Error creating collect fees and rewards transaction:",
      error
    );
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create a close position transaction - removes all liquidity and collects all rewards
 * @param {string} poolId - The Bluefin pool object ID
 * @param {string} positionId - The position object ID
 * @param {Object} options - Additional options
 * @param {Array<string>} options.rewardCoinTypes - Array of reward coin types
 * @param {string} options.coinTypeA - Coin A type (fully qualified Move type)
 * @param {string} options.coinTypeB - Coin B type (fully qualified Move type)
 */
export async function createClosePositionTransaction(
  poolId,
  positionId,
  options = {}
) {
  try {
    console.log(
      `Creating close position transaction for position ${positionId}`
    );

    // Fetch pool details to get coin types if not provided
    let coinTypeA = options.coinTypeA;
    let coinTypeB = options.coinTypeB;

    if (!coinTypeA || !coinTypeB) {
      try {
        const pool = await getPoolDetails(poolId);
        coinTypeA = pool.parsed?.coinTypeA || "0x2::sui::SUI";
        coinTypeB =
          pool.parsed?.coinTypeB ||
          "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";
      } catch (err) {
        console.error("Error fetching pool details:", err);
        // Fallback to default types
        coinTypeA = "0x2::sui::SUI";
        coinTypeB =
          "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";
      }
    }

    // Create a transaction block
    const tx = new TransactionBlock();

    // Define arguments for close_position
    const args = [
      tx.object(GLOBAL_CONFIG_ID),
      tx.object(poolId),
      tx.object(positionId),
      tx.object(SUI_CLOCK_OBJECT_ID), // Clock object needed for reward calculation
    ];

    // Get reward coin types
    const rewardCoinTypes = options.rewardCoinTypes || [];

    if (rewardCoinTypes.length > 0) {
      // If we have reward types, call close_position with the first reward type
      // For multiple reward types, we'll have to make separate reward collection calls
      console.log(`Closing position with reward type: ${rewardCoinTypes[0]}`);

      tx.moveCall({
        target: `${BLUEFIN_PACKAGE_ID}::gateway::close_position`,
        typeArguments: [coinTypeA, coinTypeB, rewardCoinTypes[0]],
        arguments: args,
      });

      // For additional reward types, make separate collect_reward calls
      for (let i = 1; i < rewardCoinTypes.length; i++) {
        console.log(`Collecting additional reward type: ${rewardCoinTypes[i]}`);

        tx.moveCall({
          target: `${BLUEFIN_PACKAGE_ID}::gateway::collect_reward`,
          typeArguments: [coinTypeA, coinTypeB, rewardCoinTypes[i]],
          arguments: [
            tx.object(GLOBAL_CONFIG_ID),
            tx.object(poolId),
            tx.object(positionId),
            tx.object(SUI_CLOCK_OBJECT_ID),
          ],
        });
      }
    } else {
      // No specific reward types, just close the position
      console.log("Closing position with no specified reward types");

      tx.moveCall({
        target: `${BLUEFIN_PACKAGE_ID}::gateway::close_position`,
        typeArguments: [coinTypeA, coinTypeB],
        arguments: args,
      });
    }

    console.log("Close position transaction created successfully");

    // Serialize the transaction block to a base64 string
    const serializedTx = await tx.serialize();

    return {
      success: true,
      transaction: serializedTx,
      positionId,
      poolId,
      rewardCoinTypes,
    };
  } catch (error) {
    console.error("Error creating close position transaction:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Helper function to determine if a pool belongs to Bluefin
 * @param {string} poolAddress - Pool address
 * @param {string} dex - DEX name
 * @returns {boolean} True if this is a Bluefin pool
 */
export function isBluefinPool(poolAddress, dex) {
  return dex?.toLowerCase() === "bluefin";
}
