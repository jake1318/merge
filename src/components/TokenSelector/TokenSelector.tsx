// src/components/TokenSelector/TokenSelector.tsx
// Last Updated: 2025-04-27 23:43:22 UTC by jake1318

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useWallet } from "@suiet/wallet-kit";
import { useWalletContext } from "../../contexts/WalletContext";
import {
  useBirdeye,
  TokenData as BirdToken,
} from "../../contexts/BirdeyeContext";
import "./TokenSelector.scss";

export interface TokenData {
  address: string;
  symbol: string;
  name: string;
  logo: string;
  decimals: number;
  price: number;
  balance: number;
  shortAddress: string;
  isTrending?: boolean;
  isLoading?: boolean;
}

const DEFAULT_ICON = "/assets/token-placeholder.png";
const TOKENS_PER_BATCH = 5; // Reduced from 10 to 5 to avoid rate limiting

export default function TokenSelector({
  isOpen,
  onClose,
  onSelect,
  excludeAddresses = [],
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (t: TokenData) => void;
  excludeAddresses?: string[];
}) {
  const { account } = useWallet();
  const { walletState, tokenMetadata, refreshBalances, formatUsd } =
    useWalletContext();
  const {
    trendingTokens,
    tokenList,
    refreshTrendingTokens,
    refreshTokenList,
    fetchMorePrices,
    initialTokensLoaded,
  } = useBirdeye();

  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [visibleTokens, setVisibleTokens] = useState<TokenData[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Refs for intersection observer
  const observerTarget = useRef(null);
  const tokenListScrollContainer = useRef<HTMLDivElement>(null);

  // Debug log the state of tokens
  useEffect(() => {
    if (isOpen) {
      console.log(
        `TokenSelector - Wallet tokens: ${walletState.balances.length}`
      );
      console.log(`TokenSelector - Trending tokens: ${trendingTokens.length}`);
      console.log(`TokenSelector - Token list: ${tokenList.length}`);
      console.log(`TokenSelector - Filtered tokens: ${visibleTokens.length}`);
    }
  }, [
    isOpen,
    walletState.balances.length,
    trendingTokens.length,
    tokenList.length,
    visibleTokens.length,
  ]);

  // on modal open, reload balances & Birdeye lists
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    console.log("TokenSelector opened, refreshing data...");

    const loadData = async () => {
      try {
        console.log("Refreshing balances...");
        await refreshBalances();

        console.log("Refreshing trending tokens and token list...");
        await Promise.all([
          refreshTrendingTokens(),
          refreshTokenList(), // Make sure this actually gets called
        ]);

        console.log("All data refreshed");
      } catch (error) {
        console.error("Error refreshing data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isOpen, account?.address]);

  // build on‑chain wallet tokens
  const walletTokens = useMemo<TokenData[]>(
    () =>
      walletState.balances.map((b) => ({
        address: b.coinType,
        symbol: b.symbol,
        name: b.name,
        logo: tokenMetadata[b.coinType]?.logo || DEFAULT_ICON,
        decimals: b.decimals,
        price: tokenMetadata[b.coinType]?.price || 0,
        balance: Number(b.balance) / 10 ** b.decimals,
        shortAddress: `${b.coinType.slice(0, 6)}…${b.symbol}`,
      })),
    [walletState.balances, tokenMetadata]
  );

  // helper: turn a Birdeye TokenData into our TokenData
  const fromBirdeye = useCallback(
    (t: BirdToken): TokenData => {
      const onChain = walletState.balances.find(
        (b) => b.coinType === t.address
      );
      return {
        address: t.address,
        symbol: t.symbol,
        name: t.name,
        logo: t.logo || DEFAULT_ICON,
        decimals: t.decimals,
        price: t.price,
        balance: onChain ? Number(onChain.balance) / 10 ** onChain.decimals : 0,
        shortAddress: `${t.address.slice(0, 6)}…${t.symbol}`,
        isTrending: t.isTrending,
        isLoading: t.isLoading,
      };
    },
    [walletState.balances]
  );

  // merge: trending → wallet → full list (tokenList)
  const merged = useMemo<TokenData[]>(() => {
    console.log(
      `Building merged token list (wallet: ${walletTokens.length}, trending: ${trendingTokens.length}, tokenList: ${tokenList.length})`
    );

    const map = new Map<string, TokenData>();

    // wallet first
    walletTokens.forEach((t) => map.set(t.address, t));

    // then trending
    trendingTokens.forEach((t) => {
      if (!map.has(t.address)) {
        map.set(t.address, fromBirdeye(t));
      } else {
        // If token exists in wallet, mark it as trending
        const existing = map.get(t.address)!;
        map.set(t.address, { ...existing, isTrending: true });
      }
    });

    // then full tokenList
    tokenList.forEach((t) => {
      if (!map.has(t.address)) {
        map.set(t.address, fromBirdeye(t));
      } else if (map.get(t.address)!.isLoading) {
        // Update if we have a loading token with a non-loading one
        const existing = map.get(t.address)!;
        map.set(t.address, {
          ...existing,
          price: t.price || existing.price,
          isLoading: t.isLoading,
        });
      }
    });

    const result = Array.from(map.values());
    console.log(`Merged token list has ${result.length} tokens`);
    return result;
  }, [walletTokens, tokenList, trendingTokens, fromBirdeye]);

  // filtered tokens based on search and exclusion
  const filteredTokens = useMemo(() => {
    return merged
      .filter((t) => {
        // exclude addresses
        if (excludeAddresses.includes(t.address)) return false;

        // apply search filter
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase().trim();
        return (
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.address.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Sort by:
        // 1. Wallet tokens first
        const aInWallet = a.balance > 0;
        const bInWallet = b.balance > 0;
        if (aInWallet && !bInWallet) return -1;
        if (!aInWallet && bInWallet) return 1;

        // 2. Then trending tokens
        if (a.isTrending && !b.isTrending) return -1;
        if (!a.isTrending && b.isTrending) return 1;

        // 3. Finally by symbol alphabetically
        return a.symbol.localeCompare(b.symbol);
      });
  }, [merged, searchQuery, excludeAddresses]);

  // Load more tokens with debounce
  const loadMoreTokens = useCallback(async () => {
    if (isLoadingMore || !initialTokensLoaded) return;

    setIsLoadingMore(true);

    try {
      // Calculate which batch to load next
      const nextBatch = Math.floor(visibleTokens.length / TOKENS_PER_BATCH);
      const startIndex = nextBatch * TOKENS_PER_BATCH;
      const endIndex = startIndex + TOKENS_PER_BATCH;

      console.log(
        `Loading more tokens: ${startIndex}-${endIndex} (visible: ${visibleTokens.length}, total: ${tokenList.length})`
      );

      // Only fetch more prices if we're within the available tokens
      if (startIndex < tokenList.length) {
        await fetchMorePrices(startIndex, endIndex);

        // Show more tokens in the UI
        if (visibleTokens.length < filteredTokens.length) {
          const newVisibleCount = Math.min(
            visibleTokens.length + TOKENS_PER_BATCH,
            filteredTokens.length
          );
          setVisibleTokens(filteredTokens.slice(0, newVisibleCount));
        }
      }
    } catch (error) {
      console.error("Error loading more tokens:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    visibleTokens.length,
    filteredTokens,
    tokenList.length,
    fetchMorePrices,
    isLoadingMore,
    initialTokensLoaded,
  ]);

  // Intersection observer for infinite scrolling
  useEffect(() => {
    if (!tokenListScrollContainer.current || !observerTarget.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting && !isLoadingMore && initialTokensLoaded) {
          console.log("Observer target is intersecting, loading more tokens");
          loadMoreTokens();
        }
      },
      {
        root: tokenListScrollContainer.current,
        rootMargin: "100px",
        threshold: 0.1,
      }
    );

    observer.observe(observerTarget.current);

    return () => observer.disconnect();
  }, [loadMoreTokens, isLoadingMore, initialTokensLoaded]);

  // Update visible tokens based on filtered tokens
  useEffect(() => {
    // Always show at least the first few tokens immediately
    const initialCount = Math.min(15, filteredTokens.length);
    console.log(
      `Setting ${initialCount} visible tokens out of ${filteredTokens.length} filtered tokens`
    );
    setVisibleTokens(filteredTokens.slice(0, initialCount));
  }, [filteredTokens]);

  // Handle modal close
  const handleClose = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="token-selector-modal" onClick={handleClose}>
      <div
        className="token-selector-content"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="token-selector-header">
          <h2>Select Token</h2>
          <button onClick={onClose} className="close-button">
            &times;
          </button>
        </header>

        <div className="token-search">
          <input
            type="text"
            placeholder="Search by name, symbol, or address"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="token-list" ref={tokenListScrollContainer}>
          {loading && visibleTokens.length === 0 ? (
            <div className="no-tokens">Loading tokens…</div>
          ) : visibleTokens.length === 0 ? (
            <div className="no-tokens">No tokens found</div>
          ) : (
            <>
              {visibleTokens.map((token) => (
                <div
                  key={token.address}
                  className={`token-item${token.isTrending ? " trending" : ""}`}
                  onClick={() => onSelect(token)}
                >
                  <div className="token-info">
                    <img
                      src={token.logo}
                      alt={token.symbol}
                      className="token-logo"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = DEFAULT_ICON;
                      }}
                    />
                    <div className="token-details">
                      <div className="token-symbol">
                        {token.symbol}
                        {token.isTrending && (
                          <span className="trending-badge">🔥</span>
                        )}
                      </div>
                      <div className="token-name">{token.name}</div>
                      <div className="token-address">{token.shortAddress}</div>
                    </div>
                  </div>
                  <div className="token-data">
                    <div className="token-balance">
                      {token.balance > 0
                        ? token.balance.toLocaleString(undefined, {
                            maximumFractionDigits: 6,
                          })
                        : "0"}
                    </div>
                    <div className="token-price">
                      {token.isLoading ? (
                        <span className="loading-indicator">Loading...</span>
                      ) : (
                        formatUsd(token.price)
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Observer target for infinite scrolling */}
              {visibleTokens.length < filteredTokens.length && (
                <div ref={observerTarget} className="observer-target">
                  <div className="loading-more">
                    {isLoadingMore
                      ? "Loading more tokens..."
                      : "Scroll for more"}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
