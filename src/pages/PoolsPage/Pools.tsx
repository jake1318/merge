// src/pages/Pools.tsx
import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@suiet/wallet-kit";
import SearchBar from "../../components/SearchBar";
import PoolTable from "../../components/PoolTable";
import DepositModal from "../../components/DepositModal";
import TransactionNotification from "../../components/TransactionNotification";
import { PoolInfo } from "../../services/coinGeckoService";
import * as coinGeckoService from "../../services/coinGeckoService";
import * as cetusService from "../../services/cetusService";
import * as birdeyeService from "../../services/birdeyeService";
import "../../styles/pages/Pools.scss";

const MAX_TOKENS_FOR_METADATA = 20;
const DEFAULT_DEX = "cetus";

const Pools: React.FC = () => {
  const wallet = useWallet();

  const [defaultPools, setDefaultPools] = useState<PoolInfo[]>([]);
  const [searchResults, setSearchResults] = useState<PoolInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortColumn, setSortColumn] = useState<
    "dex" | "liquidityUSD" | "volumeUSD" | "feesUSD" | "apr"
  >("volumeUSD");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const [availableDexes, setAvailableDexes] = useState<string[]>([]);
  const [selectedDex, setSelectedDex] = useState<string | null>(DEFAULT_DEX);

  const [modalPool, setModalPool] = useState<PoolInfo | null>(null);

  const [notification, setNotification] = useState<{
    visible: boolean;
    message: string;
    txDigest?: string;
    isSuccess: boolean;
  } | null>(null);

  // 1) Load pools
  useEffect(() => {
    async function fetchPools() {
      setLoading(true);
      let fetchedPools: PoolInfo[] = [];
      try {
        // a) fetch base pool data
        fetchedPools = await coinGeckoService.getDefaultPools();

        // b) extract available DEXes
        const dexes = Array.from(
          new Set(fetchedPools.map((p) => p.dex.toLowerCase()))
        ).sort();
        setAvailableDexes(dexes);

        // c) show raw pools immediately
        setDefaultPools(fetchedPools);

        // d) fetch token icons/metadata in background
        fetchTokenMetadata(fetchedPools);
      } catch (err) {
        console.error("Failed to load pools:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchPools();
  }, []);

  // 2) Fetch metadata for top tokens
  const fetchTokenMetadata = async (pools: PoolInfo[]) => {
    setLoadingMetadata(true);
    try {
      const tokenAddresses = new Set<string>();
      // sort by liquidity to pick top N
      const topPools = [...pools]
        .sort((a, b) => b.liquidityUSD - a.liquidityUSD)
        .slice(0, MAX_TOKENS_FOR_METADATA);

      topPools.forEach((pool) => {
        if (pool.tokenAAddress) tokenAddresses.add(pool.tokenAAddress);
        if (pool.tokenBAddress) tokenAddresses.add(pool.tokenBAddress);
      });

      if (tokenAddresses.size) {
        const metadata = await birdeyeService.getMultipleTokenMetadata(
          Array.from(tokenAddresses)
        );
        const enhanced = pools.map((pool) => ({
          ...pool,
          tokenAMetadata: pool.tokenAAddress
            ? metadata[pool.tokenAAddress]
            : undefined,
          tokenBMetadata: pool.tokenBAddress
            ? metadata[pool.tokenBAddress]
            : undefined,
        }));
        setDefaultPools(enhanced);
      }
    } catch (err) {
      console.error("Failed to fetch token metadata:", err);
    } finally {
      setLoadingMetadata(false);
    }
  };

  // 3) Search handler
  const handleSearchSubmit = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await coinGeckoService.searchPools(searchTerm);
      if (!results.length) {
        setNotification({
          visible: true,
          message: `No pools found matching "${searchTerm}"`,
          isSuccess: false,
        });
        setSearchResults([]);
        return;
      }
      // reuse any already-fetched metadata
      const enhanced = results.map((pool) => {
        const match = defaultPools.find(
          (p) =>
            p.address === pool.address ||
            (p.tokenAAddress === pool.tokenAAddress &&
              p.tokenBAddress === pool.tokenBAddress)
        );
        return match
          ? {
              ...pool,
              tokenAMetadata: match.tokenAMetadata,
              tokenBMetadata: match.tokenBMetadata,
            }
          : pool;
      });
      setSearchResults(enhanced);

      // fetch metadata for any new tokens in results
      const newAddrs = new Set<string>();
      enhanced.forEach((p) => {
        if (p.tokenAAddress && !p.tokenAMetadata) newAddrs.add(p.tokenAAddress);
        if (p.tokenBAddress && !p.tokenBMetadata) newAddrs.add(p.tokenBAddress);
      });
      if (newAddrs.size) {
        setLoadingMetadata(true);
        const meta = await birdeyeService.getMultipleTokenMetadata(
          Array.from(newAddrs)
        );
        setSearchResults((prev) =>
          prev.map((p) => ({
            ...p,
            tokenAMetadata:
              p.tokenAMetadata ||
              (p.tokenAAddress ? meta[p.tokenAAddress] : undefined),
            tokenBMetadata:
              p.tokenBMetadata ||
              (p.tokenBAddress ? meta[p.tokenBAddress] : undefined),
          }))
        );
      }

      // notify if DEX filter excludes all results
      if (
        selectedDex &&
        !results.some((p) => p.dex.toLowerCase() === selectedDex.toLowerCase())
      ) {
        setNotification({
          visible: true,
          message: `No ${selectedDex.toUpperCase()} pools matched "${searchTerm}".`,
          isSuccess: true,
        });
      }
    } catch (err) {
      console.error("Search failed:", err);
      setNotification({
        visible: true,
        message: err instanceof Error ? err.message : "Unknown search error",
        isSuccess: false,
      });
    } finally {
      setIsSearching(false);
    }
  };

  // 4) Sorting & filtering
  const handleSortChange = (
    columnKey: "dex" | "liquidityUSD" | "volumeUSD" | "feesUSD" | "apr"
  ) => {
    if (columnKey === sortColumn) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(columnKey);
      setSortOrder("desc");
    }
  };

  const handleDexChange = (dex: string | null) => {
    setSelectedDex(dex);
  };

  const handleResetFilters = () => {
    setSelectedDex(DEFAULT_DEX);
    setSearchTerm("");
    setSearchResults([]);
  };

  // 5) Deposit click → modal
  const handleDeposit = useCallback(
    (pool: PoolInfo) => {
      if (!wallet.connected) {
        setNotification({
          visible: true,
          message: "Connect your wallet first.",
          isSuccess: false,
        });
        return;
      }
      if (pool.dex.toLowerCase() !== "cetus") {
        setNotification({
          visible: true,
          message: `Only Cetus pools supported today.`,
          isSuccess: false,
        });
        return;
      }
      setModalPool(pool);
    },
    [wallet.connected]
  );

  const handleModalConfirm = async (amtA: number, amtB: number) => {
    if (!modalPool) return;
    try {
      const res = await cetusService.deposit(
        wallet,
        modalPool.address,
        amtA,
        amtB,
        modalPool
      );
      setModalPool(null);
      setNotification({
        visible: true,
        message: `Deposited into ${modalPool.name}`,
        txDigest: res.digest,
        isSuccess: true,
      });
    } catch (err) {
      console.error(err);
      setNotification({
        visible: true,
        message: err instanceof Error ? err.message : "Deposit failed",
        isSuccess: false,
      });
    }
  };

  const handleModalClose = () => setModalPool(null);
  const handleNotificationClose = () => setNotification(null);

  // 6) prepare display
  const baseList =
    searchTerm && searchResults.length > 0 ? searchResults : defaultPools;
  const filtered = selectedDex
    ? baseList.filter((p) => p.dex.toLowerCase() === selectedDex.toLowerCase())
    : baseList;
  const displayed = [...filtered].sort((a, b) => {
    const va = a[sortColumn] ?? 0;
    const vb = b[sortColumn] ?? 0;
    if (typeof va === "string" && typeof vb === "string") {
      return sortOrder === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return sortOrder === "asc"
      ? (va as number) - (vb as number)
      : (vb as number) - (va as number);
  });

  return (
    <div className="pools-page">
      <header>
        <h1>Liquidity Pools</h1>
        <nav>
          <Link to="/" className="active">
            Pools
          </Link>
          <Link to="/positions">My Positions</Link>
        </nav>
      </header>

      <SearchBar
        value={searchTerm}
        onChange={setSearchTerm}
        onSubmit={handleSearchSubmit}
        placeholder="Search for tokens, pools, or DEXes"
        isSearching={isSearching}
      />

      <div className="filters">
        <label>
          DEX:
          <select
            value={selectedDex || ""}
            onChange={(e) => handleDexChange(e.target.value || null)}
          >
            {availableDexes.map((dex) => (
              <option key={dex} value={dex}>
                {dex.charAt(0).toUpperCase() + dex.slice(1)}
              </option>
            ))}
          </select>
        </label>

        <button onClick={handleResetFilters}>Reset Filters</button>
      </div>

      {loading ? (
        <p>Loading pools…</p>
      ) : displayed.length === 0 ? (
        <p>No pools found.</p>
      ) : (
        <PoolTable
          pools={displayed}
          sortColumn={sortColumn}
          sortOrder={sortOrder}
          onSort={handleSortChange}
          onDeposit={handleDeposit}
          supportedDex={["cetus"]}
          availableDexes={availableDexes}
          selectedDex={selectedDex}
          onDexChange={handleDexChange}
        />
      )}

      {modalPool && (
        <DepositModal
          pool={modalPool}
          onConfirm={handleModalConfirm}
          onClose={handleModalClose}
        />
      )}

      {notification?.visible && (
        <TransactionNotification
          message={notification.message}
          txDigest={notification.txDigest}
          isSuccess={notification.isSuccess}
          onClose={handleNotificationClose}
        />
      )}
    </div>
  );
};

export default Pools;
