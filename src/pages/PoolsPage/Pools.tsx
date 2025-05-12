// src/pages/Pools.tsx
// Last Updated: 2025-04-29 23:31:55 UTC by jake1318

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
import * as bluefinService from "../../services/bluefinService"; // Import Bluefin service
import * as birdeyeService from "../../services/birdeyeService";
import "../../styles/pages/Pools.scss";

// Define all supported DEXes from CoinGecko
interface DexInfo {
  id: string;
  name: string;
}

// Pre-defined list of DEXes that CoinGecko supports
// Added Bluefin to the supported DEXes list
const SUPPORTED_DEXES: DexInfo[] = [
  { id: "bluemove", name: "BlueMove" },
  { id: "cetus", name: "Cetus" },
  { id: "kriya-dex", name: "KriyaDEX" },
  { id: "turbos-finance", name: "Turbos Finance" },
  { id: "bluefin", name: "Bluefin" },
  { id: "flow-x", name: "FlowX" },
];

const Pools: React.FC = () => {
  const wallet = useWallet();
  const { connected, account } = wallet;
  const [originalPools, setOriginalPools] = useState<PoolInfo[]>([]);
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [filteredPools, setFilteredPools] = useState<PoolInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [sortColumn, setSortColumn] = useState<
    "liquidityUSD" | "volumeUSD" | "feesUSD" | "apr" | "dex"
  >("apr");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isDepositModalOpen, setIsDepositModalOpen] = useState<boolean>(false);
  const [selectedPool, setSelectedPool] = useState<PoolInfo | null>(null);
  const [notification, setNotification] = useState<{
    message: string;
    isSuccess: boolean;
    txDigest?: string;
  } | null>(null);

  // Track selected DEX filter
  const [selectedDex, setSelectedDex] = useState<string | null>(null);

  // Add search debounce timer
  const [searchTimer, setSearchTimer] = useState<NodeJS.Timeout | null>(null);

  // Currently supported DEXes for deposit - UPDATED TO INCLUDE BLUEFIN
  const supportedDexes = ["cetus", "bluefin"]; // Added Bluefin support

  // Set maximum number of pools to show in results
  const MAX_POOLS_TO_DISPLAY = 20;

  /** ------------------------------------------------------------
   * Fetch pools, then pull missing token logos from Birdeye
   * ----------------------------------------------------------- */
  const fetchPools = useCallback(async () => {
    setLoading(true);
    try {
      // 1. fetch the default pools
      const poolsData = await coinGeckoService.getDefaultPools();

      // 2. figure out which token addresses still lack a logo
      const addrSet = new Set<string>();
      poolsData.forEach((p) => {
        if (p.tokenAMetadata?.address && !p.tokenAMetadata.logo_uri)
          addrSet.add(p.tokenAMetadata.address);
        if (p.tokenBMetadata?.address && !p.tokenBMetadata.logo_uri)
          addrSet.add(p.tokenBMetadata.address);
      });

      if (addrSet.size > 0) {
        try {
          // 3. batch-fetch metadata for those tokens
          const metaMap = await birdeyeService.getMultipleTokenMetadata(
            Array.from(addrSet)
          );

          // 4. copy Birdeye logo_uri into each pool's token meta
          poolsData.forEach((p) => {
            const a = p.tokenAMetadata?.address;
            const b = p.tokenBMetadata?.address;

            if (a && metaMap[a]?.logo_uri) {
              p.tokenAMetadata.logo_uri = metaMap[a].logo_uri;
              // some components use .logoUrl
              // @ts-ignore – PoolInfo didn't originally declare logoUrl
              p.tokenAMetadata.logoUrl = metaMap[a].logo_uri;
            }
            if (b && metaMap[b]?.logo_uri) {
              p.tokenBMetadata.logo_uri = metaMap[b].logo_uri;
              // @ts-ignore
              p.tokenBMetadata.logoUrl = metaMap[b].logo_uri;
            }
          });
        } catch (err) {
          console.error("Failed to load Birdeye logos:", err);
        }
      }

      // 5. save to state - store original pools for reset functionality
      setOriginalPools(poolsData);
      setPools(poolsData);
      setFilteredPools(poolsData);
    } catch (error) {
      console.error("Failed to fetch pools:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  /**
   * Fetch pools by DEX
   * Gets top pools from a specific DEX
   */
  const fetchPoolsByDex = useCallback(
    async (dex: string) => {
      setLoading(true);
      try {
        console.log(`Fetching top pools for DEX: ${dex}`);

        // Try to use the existing data first for better UX
        const dexPools = originalPools.filter(
          (pool) => pool.dex.toLowerCase() === dex.toLowerCase()
        );

        if (dexPools.length >= MAX_POOLS_TO_DISPLAY) {
          // If we have enough pools from this DEX in our data, use that
          console.log(
            `Using cached data for ${dex} pools (${dexPools.length} pools available)`
          );
          // Sort by liquidity for better display
          const sortedDexPools = [...dexPools].sort(
            (a, b) => b.liquidityUSD - a.liquidityUSD
          );
          setPools(sortedDexPools);
          setFilteredPools(sortedDexPools.slice(0, MAX_POOLS_TO_DISPLAY));
          setLoading(false);
          return;
        }

        // Otherwise fetch new data for this DEX
        console.log(`Not enough cached data, fetching top pools for ${dex}`);

        // Fetch pools for the specific DEX from the API
        const poolsByDex = await coinGeckoService.getPoolsByDex(
          dex,
          MAX_POOLS_TO_DISPLAY
        );

        if (poolsByDex.length === 0) {
          console.log(
            `No pools returned from API for DEX: ${dex}, using filtered original data`
          );
          // If API returns empty, fall back to our original filtered data
          setPools(dexPools);
          setFilteredPools(dexPools.slice(0, MAX_POOLS_TO_DISPLAY));
          setLoading(false);
          return;
        }

        // Fetch logos if needed
        const addrSet = new Set<string>();
        poolsByDex.forEach((p) => {
          if (
            p.tokenAAddress &&
            (!p.tokenAMetadata?.logo_uri || !p.tokenAMetadata)
          )
            addrSet.add(p.tokenAAddress);
          if (
            p.tokenBAddress &&
            (!p.tokenBMetadata?.logo_uri || !p.tokenBMetadata)
          )
            addrSet.add(p.tokenBAddress);
        });

        if (addrSet.size > 0) {
          try {
            const metaMap = await birdeyeService.getMultipleTokenMetadata(
              Array.from(addrSet)
            );

            poolsByDex.forEach((p) => {
              const a = p.tokenAAddress;
              const b = p.tokenBAddress;

              if (a && metaMap[a]) {
                if (!p.tokenAMetadata) p.tokenAMetadata = metaMap[a];
                else p.tokenAMetadata.logo_uri = metaMap[a].logo_uri;
              }
              if (b && metaMap[b]) {
                if (!p.tokenBMetadata) p.tokenBMetadata = metaMap[b];
                else p.tokenBMetadata.logo_uri = metaMap[b].logo_uri;
              }
            });
          } catch (err) {
            console.error("Failed to load logos for DEX pools:", err);
          }
        }

        console.log(
          `Successfully processed ${poolsByDex.length} pools for DEX ${dex}`
        );

        // Update pools with the DEX-specific pools
        setPools(poolsByDex);
        setFilteredPools(poolsByDex);
      } catch (error) {
        console.error(`Failed to fetch pools for DEX ${dex}:`, error);

        // Fallback to filtering original pool data
        const dexPools = originalPools.filter(
          (pool) => pool.dex.toLowerCase() === dex.toLowerCase()
        );

        console.log(
          `Using ${dexPools.length} cached pools for DEX ${dex} due to API error`
        );

        setPools(dexPools);
        setFilteredPools(dexPools.slice(0, MAX_POOLS_TO_DISPLAY));
      } finally {
        setLoading(false);
      }
    },
    [originalPools, MAX_POOLS_TO_DISPLAY]
  );

  // Function to handle search with API call
  const performSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        // If search is empty, revert to default view based on selected DEX
        if (selectedDex) {
          const dexPools = pools.filter(
            (pool) => pool.dex.toLowerCase() === selectedDex.toLowerCase()
          );
          setFilteredPools(dexPools);
        } else {
          setFilteredPools(pools);
        }
        return;
      }

      setLoading(true);
      try {
        // Call the API to search pools with the maximum limit
        const searchResults = await coinGeckoService.searchPools(
          query,
          MAX_POOLS_TO_DISPLAY
        );

        console.log(`Search returned ${searchResults.length} results`);

        // Apply DEX filter if selected
        let result = searchResults;
        if (selectedDex) {
          result = result.filter(
            (pool) => pool.dex.toLowerCase() === selectedDex.toLowerCase()
          );
        }

        // Apply sorting
        result.sort((a, b) => {
          const valueA = a[sortColumn];
          const valueB = b[sortColumn];

          if (sortOrder === "asc") {
            return valueA > valueB ? 1 : -1;
          } else {
            return valueA < valueB ? 1 : -1;
          }
        });

        // Get token logos for search results if needed
        const addrSet = new Set<string>();
        result.forEach((p) => {
          if (
            p.tokenAAddress &&
            (!p.tokenAMetadata?.logo_uri || !p.tokenAMetadata)
          )
            addrSet.add(p.tokenAAddress);
          if (
            p.tokenBAddress &&
            (!p.tokenBMetadata?.logo_uri || !p.tokenBMetadata)
          )
            addrSet.add(p.tokenBAddress);
        });

        if (addrSet.size > 0) {
          try {
            const metaMap = await birdeyeService.getMultipleTokenMetadata(
              Array.from(addrSet)
            );

            result.forEach((p) => {
              const a = p.tokenAAddress;
              const b = p.tokenBAddress;

              if (a && metaMap[a]) {
                if (!p.tokenAMetadata) p.tokenAMetadata = metaMap[a];
                else p.tokenAMetadata.logo_uri = metaMap[a].logo_uri;
              }
              if (b && metaMap[b]) {
                if (!p.tokenBMetadata) p.tokenBMetadata = metaMap[b];
                else p.tokenBMetadata.logo_uri = metaMap[b].logo_uri;
              }
            });
          } catch (err) {
            console.error("Failed to load logos for search results:", err);
          }
        }

        setFilteredPools(result);
      } catch (error) {
        console.error("Error during search:", error);
        // If API search fails, do client-side filtering (fallback)
        const searchLower = query.toLowerCase();
        let result = pools.filter(
          (pool) =>
            pool.tokenA.toLowerCase().includes(searchLower) ||
            pool.tokenB.toLowerCase().includes(searchLower) ||
            pool.name.toLowerCase().includes(searchLower) ||
            pool.dex.toLowerCase().includes(searchLower) ||
            (pool.rewardSymbols &&
              pool.rewardSymbols.some((symbol) =>
                symbol.toLowerCase().includes(searchLower)
              ))
        );

        // Apply DEX filter if selected
        if (selectedDex) {
          result = result.filter(
            (pool) => pool.dex.toLowerCase() === selectedDex.toLowerCase()
          );
        }

        setFilteredPools(result.slice(0, MAX_POOLS_TO_DISPLAY));
      } finally {
        setLoading(false);
      }
    },
    [pools, selectedDex, sortColumn, sortOrder, MAX_POOLS_TO_DISPLAY]
  );

  // Handle search input with debounce
  const handleSearch = useCallback(
    (query: string) => {
      setSearch(query);

      // Clear previous timer
      if (searchTimer) {
        clearTimeout(searchTimer);
      }

      // Set a new timer for debouncing
      const timer = setTimeout(() => {
        performSearch(query);
      }, 300); // 300ms debounce

      setSearchTimer(timer);
    },
    [searchTimer, performSearch]
  );

  // Clean up timer on component unmount
  useEffect(() => {
    return () => {
      if (searchTimer) {
        clearTimeout(searchTimer);
      }
    };
  }, [searchTimer]);

  // Handle reset button click - fully functional now
  const handleReset = useCallback(() => {
    console.log("Resetting to original state");
    setLoading(true);

    // Clear search term
    setSearch("");

    // Clear DEX filter
    setSelectedDex(null);

    // Reset to default sort
    setSortColumn("apr");
    setSortOrder("desc");

    // Reset to original data
    setPools(originalPools);

    // Apply default sorting to original data
    const sortedPools = [...originalPools].sort((a, b) => b.apr - a.apr);
    setFilteredPools(sortedPools.slice(0, MAX_POOLS_TO_DISPLAY));

    setLoading(false);
  }, [originalPools, MAX_POOLS_TO_DISPLAY]);

  const handleSort = (
    column: "liquidityUSD" | "volumeUSD" | "feesUSD" | "apr" | "dex"
  ) => {
    if (sortColumn === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortOrder("desc");
    }
  };

  // Apply sorting effect
  useEffect(() => {
    setFilteredPools((prev) =>
      [...prev].sort((a, b) => {
        const valueA = a[sortColumn];
        const valueB = b[sortColumn];

        if (sortOrder === "asc") {
          return valueA > valueB ? 1 : -1;
        } else {
          return valueA < valueB ? 1 : -1;
        }
      })
    );
  }, [sortColumn, sortOrder]);

  // Updated handleDexChange to fetch pools by DEX
  const handleDexChange = useCallback(
    (dex: string | null) => {
      setSelectedDex(dex);

      if (dex) {
        // Fetch the top pools for this DEX
        fetchPoolsByDex(dex);
      } else {
        // If DEX filter is cleared, reset to original pools
        setPools(originalPools);

        // If there's an active search, re-run it
        if (search.trim()) {
          performSearch(search);
        } else {
          setFilteredPools(originalPools.slice(0, MAX_POOLS_TO_DISPLAY));
        }
      }
    },
    [
      originalPools,
      fetchPoolsByDex,
      search,
      performSearch,
      MAX_POOLS_TO_DISPLAY,
    ]
  );

  const handleOpenDepositModal = (pool: PoolInfo) => {
    setSelectedPool(pool);
    setIsDepositModalOpen(true);
  };

  const handleCloseDepositModal = () => {
    setIsDepositModalOpen(false);
    setSelectedPool(null);
  };

  // Updated to handle both token amounts and slippage, returns the transaction result
  const handleDeposit = async (
    amountA: string,
    amountB: string,
    slippage: string
  ): Promise<{ success: boolean; digest: string }> => {
    if (!selectedPool || !connected || !account) {
      console.error("Cannot deposit: missing pool, connection, or account");
      return { success: false, digest: "" };
    }

    try {
      console.log("Initiating deposit to", selectedPool.address);
      console.log("Amount A:", amountA, selectedPool.tokenA);
      console.log("Amount B:", amountB, selectedPool.tokenB);
      console.log("Slippage:", slippage + "%");

      // Parse the amount strings to numbers
      const amountANum = parseFloat(amountA);
      const amountBNum = parseFloat(amountB);
      const slippageNum = parseFloat(slippage) / 100; // Convert percentage to decimal

      if (isNaN(amountANum) || isNaN(amountBNum)) {
        throw new Error("Invalid amount");
      }

      // Determine which service to use based on the pool's DEX
      const isDexBluefin = bluefinService.isBluefinPool(
        selectedPool.address,
        selectedPool.dex
      );
      const service = isDexBluefin ? bluefinService : cetusService;

      console.log(
        `Using ${isDexBluefin ? "Bluefin" : "Cetus"} service for deposit to ${
          selectedPool.address
        }`
      );

      // Call the appropriate service's deposit function with both amounts
      const txResult = await service.deposit(
        wallet,
        selectedPool.address,
        amountANum,
        amountBNum,
        selectedPool
      );

      console.log("Deposit transaction completed:", txResult);

      // Show notification on the main page as well
      setNotification({
        message: `Successfully deposited ${amountA} ${selectedPool.tokenA} and ${amountB} ${selectedPool.tokenB} to ${selectedPool.dex} pool`,
        isSuccess: true,
        txDigest: txResult.digest,
      });

      // Refresh positions after a short delay to ensure chain updates are visible
      setTimeout(() => {
        if (account?.address) {
          // If you have a fetchUserPositions function, call it here
          // fetchUserPositions(account.address);
        }
      }, 3000);

      return txResult;
    } catch (error) {
      console.error("Deposit failed:", error);

      // Also show the error in the main page notification
      setNotification({
        message: `Failed to add liquidity: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        isSuccess: false,
      });

      throw error; // Re-throw to let modal component handle it
    }
  };

  const dismissNotification = () => setNotification(null);

  // Helper function to determine APR color class
  const getAprClass = (apr: number): string => {
    if (apr >= 100) return "high";
    if (apr >= 50) return "medium";
    return "low";
  };

  // Helper function to check if a DEX is supported
  const isDexSupported = (dex: string): boolean => {
    return supportedDexes.includes(dex.toLowerCase());
  };

  // Get a prettier display name for a DEX
  const getDexDisplayName = (dexId: string): string => {
    const dex = SUPPORTED_DEXES.find(
      (d) => d.id.toLowerCase() === dexId.toLowerCase()
    );
    if (dex) {
      return dex.name;
    }
    // If not found in our predefined list, capitalize first letter
    return dexId.charAt(0).toUpperCase() + dexId.slice(1);
  };

  return (
    <div className="pools-page">
      <div className="content-container">
        <div className="page-header">
          <h1>Yield Generation</h1>
        </div>

        <div className="tabs-navigation">
          <Link to="/pools" className="tab-link active">
            Pools
          </Link>
          <Link to="/positions" className="tab-link">
            My Positions
          </Link>
        </div>

        <div className="controls-section">
          <div className="search-container">
            <div className="search-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search pools or tokens..."
            />
          </div>

          <div className="filter-section">
            <div className="filter-label">DEX:</div>
            <div className="filter-control">
              <select
                value={selectedDex || "all"}
                onChange={(e) =>
                  handleDexChange(
                    e.target.value === "all" ? null : e.target.value
                  )
                }
              >
                <option value="all">All DEXes</option>
                {SUPPORTED_DEXES.map((dex) => (
                  <option key={dex.id} value={dex.id}>
                    {dex.name}
                  </option>
                ))}
              </select>
            </div>

            <button className="action-button" onClick={handleReset}>
              Reset
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <div className="loading-text">Loading pools...</div>
          </div>
        ) : (
          <div className="pools-table-container">
            <table>
              <thead>
                <tr>
                  <th>Pool</th>
                  <th className="dex-column" onClick={() => handleSort("dex")}>
                    DEX
                    {sortColumn === "dex" && (
                      <span className="sort-indicator">
                        {sortOrder === "asc" ? " ↑" : " ↓"}
                      </span>
                    )}
                  </th>
                  <th
                    className="align-right"
                    onClick={() => handleSort("liquidityUSD")}
                  >
                    Liquidity (USD)
                    {sortColumn === "liquidityUSD" && (
                      <span className="sort-indicator">
                        {sortOrder === "asc" ? " ↑" : " ↓"}
                      </span>
                    )}
                  </th>
                  <th
                    className="align-right"
                    onClick={() => handleSort("volumeUSD")}
                  >
                    Volume (24h)
                    {sortColumn === "volumeUSD" && (
                      <span className="sort-indicator">
                        {sortOrder === "asc" ? " ↑" : " ↓"}
                      </span>
                    )}
                  </th>
                  <th
                    className="align-right"
                    onClick={() => handleSort("feesUSD")}
                  >
                    Fees (24h)
                    {sortColumn === "feesUSD" && (
                      <span className="sort-indicator">
                        {sortOrder === "asc" ? " ↑" : " ↓"}
                      </span>
                    )}
                  </th>
                  <th className="align-right" onClick={() => handleSort("apr")}>
                    APR
                    {sortColumn === "apr" && (
                      <span className="sort-indicator">
                        {sortOrder === "asc" ? " ↑" : " ↓"}
                      </span>
                    )}
                  </th>
                  <th className="actions-column">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPools.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty-state">
                      <div className="empty-icon">🔍</div>
                      <div>No pools found matching your criteria</div>
                    </td>
                  </tr>
                ) : (
                  filteredPools.map((pool) => (
                    <tr key={pool.address}>
                      <td className="pool-cell">
                        <div className="pool-item">
                          <div className="token-icons">
                            {pool.tokenAMetadata?.logo_uri ? (
                              <div className="token-icon">
                                <img
                                  src={pool.tokenAMetadata.logo_uri}
                                  alt={pool.tokenA}
                                />
                              </div>
                            ) : (
                              <div className="token-icon placeholder">
                                {pool.tokenA.charAt(0)}
                              </div>
                            )}

                            {pool.tokenBMetadata?.logo_uri ? (
                              <div className="token-icon">
                                <img
                                  src={pool.tokenBMetadata.logo_uri}
                                  alt={pool.tokenB}
                                />
                              </div>
                            ) : (
                              <div className="token-icon placeholder">
                                {pool.tokenB.charAt(0)}
                              </div>
                            )}
                          </div>

                          <div className="pool-info">
                            <div className="pair-name">
                              {pool.tokenA} / {pool.tokenB}
                            </div>
                            {pool.name && pool.name.match(/(\d+(\.\d+)?)%/) && (
                              <div className="fee-tier">
                                {pool.name.match(/(\d+(\.\d+)?)%/)![0]}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className={`dex-badge ${pool.dex.toLowerCase()}`}>
                          {getDexDisplayName(pool.dex)}
                        </span>
                      </td>

                      <td className="align-right">
                        ${formatNumber(pool.liquidityUSD)}
                      </td>
                      <td className="align-right">
                        ${formatNumber(pool.volumeUSD)}
                      </td>
                      <td className="align-right">
                        ${formatNumber(pool.feesUSD)}
                      </td>

                      <td className="align-right">
                        <span className={`apr-value ${getAprClass(pool.apr)}`}>
                          {formatNumber(pool.apr)}%
                        </span>
                      </td>

                      <td className="actions-cell">
                        <button
                          className={`btn ${
                            isDexSupported(pool.dex)
                              ? "btn--primary"
                              : "btn--secondary"
                          }`}
                          onClick={() => handleOpenDepositModal(pool)}
                          disabled={!isDexSupported(pool.dex) || !connected}
                        >
                          {isDexSupported(pool.dex) ? "Deposit" : "Coming Soon"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {selectedPool && (
          <DepositModal
            isOpen={isDepositModalOpen}
            onClose={handleCloseDepositModal}
            onDeposit={handleDeposit}
            pool={selectedPool}
            walletConnected={connected}
          />
        )}

        {notification && (
          <div className="notification-container">
            <TransactionNotification
              message={notification.message}
              isSuccess={notification.isSuccess}
              txDigest={notification.txDigest}
              onClose={dismissNotification}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// Helper function to format numbers with commas and limited decimal places
function formatNumber(value: number, decimals: number = 2): string {
  if (!value && value !== 0) return "0";
  if (value > 0 && value < 0.01) return "<0.01";

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
  }).format(value);
}

export default Pools;
