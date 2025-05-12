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
 * Last Updated: 2025-04-27 22:54:34 UTC by jake1318
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
 * Last Updated: 2025-04-27 22:54:34 UTC by jake1318
 */
export async function searchPools(
  query: string,
  limit: number = 20
): Promise<PoolInfo[]> {
  if (!query.trim()) return [];

  console.log(`Searching for pools matching: "${query}" (limit: ${limit})`);

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

    // Add limit parameter to ensure we get the maximum number of pools
    const response = await fetch(
      `${COINGECKO_API_URL}${SEARCH_ENDPOINT}?query=${encodedQuery}&network=sui-network&include=base_token,quote_token,dex&per_page=${limit}`,
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

    console.log(
      `API returned ${data.data.length} pools out of requested ${limit}`
    );

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

        // Get token metadata if available
        const tokenAMetadata = {
          name: baseToken,
          symbol: baseToken,
          address: pool.relationships.base_token.data.id.split("_")[1],
        };

        const tokenBMetadata = {
          name: quoteToken,
          symbol: quoteToken,
          address: pool.relationships.quote_token.data.id.split("_")[1],
        };

        return {
          address: pool.attributes.address,
          name: pool.attributes.name || `${baseToken} / ${quoteToken}`,
          dex: pool.relationships.dex.data.id,
          tokenA: baseToken || "Unknown",
          tokenB: quoteToken || "Unknown",
          tokenAAddress: pool.relationships.base_token.data.id.split("_")[1],
          tokenBAddress: pool.relationships.quote_token.data.id.split("_")[1],
          tokenAMetadata,
          tokenBMetadata,
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

    console.log(
      `Successfully processed ${pools.length} pools matching search query`
    );
    return pools;
  } catch (error) {
    console.error("Error searching pools:", error);
    // If the search API fails, fall back to client-side filtering
    console.log("Falling back to client-side search...");

    try {
      const allPools = await getDefaultPools();
      const normalizedQuery = query.toLowerCase();

      const filteredPools = allPools.filter(
        (pool) =>
          pool.name.toLowerCase().includes(normalizedQuery) ||
          pool.tokenA.toLowerCase().includes(normalizedQuery) ||
          pool.tokenB.toLowerCase().includes(normalizedQuery) ||
          pool.address.toLowerCase().includes(normalizedQuery) ||
          pool.dex.toLowerCase().includes(normalizedQuery)
      );

      // Limit the results to match the requested limit
      return filteredPools.slice(0, limit);
    } catch (fallbackError) {
      console.error("Even fallback search failed:", fallbackError);
      return [];
    }
  }
}

/**
 * Get pools by DEX
 * Fetches top pools for a specific DEX
 * Last Updated: 2025-04-27 22:54:34 UTC by jake1318
 */
export async function getPoolsByDex(
  dex: string,
  limit: number = 20
): Promise<PoolInfo[]> {
  try {
    console.log(`Fetching top ${limit} pools for DEX: ${dex}`);

    const options = {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-cg-pro-api-key": COINGECKO_API_KEY,
      },
    };

    // Encode the DEX parameter
    const encodedDex = encodeURIComponent(dex);

    // Use the proper API call format based on the provided example
    const response = await fetch(
      `${COINGECKO_API_URL}${POOLS_ENDPOINT}?page=1&networks=sui-network&dexes=${encodedDex}&sort=h6_trending&tx_count_duration=24h&buys_duration=24h&sells_duration=24h&include=base_token,quote_token,dex,network`,
      options
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error for DEX ${dex}: ${response.status}`);
    }

    const data = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      console.error("Unexpected API response format for DEX query:", data);
      return [];
    }

    console.log(`Found ${data.data.length} pools for DEX ${dex}`);

    // Transform CoinGecko data to our PoolInfo format
    return data.data
      .map((pool: any) => {
        // Extract token information from the relationships
        const baseTokenData = pool.relationships?.base_token?.data;
        const quoteTokenData = pool.relationships?.quote_token?.data;
        const dexData = pool.relationships?.dex?.data;

        // Extract token symbols from token ids
        let tokenA = "Unknown";
        let tokenB = "Unknown";
        let tokenAAddress = undefined;
        let tokenBAddress = undefined;

        if (baseTokenData?.id) {
          const parts = baseTokenData.id.split("_");
          if (parts.length > 1) {
            const tokenParts = parts[1].split("::");
            if (tokenParts.length > 0) {
              tokenA = tokenParts[tokenParts.length - 1]; // Get last part as symbol
              tokenAAddress = parts[1];
            }
          }
        }

        if (quoteTokenData?.id) {
          const parts = quoteTokenData.id.split("_");
          if (parts.length > 1) {
            const tokenParts = parts[1].split("::");
            if (tokenParts.length > 0) {
              tokenB = tokenParts[tokenParts.length - 1]; // Get last part as symbol
              tokenBAddress = parts[1];
            }
          }
        }

        // Alternatively, extract from pool name if available
        if (pool.attributes?.name) {
          const [nameTokenA, nameTokenB] = extractTokenSymbols(
            pool.attributes.name
          );
          if (nameTokenA && nameTokenB) {
            tokenA = nameTokenA;
            tokenB = nameTokenB;
          }
        }

        // Calculate APR based on 24h volume and reserve
        const volumeUSD = parseFloat(pool.attributes?.volume_usd?.h24 || 0);
        const reserveUSD = parseFloat(pool.attributes?.reserve_in_usd || 0);
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

        // Create token metadata structures
        const tokenAMetadata = {
          name: tokenA,
          symbol: tokenA,
          address: tokenAAddress,
        };

        const tokenBMetadata = {
          name: tokenB,
          symbol: tokenB,
          address: tokenBAddress,
        };

        return {
          address: pool.attributes?.address || pool.id,
          name: pool.attributes?.name || `${tokenA} / ${tokenB}`,
          tokenA,
          tokenB,
          tokenAAddress,
          tokenBAddress,
          tokenAMetadata,
          tokenBMetadata,
          dex: dexData?.id || dex,
          liquidityUSD: reserveUSD,
          volumeUSD: volumeUSD,
          feesUSD,
          apr,
          rewardSymbols: [], // CoinGecko doesn't provide reward info in this endpoint
          totalLiquidity: pool.attributes?.reserve_in_usd?.toString() || "0",
          tvlUsd: parseFloat(pool.attributes?.reserve_in_usd || 0),
        };
      })
      .slice(0, limit); // Apply the limit after transformation
  } catch (error) {
    console.error(`Failed to fetch pools for DEX ${dex}:`, error);
    return [];
  }
}

/**
 * Get pools by addresses
 * Last Updated: 2025-04-27 22:54:34 UTC by jake1318
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

/**
 * Get aggregate statistics for all supported DEXes
 * Calculates total TVL, total pool count, and highest APR
 * Last Updated: 2025-04-27 22:54:34 UTC by jake1318
 */
export async function getAggregatePoolStats(): Promise<{
  totalTvlUsd: number;
  totalPools: number;
  highestApr: number;
  highestAprPool?: PoolInfo;
  isLoading: boolean;
  error?: string;
}> {
  // Define the supported DEXes
  const supportedDexes = [
    "bluemove",
    "cetus",
    "kriya-dex",
    "turbos-finance",
    "bluefin",
    "flow-x",
  ];

  try {
    console.log("Fetching aggregate pool statistics for all DEXes");

    let totalTvlUsd = 0;
    let totalPools = 0;
    let highestApr = 0;
    let highestAprPool: PoolInfo | undefined = undefined;

    // We'll always fetch from individual DEXes to ensure we get top 20 from each
    console.log("Fetching top 20 pools from each DEX individually");

    const allPoolsFromDexes: PoolInfo[] = [];
    const poolsPerDex: Record<string, number> = {};
    const tvlPerDex: Record<string, number> = {};

    // Make parallel requests for better performance - 20 pools per DEX
    const POOLS_PER_DEX = 20;
    const dexPromises = supportedDexes.map((dex) =>
      getPoolsByDex(dex, POOLS_PER_DEX)
    );
    const dexResults = await Promise.allSettled(dexPromises);

    // Process results and combine pools
    dexResults.forEach((result, index) => {
      const dexName = supportedDexes[index];
      if (result.status === "fulfilled") {
        const dexPools = result.value;
        console.log(`Found ${dexPools.length} pools for ${dexName}`);

        // Track how many pools we got for this DEX
        poolsPerDex[dexName] = dexPools.length;

        // Calculate TVL for this DEX
        const dexTvl = dexPools.reduce(
          (sum, pool) => sum + pool.liquidityUSD,
          0
        );
        tvlPerDex[dexName] = dexTvl;
        console.log(`TVL for ${dexName}: $${dexTvl.toLocaleString()}`);

        // Add to total TVL
        totalTvlUsd += dexTvl;

        // Find highest APR pool
        const dexHighestAprPool = dexPools.reduce(
          (highest, current) => (current.apr > highest.apr ? current : highest),
          { apr: 0 } as PoolInfo
        );

        if (dexHighestAprPool.apr > highestApr) {
          highestApr = dexHighestAprPool.apr;
          highestAprPool = dexHighestAprPool;
        }

        // Add pools to combined list
        allPoolsFromDexes.push(...dexPools);
      } else {
        console.error(`Failed to fetch pools for ${dexName}:`, result.reason);
        poolsPerDex[dexName] = 0;
        tvlPerDex[dexName] = 0;
      }
    });

    // Calculate total number of pools - should be up to 120 (6 DEXes * 20 pools each)
    totalPools = Object.values(poolsPerDex).reduce(
      (sum, count) => sum + count,
      0
    );

    console.log("--------- Aggregate Pool Statistics ---------");
    console.log(`Total TVL across all DEXes: $${totalTvlUsd.toLocaleString()}`);
    console.log(`Total Pools: ${totalPools}`);
    console.log(`Highest APR: ${highestApr.toFixed(2)}%`);
    console.log(`Pools per DEX: ${JSON.stringify(poolsPerDex)}`);
    console.log(`TVL per DEX: ${JSON.stringify(tvlPerDex)}`);
    console.log("--------------------------------------------");

    // Only return success if we have at least some pools
    if (allPoolsFromDexes.length > 0) {
      return {
        totalTvlUsd,
        totalPools,
        highestApr,
        highestAprPool,
        isLoading: false,
      };
    }

    // If we still don't have data, return zeros but with an error
    return {
      totalTvlUsd: 0,
      totalPools: 0,
      highestApr: 0,
      isLoading: false,
      error: "Failed to fetch pool data from any source",
    };
  } catch (error) {
    console.error("Error fetching aggregate pool statistics:", error);
    return {
      totalTvlUsd: 0,
      totalPools: 0,
      highestApr: 0,
      isLoading: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
