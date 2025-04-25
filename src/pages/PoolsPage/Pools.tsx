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

  useEffect(() => {
    async function fetchPools() {
      setLoading(true);
      try {
        const pools = await coinGeckoService.getDefaultPools();
        const dexes = Array.from(
          new Set(pools.map((p) => p.dex.toLowerCase()))
        );
        setAvailableDexes(dexes.sort());
        setDefaultPools(pools);
        setLoading(false);
        fetchTokenMetadata(pools);
      } catch (error) {
        console.error("Failed to load pools:", error);
        setLoading(false);
      }
    }
    fetchPools();
  }, []);

  const fetchTokenMetadata = async (pools: PoolInfo[]) => {
    setLoadingMetadata(true);
    try {
      const tokenAddresses = new Set<string>();
      const sortedPools = [...pools].sort(
        (a, b) => b.liquidityUSD - a.liquidityUSD
      );
      const topPools = sortedPools.slice(0, MAX_TOKENS_FOR_METADATA);

      topPools.forEach((pool) => {
        if (pool.tokenAAddress) tokenAddresses.add(pool.tokenAAddress);
        if (pool.tokenBAddress) tokenAddresses.add(pool.tokenBAddress);
      });

      if (tokenAddresses.size > 0) {
        const metadata = await birdeyeService.getMultipleTokenMetadata(
          Array.from(tokenAddresses)
        );
        const enhanced = pools.map((pool) => ({
          ...pool,
          tokenAMetadata: metadata[pool.tokenAAddress!] ?? pool.tokenAMetadata,
          tokenBMetadata: metadata[pool.tokenBAddress!] ?? pool.tokenBMetadata,
        }));
        setDefaultPools(enhanced);
      }
    } catch (error) {
      console.error("Failed to fetch token metadata:", error);
    } finally {
      setLoadingMetadata(false);
    }
  };

  const handleSearchSubmit = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await coinGeckoService.searchPools(searchTerm);
      if (results.length === 0) {
        setNotification({
          visible: true,
          message: `No pools found matching "${searchTerm}"`,
          isSuccess: false,
        });
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
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

      const newAddrs = new Set<string>();
      enhanced.forEach((pool) => {
        if (pool.tokenAAddress && !pool.tokenAMetadata)
          newAddrs.add(pool.tokenAAddress);
        if (pool.tokenBAddress && !pool.tokenBMetadata)
          newAddrs.add(pool.tokenBAddress);
      });
      if (newAddrs.size) {
        setLoadingMetadata(true);
        const meta = await birdeyeService.getMultipleTokenMetadata(
          Array.from(newAddrs)
        );
        setSearchResults((prev) =>
          prev.map((pool) => ({
            ...pool,
            tokenAMetadata: pool.tokenAMetadata ?? meta[pool.tokenAAddress!],
            tokenBMetadata: pool.tokenBMetadata ?? meta[pool.tokenBAddress!],
          }))
        );
        setLoadingMetadata(false);
      }

      if (selectedDex) {
        const hasMatch = results.some(
          (p) => p.dex.toLowerCase() === selectedDex.toLowerCase()
        );
        if (!hasMatch) {
          setNotification({
            visible: true,
            message: `No ${selectedDex.toUpperCase()} pools found matching "${searchTerm}".`,
            isSuccess: true,
          });
        }
      }
    } catch (error) {
      console.error("Search failed:", error);
      setNotification({
        visible: true,
        message: `Search failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        isSuccess: false,
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSortChange = (columnKey: typeof sortColumn) => {
    if (columnKey === sortColumn) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(columnKey);
      setSortOrder("desc");
    }
  };

  const handleDexChange = (dex: string | null) => setSelectedDex(dex);
  const handleResetFilters = () => {
    setSelectedDex(DEFAULT_DEX);
    setSearchResults([]);
    setSearchTerm("");
  };

  const handleDeposit = useCallback(
    (pool: PoolInfo) => {
      if (!wallet.connected) {
        setNotification({
          visible: true,
          message: "Please connect your Sui wallet to deposit liquidity.",
          isSuccess: false,
        });
        return;
      }
      if (pool.dex.toLowerCase() !== "cetus") {
        setNotification({
          visible: true,
          message: `Deposits to ${pool.dex} pools are not fully supported yet.`,
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
      const result = await cetusService.deposit(
        wallet,
        modalPool.address,
        amtA,
        amtB,
        modalPool
      );
      setModalPool(null);
      setNotification({
        visible: true,
        message: `Deposit successful for ${modalPool.name}`,
        txDigest: result.digest,
        isSuccess: true,
      });
    } catch (err: any) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Deposit failed, see console for details";
      setNotification({
        visible: true,
        message: `Deposit failed: ${msg}`,
        isSuccess: false,
      });
    }
  };

  const handleModalClose = () => setModalPool(null);
  const handleNotificationClose = () => setNotification(null);

  const currentPools =
    searchTerm && searchResults.length > 0 ? searchResults : defaultPools;
  const filteredPools = selectedDex
    ? currentPools.filter(
        (p) => p.dex.toLowerCase() === selectedDex.toLowerCase()
      )
    : currentPools;
  const displayedPools = filteredPools.sort((a, b) => {
    const vA = a[sortColumn] ?? 0;
    const vB = b[sortColumn] ?? 0;
    if (typeof vA === "string" && typeof vB === "string") {
      return sortOrder === "asc" ? vA.localeCompare(vB) : vB.localeCompare(vA);
    }
    return sortOrder === "asc"
      ? (vA as number) - (vB as number)
      : (vB as number) - (vA as number);
  });

  return (
    <div>
      <div>
        <div>
          <h1>Liquidity Pools</h1>
          <div>
            <Link to="/">Pools</Link>
            <Link to="/positions">My Positions</Link>
          </div>
        </div>
        <div>
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            onSubmit={handleSearchSubmit}
            placeholder="🔍 Search for tokens, pools, or DEXes"
            isSearching={isSearching}
          />
        </div>
      </div>

      <div>
        {availableDexes.length > 0 && (
          <div>
            <label>
              DEX:
              <select
                value={selectedDex || ""}
                onChange={(e) => handleDexChange(e.target.value || null)}
              >
                {availableDexes.map((dex) => (
                  <option key={dex} value={dex}>
                    {dex}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div>
          {isSearching ? (
            <span>Searching...</span>
          ) : searchResults.length > 0 ? (
            <div>
              <span>{searchResults.length} results</span>
              <button
                onClick={() => {
                  setSearchResults([]);
                  setSearchTerm("");
                }}
              >
                Clear
              </button>
            </div>
          ) : loadingMetadata ? (
            <span>Loading token icons...</span>
          ) : null}
        </div>
      </div>

      {selectedDex && selectedDex.toLowerCase() !== "cetus" && (
        <div>
          <p>
            Note: Currently only Cetus pools fully support deposits through our
            interface. Support for {selectedDex} pools is coming soon.
          </p>
        </div>
      )}

      {loading ? (
        <div>
          <p>Loading pools data...</p>
        </div>
      ) : displayedPools.length === 0 ? (
        <div>
          <p>No pools found with the current filters.</p>
          <button onClick={handleResetFilters}>Reset Filters</button>
        </div>
      ) : (
        <PoolTable
          pools={displayedPools}
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
