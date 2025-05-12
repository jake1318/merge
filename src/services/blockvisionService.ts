import axios from "axios";

const BLOCKVISION_API_BASE_URL = "https://api.blockvision.org";
const BLOCKVISION_API_KEY =
  import.meta.env.VITE_BLOCKVISION_API_KEY || "2ugIlviim3ywrgFI0BMniB9wdzU";

const blockvisionApi = axios.create({
  baseURL: BLOCKVISION_API_BASE_URL,
  headers: {
    accept: "application/json",
    "x-api-key": BLOCKVISION_API_KEY,
  },
});

blockvisionApi.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error(
      "Blockvision API Error:",
      error.response?.data || error.message
    );
    return Promise.reject(error);
  }
);

export interface AccountCoin {
  coinType: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: string;
  verified: boolean;
  logo: string;
  usdValue: string;
  objects: number;
  price: string;
  priceChangePercentage24H: string;
}

export const blockvisionService = {
  getCoinDetail: async (coinType: string) => {
    try {
      const response = await blockvisionApi.get("/v2/sui/coin/detail", {
        params: { coinType },
      });
      const { code, message, result } = response.data;
      if (code === 200 && result) {
        return { data: result };
      } else {
        throw new Error(
          `Blockvision getCoinDetail error: code=${code}, msg=${message}`
        );
      }
    } catch (error) {
      console.error(`Error fetching coin detail for ${coinType}:`, error);
      throw error;
    }
  },

  getAccountCoins: async (account: string) => {
    try {
      console.log(`Fetching account coins for: ${account}`);
      const response = await blockvisionApi.get("/v2/sui/account/coins", {
        params: { account },
      });
      const { code, message, result } = response.data;
      console.log(`BlockVision API response code: ${code}`);
      if (code === 200 && result && Array.isArray(result.coins)) {
        return { data: result.coins as AccountCoin[] };
      } else {
        throw new Error(
          "Blockvision getAccountCoins error: unexpected response shape"
        );
      }
    } catch (error) {
      console.error("Error fetching account coins:", error);
      throw error;
    }
  },

  getAccountActivities: async (address: string, packageIds: string[] = []) => {
    try {
      const packageIdsParam = packageIds.length ? packageIds.join(",") : "";
      const response = await blockvisionApi.get("/v2/sui/account/activities", {
        params: { address, packageIds: packageIdsParam },
      });
      const { code, message, result } = response.data;
      if (code === 200 && result) {
        return { data: result };
      } else {
        throw new Error(
          `Blockvision getAccountActivities error: code=${code}, msg=${message}`
        );
      }
    } catch (error) {
      console.error("Error fetching account activities:", error);
      throw error;
    }
  },

  getWalletValue: async (account: string) => {
    try {
      const { data: coins } = await blockvisionService.getAccountCoins(account);
      if (!coins || !Array.isArray(coins)) {
        throw new Error("Invalid response format from getAccountCoins");
      }
      const totalUsdValue = coins
        .reduce((sum, coin) => {
          const usdValue = parseFloat(coin.usdValue || "0");
          return sum + usdValue;
        }, 0)
        .toFixed(2);
      return {
        totalUsdValue,
        coins,
      };
    } catch (error) {
      console.error("Error calculating wallet value:", error);
      throw error;
    }
  },
};

export default blockvisionService;
import { getTokenMetadata, TokenMetadata } from "./birdeyeService";

const BLOCKVISION_BASE_URL = "https://api.blockvision.org/v2/sui";

// Token price mapping - this could be fetched from an API
const TOKEN_PRICES: Record<string, number> = {
  SUI: 1.05,
  USDC: 1.0,
  USDT: 1.0,
  CETUS: 0.02,
};

// Interface for Cetus LP positions from the API response
interface CetusPosition {
  apr: number;
  balanceA: string;
  balanceB: string;
  coinTypeA: string;
  coinTypeB: string;
  coinTypeADecimals?: number;
  coinTypeBDecimals?: number;
  fees: {
    feeOwedA: string;
    feeOwedB: string;
    position_id: string;
  };
  image_url: string;
  isOut: boolean;
  name: string;
  pool: string;
  position: string;
  rewards: Array<{
    amount_owed: string;
    coinType: string;
    coin_address: string;
    decimals: number;
  }>;
  type: string;
}

// Main response interface
interface BlockVisionDefiResponse {
  code: number;
  message: string;
  result: {
    cetus?: {
      lps: CetusPosition[];
      vaults: any[];
    };
  };
}

// Reward information interface
export interface RewardInfo {
  tokenSymbol: string;
  tokenAddress: string;
  amount: string;
  formatted: string;
  decimals: number;
  valueUsd: number;
  metadata?: TokenMetadata;
}

// Fee information interface
export interface FeeInfo {
  tokenASymbol: string;
  tokenBSymbol: string;
  tokenAAddress: string;
  tokenBAddress: string;
  amountA: string;
  amountB: string;
  valueUsd: number;
}

// Normalized position interface
export interface NormalizedPosition {
  id: string;
  poolAddress: string;
  liquidity: number;
  valueUsd: number;
  tokenA: string;
  tokenB: string;
  tokenAAddress: string;
  tokenBAddress: string;
  tokenAMetadata?: TokenMetadata;
  tokenBMetadata?: TokenMetadata;
  balanceA: string;
  balanceB: string;
  valueA: number;
  valueB: number;
  protocol: string;
  apr: number;
  isOutOfRange: boolean;
  rewards: RewardInfo[];
  fees: FeeInfo;
}

// Normalized pool group
export interface PoolGroup {
  poolAddress: string;
  poolName: string;
  protocol: string;
  positions: NormalizedPosition[];
  totalLiquidity: number;
  totalValueUsd: number;
  totalRewardsUsd: number;
  totalFeesUsd: number;
  apr: number;
  tokenA: string;
  tokenB: string;
  tokenAAddress: string;
  tokenBAddress: string;
  tokenAMetadata?: TokenMetadata;
  tokenBMetadata?: TokenMetadata;
}

/**
 * Extract token symbol from a coin type string
 */
function extractTokenSymbol(coinType: string): string {
  const parts = coinType.split("::");
  return parts.length > 2 ? parts[2] : "Unknown";
}

/**
 * Format a hex string as a decimal
 */
function hexToDecimal(hex: string): number {
  return parseInt(hex, 16);
}

/**
 * Calculate token value in USD
 */
function calculateTokenValueUsd(
  amount: string,
  decimals: number,
  symbol: string
): number {
  // Get price for this token
  const price = TOKEN_PRICES[symbol] || 0;

  // Calculate value
  const value = (parseInt(amount) / Math.pow(10, decimals)) * price;
  return value;
}

/**
 * Get DeFi portfolio for a given address
 */
export async function getDefiPortfolio(address: string): Promise<PoolGroup[]> {
  try {
    // First, try to get token prices from an API
    await updateTokenPrices();

    const response = await fetch(
      `${BLOCKVISION_BASE_URL}/account/defiPortfolio?address=${address}&protocol=cetus`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": BLOCKVISION_API_KEY,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`BlockVision API error: ${response.status}`);
    }

    const data: BlockVisionDefiResponse = await response.json();

    // Check if we have Cetus data
    if (
      !data.result.cetus ||
      !data.result.cetus.lps ||
      data.result.cetus.lps.length === 0
    ) {
      console.log("No Cetus positions found in BlockVision data");
      return [];
    }

    console.log("BlockVision Cetus data:", data.result.cetus);

    // Process Cetus LP positions
    const cetusPositions = data.result.cetus.lps;

    // Group positions by pool
    const poolGroups: Record<string, PoolGroup> = {};

    // Collect all unique token addresses for metadata fetching
    const allTokenAddresses = new Set<string>();

    // First pass - collect token addresses
    for (const position of cetusPositions) {
      allTokenAddresses.add(position.coinTypeA);
      allTokenAddresses.add(position.coinTypeB);

      // Add reward token addresses
      position.rewards.forEach((reward) => {
        allTokenAddresses.add(reward.coinType);
      });
    }

    // Fetch token metadata in batch
    console.log("Fetching metadata for tokens:", Array.from(allTokenAddresses));
    const tokenMetadata: Record<string, TokenMetadata> = {};

    // Fetch metadata for each token (could be optimized with a batch API if available)
    await Promise.all(
      Array.from(allTokenAddresses).map(async (tokenAddress) => {
        const metadata = await getTokenMetadata(tokenAddress);
        if (metadata) {
          tokenMetadata[tokenAddress] = metadata;
        }
      })
    );

    console.log("Fetched token metadata:", tokenMetadata);

    // Second pass - process positions with metadata
    for (const position of cetusPositions) {
      // Extract token symbols
      const tokenA = extractTokenSymbol(position.coinTypeA);
      const tokenB = extractTokenSymbol(position.coinTypeB);

      // Get token metadata
      const tokenAMetadata = tokenMetadata[position.coinTypeA];
      const tokenBMetadata = tokenMetadata[position.coinTypeB];

      // Get token decimals - use metadata if available, otherwise fallback
      const decimalsA =
        tokenAMetadata?.decimals ||
        position.coinTypeADecimals ||
        getTokenDecimals(tokenA);
      const decimalsB =
        tokenBMetadata?.decimals ||
        position.coinTypeBDecimals ||
        getTokenDecimals(tokenB);

      // Calculate USD values
      const valueA = calculateTokenValueUsd(
        position.balanceA,
        decimalsA,
        tokenA
      );
      const valueB = calculateTokenValueUsd(
        position.balanceB,
        decimalsB,
        tokenB
      );
      const totalValueUsd = valueA + valueB;

      // Process rewards with USD values
      const rewards: RewardInfo[] = position.rewards.map((reward) => {
        const symbol = extractTokenSymbol(reward.coinType);
        const amount = reward.amount_owed;
        const decimals = reward.decimals;
        // Format the amount with proper decimals
        const formatted = (parseInt(amount) / Math.pow(10, decimals)).toFixed(
          decimals
        );
        // Calculate USD value
        const valueUsd = calculateTokenValueUsd(amount, decimals, symbol);
        // Get reward token metadata
        const metadata = tokenMetadata[reward.coinType];

        return {
          tokenSymbol: symbol,
          tokenAddress: reward.coinType,
          amount,
          formatted,
          decimals,
          valueUsd,
          metadata,
        };
      });

      // Calculate total rewards value
      const rewardsValueUsd = rewards.reduce((sum, r) => sum + r.valueUsd, 0);

      // Process fees with USD values
      const feeAmountA = hexToDecimal(position.fees.feeOwedA).toString();
      const feeAmountB = hexToDecimal(position.fees.feeOwedB).toString();
      const feeValueA = calculateTokenValueUsd(feeAmountA, decimalsA, tokenA);
      const feeValueB = calculateTokenValueUsd(feeAmountB, decimalsB, tokenB);
      const feesValueUsd = feeValueA + feeValueB;

      const fees: FeeInfo = {
        tokenASymbol: tokenA,
        tokenBSymbol: tokenB,
        tokenAAddress: position.coinTypeA,
        tokenBAddress: position.coinTypeB,
        amountA: feeAmountA,
        amountB: feeAmountB,
        valueUsd: feesValueUsd,
      };

      // Create a normalized position
      const normalizedPosition: NormalizedPosition = {
        id: position.position,
        poolAddress: position.pool,
        liquidity: parseInt(position.balanceA) + parseInt(position.balanceB), // Raw liquidity
        valueUsd: totalValueUsd,
        tokenA,
        tokenB,
        tokenAAddress: position.coinTypeA,
        tokenBAddress: position.coinTypeB,
        tokenAMetadata,
        tokenBMetadata,
        balanceA: position.balanceA,
        balanceB: position.balanceB,
        valueA,
        valueB,
        protocol: "Cetus",
        apr: position.apr || 0,
        isOutOfRange: position.isOut,
        rewards,
        fees,
      };

      // Add to pool group
      if (!poolGroups[position.pool]) {
        poolGroups[position.pool] = {
          poolAddress: position.pool,
          poolName: `${tokenA}/${tokenB}`,
          protocol: "Cetus",
          positions: [],
          totalLiquidity: 0,
          totalValueUsd: 0,
          totalRewardsUsd: 0,
          totalFeesUsd: 0,
          apr: position.apr || 0,
          tokenA,
          tokenB,
          tokenAAddress: position.coinTypeA,
          tokenBAddress: position.coinTypeB,
          tokenAMetadata,
          tokenBMetadata,
        };
      }

      poolGroups[position.pool].positions.push(normalizedPosition);
      poolGroups[position.pool].totalLiquidity += normalizedPosition.liquidity;
      poolGroups[position.pool].totalValueUsd += normalizedPosition.valueUsd;
      poolGroups[position.pool].totalRewardsUsd += rewardsValueUsd;
      poolGroups[position.pool].totalFeesUsd += feesValueUsd;
    }

    return Object.values(poolGroups);
  } catch (error) {
    console.error("Failed to fetch DeFi portfolio:", error);
    return [];
  }
}

/**
 * Get token decimals based on symbol
 */
function getTokenDecimals(symbol: string): number {
  switch (symbol.toUpperCase()) {
    case "SUI":
      return 9;
    case "USDC":
    case "USDT":
      return 6;
    case "CETUS":
      return 9;
    default:
      return 8; // Default decimals
  }
}

/**
 * Update token prices from a price API
 * In a real app, this would fetch from CoinGecko or similar
 */
async function updateTokenPrices(): Promise<void> {
  try {
    // This is a placeholder - in a real app, you'd fetch prices from an API
    // For example:
    // const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=sui,cetus&vs_currencies=usd");
    // const data = await response.json();
    // TOKEN_PRICES["SUI"] = data.sui.usd;
    // TOKEN_PRICES["CETUS"] = data.cetus.usd;
    // For now, we'll use hardcoded values defined at the top
  } catch (error) {
    console.error("Failed to update token prices:", error);
  }
}
