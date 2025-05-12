// src/contexts/BirdeyeContext.tsx
// Last Updated: 2025-04-27 23:43:22 UTC by jake1318

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  birdeyeService,
  BirdeyeTrendingToken,
  BirdeyeListToken,
} from "../services/birdeyeService";
import tokenCacheService, {
  CachedTokenData,
} from "../services/tokenCacheService";

export interface TokenData {
  address: string; // KEEP original
  symbol: string;
  name: string;
  logo: string;
  decimals: number;
  price: number;
  change24h?: number;
  isTrending?: boolean;
  isLoading?: boolean;
}

interface BirdeyeContextType {
  trendingTokens: TokenData[];
  tokenList: TokenData[];
  isLoadingTrending: boolean;
  isLoadingTokenList: boolean;
  refreshTrendingTokens: () => Promise<void>;
  refreshTokenList: () => Promise<void>;
  getCachedTokensVisualData: () => TokenData[];
  fetchMorePrices: (startIndex: number, endIndex: number) => Promise<void>;
  initialTokensLoaded: boolean;
}

const BirdeyeContext = createContext<BirdeyeContextType | undefined>(undefined);

const sanitizeLogo = (url: string = ""): string => {
  if (url.startsWith("ipfs://")) {
    return url.replace(/^ipfs:\/\//, "https://cloudflare-ipfs.com/ipfs/");
  }
  if (url.includes("ipfs.io")) {
    return url
      .replace("http://", "https://")
      .replace("https://ipfs.io", "https://cloudflare-ipfs.com");
  }
  if (url.startsWith("http://")) {
    return "https://" + url.slice(7);
  }
  return url;
};

// Helper function to throttle API calls
const throttledFetch = async <T,>(
  fetchFn: () => Promise<T>,
  delayMs: number = 200 // Default to 200ms between calls (5 calls per second is safe)
): Promise<T> => {
  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
        const result = await fetchFn();
        resolve(result);
      } catch (error) {
        console.error("Throttled fetch error:", error);
        resolve(null as unknown as T);
      }
    }, delayMs);
  });
};

export const BirdeyeProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [trendingTokens, setTrendingTokens] = useState<TokenData[]>([]);
  const [tokenList, setTokenList] = useState<TokenData[]>([]);
  const [isLoadingTrending, setIsLoadingTrending] = useState(false);
  const [isLoadingTokenList, setIsLoadingTokenList] = useState(false);
  const [initialTokensLoaded, setInitialTokensLoaded] = useState(false);

  // Track which tokens we've already fetched prices for to avoid duplicate requests
  const [fetchedPrices, setFetchedPrices] = useState<Set<string>>(new Set());

  const cacheVisual = (arr: TokenData[]) => {
    const toCache: CachedTokenData[] = arr.map((t) => ({
      address: t.address.toLowerCase(), // cache‐key only
      symbol: t.symbol,
      name: t.name,
      logo: t.logo,
      decimals: t.decimals,
    }));
    tokenCacheService.cacheTokens(toCache);
  };

  const refreshTrendingTokens = async () => {
    setIsLoadingTrending(true);
    try {
      console.log("Fetching trending tokens from Birdeye API...");
      const raw: BirdeyeTrendingToken[] =
        await birdeyeService.getTrendingTokens();
      console.log(`Received ${raw.length} trending tokens from Birdeye API`);

      const formatted: TokenData[] = raw.map((t) => ({
        address: t.address,
        symbol: t.symbol,
        name: t.name,
        logo: sanitizeLogo(t.logoURI),
        decimals: t.decimals,
        price: t.price,
        change24h: t.price24hChangePercent,
        isTrending: true,
      }));
      setTrendingTokens(formatted);
      cacheVisual(formatted);

      // Track which tokens have price data already
      const newFetchedPrices = new Set(fetchedPrices);
      formatted.forEach((t) => newFetchedPrices.add(t.address));
      setFetchedPrices(newFetchedPrices);
    } catch (err) {
      console.error("Error fetching trending tokens:", err);
    } finally {
      setIsLoadingTrending(false);
    }
  };

  // New optimized token list loading function
  const refreshTokenList = async () => {
    setIsLoadingTokenList(true);
    try {
      console.log("Fetching token list from Birdeye API...");
      // 1) fetch basic metadata first
      const raw: BirdeyeListToken[] = await birdeyeService.getTokenList();
      console.log(`Received ${raw.length} tokens from Birdeye API`);

      // 2) Create formatted tokens with price loading indicators
      const formatted: TokenData[] = raw.map((t) => ({
        address: t.address,
        symbol: t.symbol,
        name: t.name,
        logo: sanitizeLogo(t.logoURI),
        decimals: t.decimals,
        price: 0,
        change24h: t.v24hChangePercent,
        isLoading: true, // Indicate that price is loading
      }));

      // 3) Set the token list to display immediately
      setTokenList(formatted);
      cacheVisual(formatted);

      // 4) Mark initial tokens as loaded
      setInitialTokensLoaded(true);

      // 5) Start loading the first batch of prices (first 5 tokens)
      if (formatted.length > 0) {
        await fetchMorePrices(0, 5);
      } else {
        console.warn("No tokens received from Birdeye API");
      }
    } catch (err) {
      console.error("Error fetching token list:", err);
    } finally {
      setIsLoadingTokenList(false);
    }
  };

  // Improved function to fetch prices with rate limiting
  const fetchMorePrices = async (startIndex: number, endIndex: number) => {
    if (!tokenList.length || startIndex >= tokenList.length) {
      console.log(
        `No tokens to fetch prices for (start: ${startIndex}, end: ${endIndex}, total: ${tokenList.length})`
      );
      return;
    }

    // Make sure we don't exceed the array bounds
    const end = Math.min(endIndex, tokenList.length);

    console.log(`Fetching prices for tokens ${startIndex}-${end - 1}`);

    // Create a copy of the token list to update
    const updatedTokenList = [...tokenList];

    // Get only the tokens we haven't already fetched prices for
    const tokensToFetch = updatedTokenList
      .slice(startIndex, end)
      .filter((token) => !fetchedPrices.has(token.address));

    if (tokensToFetch.length === 0) {
      console.log("All tokens in this batch already have prices, skipping");
      return;
    }

    console.log(`Fetching prices for ${tokensToFetch.length} tokens`);

    // Process tokens one by one with throttling to respect rate limits
    const RATE_LIMIT_DELAY = 100; // ms between requests (10 requests per second)
    const MAX_CONCURRENT = 3; // Maximum concurrent requests

    // Split tokens into smaller batches to handle concurrently
    for (let i = 0; i < tokensToFetch.length; i += MAX_CONCURRENT) {
      const batch = tokensToFetch.slice(i, i + MAX_CONCURRENT);
      console.log(
        `Processing batch of ${batch.length} tokens (${i + 1}-${
          i + batch.length
        } of ${tokensToFetch.length})`
      );

      // Process this small batch in parallel
      await Promise.all(
        batch.map(async (token, idx) => {
          // Find token's actual index in the full token list
          const tokenIndex = updatedTokenList.findIndex(
            (t) => t.address === token.address
          );
          if (tokenIndex === -1) return;

          try {
            // Apply throttling to each request with an offset based on position
            const delay = RATE_LIMIT_DELAY * idx;
            const pv = await throttledFetch(
              () => birdeyeService.getPriceVolumeSingle(token.address),
              delay
            );

            // Update the price for this specific token
            updatedTokenList[tokenIndex] = {
              ...updatedTokenList[tokenIndex],
              price: pv ? Number(pv.price) : 0,
              isLoading: false,
            };

            // Track which token has been fetched
            setFetchedPrices((prev) => new Set([...prev, token.address]));
          } catch (error) {
            // Handle error but continue with other tokens
            console.error(`Failed to fetch price for ${token.symbol}:`, error);
            updatedTokenList[tokenIndex] = {
              ...updatedTokenList[tokenIndex],
              isLoading: false,
            };
          }
        })
      );

      // Update the state after each small batch
      setTokenList([...updatedTokenList]);

      // Additional delay between batches if needed
      if (i + MAX_CONCURRENT < tokensToFetch.length) {
        await new Promise((resolve) =>
          setTimeout(resolve, RATE_LIMIT_DELAY * MAX_CONCURRENT)
        );
      }
    }
  };

  const getCachedTokensVisualData = (): TokenData[] =>
    tokenCacheService.getAllCachedTokens().map((t) => ({
      address: t.address, // lowercase key, only for visuals
      symbol: t.symbol,
      name: t.name,
      logo: sanitizeLogo(t.logo),
      decimals: t.decimals,
      price: 0,
      isLoading: true,
    }));

  useEffect(() => {
    refreshTrendingTokens();
    refreshTokenList();
  }, []);

  return (
    <BirdeyeContext.Provider
      value={{
        trendingTokens,
        tokenList,
        isLoadingTrending,
        isLoadingTokenList,
        refreshTrendingTokens,
        refreshTokenList,
        getCachedTokensVisualData,
        fetchMorePrices,
        initialTokensLoaded,
      }}
    >
      {children}
    </BirdeyeContext.Provider>
  );
};

export const useBirdeye = () => {
  const ctx = useContext(BirdeyeContext);
  if (!ctx) throw new Error("useBirdeye must be used within a BirdeyeProvider");
  return ctx;
};
