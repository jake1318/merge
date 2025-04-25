import { TokenMetadata } from "./birdeyeService";

export interface PoolInfo {
  address: string;
  name: string;
  tokenA: string;
  tokenB: string;
  tokenAAddress?: string;
  tokenBAddress?: string;
  tokenAMetadata?: TokenMetadata;
  tokenBMetadata?: TokenMetadata;
  dex: string;
  liquidityUSD: number;
  volumeUSD: number;
  feesUSD: number;
  apr: number;
  rewardSymbols: string[];
  totalLiquidity?: string;
  tvlUsd?: number;
}

// Updated CoinGecko Pro API endpoint
const COINGECKO_API_URL = "https://pro-api.coingecko.com/api/v3";
const POOLS_ENDPOINT = "/onchain/pools/megafilter";
const SEARCH_ENDPOINT = "/onchain/search/pools";
const COINGECKO_API_KEY = "CG-RsxinQSgFE2ti5oXgH9CUZgp"; // Your API key from the fetch example

// Map of common tokens to their Sui addresses
const TOKEN_ADDRESSES: Record<string, string> = {
  SUI: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
  USDC: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  USDT: "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN",
  CETUS:
    "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
  DEEP: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
};

/**
 * Extract token symbol from token name
 * (e.g. "SUI / USDC 0.2%" => "SUI", "USDC")
 */
function extractTokenSymbols(poolName: string): [string, string] {
  if (!poolName) return ["Unknown", "Unknown"];

  // Try to extract symbols from format like "SUI / USDC 0.2%"
  const parts = poolName.split("/");
  if (parts.length >= 2) {
    const tokenA = parts[0].trim();
    // Remove any percentage or additional text after token name
    const tokenB = parts[1].trim().split(" ")[0].trim();
    return [tokenA, tokenB];
  }

  return ["Unknown", "Unknown"];
}

/**
 * Get token address from symbol or token ID
 */
function getTokenAddress(tokenId: string, symbol?: string): string | undefined {
  // First, try to get by symbol if provided
  if (symbol && TOKEN_ADDRESSES[symbol.toUpperCase()]) {
    return TOKEN_ADDRESSES[symbol.toUpperCase()];
  }

  // Extract address from token ID if it's in the right format
  if (tokenId && tokenId.includes("_")) {
    const parts = tokenId.split("_");
    if (parts.length >= 2) {
      return parts[1]; // Return the actual token address part
    }
  }

  return undefined;
}

/**
 * Calculate APR based on volume and reserve
 */
function calculateApr(
  volumeUsd: number,
  reserveUsd: number,
  feePercent: number = 0.3
): number {
  if (!reserveUsd || reserveUsd === 0) return 0;

  // Daily volume * fee * 365 / liquidity = APR
  const dailyFees = volumeUsd * (feePercent / 100);
  const annualFees = dailyFees * 365;
  return (annualFees / reserveUsd) * 100;
}

/**
 * Get default pools from CoinGecko Pro API
 */
export async function getDefaultPools(): Promise<PoolInfo[]> {
  try {
    const response = await fetch(
      `${COINGECKO_API_URL}${POOLS_ENDPOINT}?page=1&networks=sui-network&sort=h6_trending&tx_count_duration=24h&buys_duration=24h&sells_duration=24h&include=base_token,quote_token,dex,network`,
      {
        headers: {
          accept: "application/json",
          "x-cg-pro-api-key": COINGECKO_API_KEY,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      console.error("Unexpected API response format:", data);
      return [];
    }

    // Transform CoinGecko data to our PoolInfo format
    return data.data.map((pool: any) => {
      // Extract token information
      const baseTokenId = pool.relationships?.base_token?.data?.id;
      const quoteTokenId = pool.relationships?.quote_token?.data?.id;
      const dexId = pool.relationships?.dex?.data?.id;

      // Extract token symbols from pool name
      const [tokenA, tokenB] = extractTokenSymbols(pool.attributes?.name);

      // Get token addresses
      const tokenAAddress = getTokenAddress(baseTokenId, tokenA);
      const tokenBAddress = getTokenAddress(quoteTokenId, tokenB);

      // Calculate APR based on 24h volume and reserve
      const volumeUSD = pool.attributes?.volume_usd?.h24 || 0;
      const reserveUSD = pool.attributes?.reserve_in_usd || 0;
      let feePercent = 0.3; // Default fee percentage

      // Try to extract fee percentage from pool name if available
      if (pool.attributes?.name) {
        const feeMatch = pool.attributes.name.match(/(\d+(\.\d+)?)%/);
        if (feeMatch && feeMatch[1]) {
          feePercent = parseFloat(feeMatch[1]);
        }
      }

      const apr = calculateApr(volumeUSD, reserveUSD, feePercent);

      // Calculate fee amount
      const feesUSD = volumeUSD * (feePercent / 100);

      return {
        address: pool.attributes?.address || pool.id,
        name: pool.attributes?.name || "Unknown Pool",
        tokenA,
        tokenB,
        tokenAAddress,
        tokenBAddress,
        dex: dexId || "Unknown",
        liquidityUSD: parseFloat(pool.attributes?.reserve_in_usd || 0),
        volumeUSD: parseFloat(pool.attributes?.volume_usd?.h24 || 0),
        feesUSD,
        apr,
        rewardSymbols: [], // CoinGecko doesn't provide reward info in this endpoint
        totalLiquidity: pool.attributes?.reserve_in_usd?.toString() || "0",
        tvlUsd: parseFloat(pool.attributes?.reserve_in_usd || 0),
      };
    });
  } catch (error) {
    console.error("Failed to fetch pools from CoinGecko:", error);
    return [];
  }
}

/**
 * Search pools using CoinGecko API - using the dedicated search endpoint
 */
export async function searchPools(query: string): Promise<PoolInfo[]> {
  if (!query.trim()) return [];

  console.log(`Searching for pools matching: "${query}"`);

  try {
    // Use the dedicated search endpoint
    const options = {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-cg-pro-api-key": COINGECKO_API_KEY,
      },
    };

    // Encode the query parameter properly
    const encodedQuery = encodeURIComponent(query);

    const response = await fetch(
      `${COINGECKO_API_URL}${SEARCH_ENDPOINT}?query=${encodedQuery}&network=sui-network&include=base_token,quote_token,dex`,
      options
    );

    if (!response.ok) {
      throw new Error(
        `API search request failed with status: ${response.status}`
      );
    }

    const data = await response.json();

    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      console.log("No search results found");
      return [];
    }

    // Map the CoinGecko response to our PoolInfo format
    const pools: PoolInfo[] = data.data.map((pool: any) => {
      try {
        // Extract token symbols and addresses
        const baseTokenInfo = pool.relationships.base_token.data.id
          .split("_")[1]
          .split("::");
        const quoteTokenInfo = pool.relationships.quote_token.data.id
          .split("_")[1]
          .split("::");

        const baseToken = baseTokenInfo[baseTokenInfo.length - 1];
        const quoteToken = quoteTokenInfo[quoteTokenInfo.length - 1];

        // Calculate fees and APR
        const volume24h = parseFloat(pool.attributes?.volume_usd?.h24 || "0");
        const reserveUsd = parseFloat(pool.attributes?.reserve_in_usd || "0");
        const feesUsd = volume24h * 0.003; // Estimate fees as 0.3% of volume

        // Calculate APR
        let apr = 0;
        if (reserveUsd > 0) {
          const dailyFeesPercent = (feesUsd / reserveUsd) * 100;
          apr = dailyFeesPercent * 365;
        }

        return {
          address: pool.attributes.address,
          name: pool.attributes.name || `${baseToken} / ${quoteToken}`,
          dex: pool.relationships.dex.data.id,
          tokenA: baseToken || "Unknown",
          tokenB: quoteToken || "Unknown",
          tokenAAddress: pool.relationships.base_token.data.id.split("_")[1],
          tokenBAddress: pool.relationships.quote_token.data.id.split("_")[1],
          liquidityUSD: reserveUsd,
          volumeUSD: volume24h,
          feesUSD: feesUsd,
          apr: apr,
          rewardSymbols: [], // API doesn't provide reward info directly
        };
      } catch (err) {
        console.error("Error processing pool data:", err);
        // Return a minimal valid pool object if there's an error parsing one pool
        return {
          address: pool.attributes?.address || "unknown",
          name: pool.attributes?.name || "Unknown Pool",
          tokenA: "Unknown",
          tokenB: "Unknown",
          dex: pool.relationships?.dex?.data?.id || "Unknown",
          liquidityUSD: 0,
          volumeUSD: 0,
          feesUSD: 0,
          apr: 0,
          rewardSymbols: [],
        };
      }
    });

    console.log(`Found ${pools.length} pools matching search query`);
    return pools;
  } catch (error) {
    console.error("Error searching pools:", error);
    // If the search API fails, fall back to client-side filtering
    console.log("Falling back to client-side search...");

    try {
      const allPools = await getDefaultPools();
      const normalizedQuery = query.toLowerCase();

      return allPools.filter(
        (pool) =>
          pool.name.toLowerCase().includes(normalizedQuery) ||
          pool.tokenA.toLowerCase().includes(normalizedQuery) ||
          pool.tokenB.toLowerCase().includes(normalizedQuery) ||
          pool.address.toLowerCase().includes(normalizedQuery) ||
          pool.dex.toLowerCase().includes(normalizedQuery)
      );
    } catch (fallbackError) {
      console.error("Even fallback search failed:", fallbackError);
      return [];
    }
  }
}

/**
 * Get pools by addresses
 */
export async function getPoolsByAddresses(
  addresses: string[]
): Promise<PoolInfo[]> {
  try {
    const allPools = await getDefaultPools();
    return allPools.filter((pool) => addresses.includes(pool.address));
  } catch (error) {
    console.error("Failed to get pools by addresses:", error);
    return [];
  }
}
