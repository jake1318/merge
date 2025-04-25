import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom"; // Add this import
import { useWallet } from "@suiet/wallet-kit";
import SearchBar from "../components/SearchBar";
import PoolTable from "../components/PoolTable";
import DepositModal from "../components/DepositModal";
import TransactionNotification from "../components/TransactionNotification";
import { PoolInfo } from "../services/coinGeckoService";
import * as coinGeckoService from "../services/coinGeckoService";
import * as cetusService from "../services/cetusService";
import * as birdeyeService from "../services/birdeyeService";
import "../styles/pages/Pools.scss";

const MAX_TOKENS_FOR_METADATA = 20; // Limit the number of tokens we fetch metadata for initially

// Default DEX to show (Cetus)
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
  const [isSearching, setIsSearching] = useState(false); // Add state for search in progress

  // State for DEX filter
  const [availableDexes, setAvailableDexes] = useState<string[]>([]);
  const [selectedDex, setSelectedDex] = useState<string | null>(DEFAULT_DEX);

  // Modal state
  const [modalPool, setModalPool] = useState<PoolInfo | null>(null);

  // Transaction notification state
  const [notification, setNotification] = useState<{
    visible: boolean;
    message: string;
    txDigest?: string;
    isSuccess: boolean;
  } | null>(null);

  // Fetch pools and enhance them with token metadata
  useEffect(() => {
    async function fetchPools() {
      setLoading(true);
      try {
        // Get pools from CoinGecko
        const pools = await coinGeckoService.getDefaultPools();

        // Extract unique DEXes and store them
        const dexes = Array.from(
          new Set(pools.map((p) => p.dex.toLowerCase()))
        );
        setAvailableDexes(dexes.sort());

        // Store pools without metadata first to show data quickly
        setDefaultPools(pools);
        setLoading(false);

        // Then fetch metadata in the background
        fetchTokenMetadata(pools);
      } catch (error) {
        console.error("Failed to load pools:", error);
        setLoading(false);
      }
    }

    fetchPools();
  }, []);

  // Function to fetch token metadata separately from pool loading
  const fetchTokenMetadata = async (pools: PoolInfo[]) => {
    setLoadingMetadata(true);
    try {
      // Collect unique token addresses to fetch metadata
      const tokenAddresses = new Set<string>();

      // Sort pools by liquidityUSD to prioritize metadata for most important pools
      const sortedPools = [...pools].sort(
        (a, b) => b.liquidityUSD - a.liquidityUSD
      );

      // Take only the top pools to avoid too many requests
      const topPools = sortedPools.slice(0, MAX_TOKENS_FOR_METADATA);

      topPools.forEach((pool) => {
        if (pool.tokenAAddress && !tokenAddresses.has(pool.tokenAAddress)) {
          tokenAddresses.add(pool.tokenAAddress);
        }
        if (pool.tokenBAddress && !tokenAddresses.has(pool.tokenBAddress)) {
          tokenAddresses.add(pool.tokenBAddress);
        }
      });

      if (tokenAddresses.size > 0) {
        const tokenAddressArray = Array.from(tokenAddresses);
        console.log(
          `Fetching metadata for top ${tokenAddressArray.length} tokens`
        );

        // Fetch token metadata
        const metadata = await birdeyeService.getMultipleTokenMetadata(
          tokenAddressArray
        );
        console.log(
          `Fetched metadata for ${Object.keys(metadata).length} tokens`
        );

        // Add metadata to pool objects
        const enhancedPools = pools.map((pool) => ({
          ...pool,
          tokenAMetadata: pool.tokenAAddress
            ? metadata[pool.tokenAAddress]
            : undefined,
          tokenBMetadata: pool.tokenBAddress
            ? metadata[pool.tokenBAddress]
            : undefined,
        }));

        setDefaultPools(enhancedPools);
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
      console.log(`Searching for pools matching: "${searchTerm}"`);

      // Use the existing searchPools function from coinGeckoService
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

      console.log(`Found ${results.length} pools matching search query`);

      // Try to enhance results with metadata we've already fetched
      const enhancedResults = results.map((pool) => {
        const matchingPool = defaultPools.find(
          (p) =>
            p.address === pool.address ||
            (p.tokenAAddress === pool.tokenAAddress &&
              p.tokenBAddress === pool.tokenBAddress)
        );

        if (matchingPool) {
          // Use metadata from matching pool if available
          return {
            ...pool,
            tokenAMetadata: matchingPool.tokenAMetadata,
            tokenBMetadata: matchingPool.tokenBMetadata,
          };
        }

        return pool;
      });

      setSearchResults(enhancedResults);

      // Fetch metadata for any new tokens found in search results
      const newTokenAddresses = new Set<string>();

      enhancedResults.forEach((pool) => {
        if (pool.tokenAAddress && !pool.tokenAMetadata) {
          newTokenAddresses.add(pool.tokenAAddress);
        }
        if (pool.tokenBAddress && !pool.tokenBMetadata) {
          newTokenAddresses.add(pool.tokenBAddress);
        }
      });

      if (newTokenAddresses.size > 0) {
        setLoadingMetadata(true);
        try {
          const metadata = await birdeyeService.getMultipleTokenMetadata(
            Array.from(newTokenAddresses)
          );

          const updatedResults = enhancedResults.map((pool) => ({
            ...pool,
            tokenAMetadata:
              pool.tokenAMetadata ||
              (pool.tokenAAddress ? metadata[pool.tokenAAddress] : undefined),
            tokenBMetadata:
              pool.tokenBMetadata ||
              (pool.tokenBAddress ? metadata[pool.tokenBAddress] : undefined),
          }));

          setSearchResults(updatedResults);
        } catch (error) {
          console.error("Error fetching token metadata:", error);
        } finally {
          setLoadingMetadata(false);
        }
      }

      // If a specific DEX is selected, check if any search results match
      if (selectedDex) {
        const hasDexMatch = results.some(
          (pool) => pool.dex.toLowerCase() === selectedDex.toLowerCase()
        );

        if (!hasDexMatch && results.length > 0) {
          setNotification({
            visible: true,
            message: `No ${selectedDex.toUpperCase()} pools found matching "${searchTerm}". Consider clearing the DEX filter to see all ${
              results.length
            } results.`,
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

  const handleSortChange = (
    columnKey: "dex" | "liquidityUSD" | "volumeUSD" | "feesUSD" | "apr"
  ) => {
    if (columnKey === sortColumn) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(columnKey);
      setSortOrder("desc");
    }
  };

  // Handle DEX selection change
  const handleDexChange = (dex: string | null) => {
    setSelectedDex(dex);
  };

  // Reset DEX filter
  const handleResetFilters = () => {
    setSelectedDex(DEFAULT_DEX);
    setSearchResults([]);
    setSearchTerm("");
  };

  // Use useCallback to memoize the handler function
  const handleDeposit = useCallback(
    (pool: PoolInfo) => {
      console.log("Deposit button clicked for pool:", pool.name);

      if (!wallet.connected) {
        setNotification({
          visible: true,
          message: "Please connect your Sui wallet to deposit liquidity.",
          isSuccess: false,
        });
        return;
      }

      // Add a specific warning for non-Cetus pools
      if (pool.dex.toLowerCase() !== "cetus") {
        setNotification({
          visible: true,
          message: `Deposits to ${pool.dex} pools are not fully supported yet. Only Cetus pools are currently supported.`,
          isSuccess: false,
        });
        return;
      }

      // Set the modal pool to trigger modal display
      setModalPool(pool);
    },
    [wallet.connected]
  );

  const handleModalConfirm = async (amtA: number, amtB: number) => {
    if (!modalPool) return;

    console.log(
      `Confirming deposit of ${amtA} ${modalPool.tokenA} and ${amtB} ${modalPool.tokenB} to pool ${modalPool.address}`
    );

    try {
      const result = await cetusService.deposit(
        wallet,
        modalPool.address,
        amtA,
        amtB,
        modalPool
      );
      console.log("Deposit transaction result:", result);

      // Close the modal
      setModalPool(null);

      // Show the notification with transaction details
      setNotification({
        visible: true,
        message: `Deposit successful for ${modalPool.name}`,
        txDigest: result.digest,
        isSuccess: true,
      });
    } catch (err) {
      console.error("Deposit failed:", err);

      // Extract a more user-friendly error message
      let errorMessage = "Unknown error occurred";

      if (err instanceof Error) {
        if (
          err.message.includes("Package object does not exist") ||
          err.message.includes("not supported yet") ||
          err.message.includes("not supported for deposits")
        ) {
          errorMessage = `This ${modalPool.dex} pool is not supported for deposits yet`;
        } else if (err.message.includes("insufficient funds")) {
          errorMessage = "Insufficient funds for this deposit";
        } else if (err.message.includes("slippage")) {
          errorMessage = "Transaction exceeded slippage tolerance";
        } else {
          errorMessage = err.message;
        }
      }

      setNotification({
        visible: true,
        message: `Deposit failed: ${errorMessage}`,
        isSuccess: false,
      });
    }
  };

  const handleModalClose = () => {
    console.log("Closing deposit modal");
    setModalPool(null);
  };

  const handleNotificationClose = () => {
    setNotification(null);
  };

  // Apply all filters in sequence
  const currentPools =
    searchTerm && searchResults.length > 0 ? searchResults : defaultPools;

  // Apply DEX filter
  const filteredPools = selectedDex
    ? currentPools.filter(
        (p) => p.dex.toLowerCase() === selectedDex.toLowerCase()
      )
    : currentPools;

  const displayedPools = [...filteredPools].sort((a, b) => {
    const valA = a[sortColumn] ?? 0;
    const valB = b[sortColumn] ?? 0;
    if (typeof valA === "string" && typeof valB === "string") {
      return sortOrder === "asc"
        ? valA.localeCompare(valB)
        : valB.localeCompare(valA);
    }
    return sortOrder === "asc"
      ? (valA as number) - (valB as number)
      : (valB as number) - (valA as number);
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col md:flex-row items-start md:items-center">
          <h1 className="text-2xl font-bold text-white mr-6">
            Liquidity Pools
          </h1>

          {/* Navigation section with links */}
          <div className="flex space-x-6 mt-2 md:mt-0">
            <Link
              to="/"
              className="text-white font-medium border-b-2 border-blue-500 pb-1"
            >
              Pools
            </Link>
            <Link
              to="/positions"
              className="text-gray-400 hover:text-white font-medium border-b-2 border-transparent hover:border-gray-700 pb-1 transition-colors"
            >
              My Positions
            </Link>
          </div>
        </div>

        <div className="w-full md:w-1/2">
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            onSubmit={handleSearchSubmit}
            placeholder="🔍 Search for tokens, pools, or DEXes"
            isSearching={isSearching}
          />
        </div>
      </div>

      <div className="mb-4 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          {availableDexes.length > 0 && (
            <div className="flex items-center bg-gray-800 rounded-md px-3 py-2 border border-gray-700">
              <span className="text-gray-400 text-sm mr-2">DEX:</span>
              <select
                className="bg-transparent text-white outline-none cursor-pointer"
                value={selectedDex || ""}
                onChange={(e) => handleDexChange(e.target.value || null)}
              >
                {availableDexes.map((dex) => (
                  <option key={dex} value={dex} className="bg-gray-800">
                    {dex.charAt(0).toUpperCase() + dex.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center">
          {isSearching ? (
            <span className="text-sm text-blue-400 mr-2">Searching...</span>
          ) : searchResults.length > 0 ? (
            <div className="flex items-center">
              <span className="text-sm text-gray-400">
                {searchResults.length} results
              </span>
              <button
                onClick={() => {
                  setSearchResults([]);
                  setSearchTerm("");
                }}
                className="ml-2 text-sm text-blue-400 hover:text-blue-300 underline"
              >
                Clear
              </button>
            </div>
          ) : loadingMetadata ? (
            <span className="text-sm text-gray-400">
              Loading token icons...
            </span>
          ) : null}
        </div>
      </div>

      {/* DEX support info banner - only show when non-Cetus DEX is selected */}
      {selectedDex && selectedDex.toLowerCase() !== "cetus" && (
        <div className="mb-6 p-4 bg-blue-900/20 border border-blue-800/50 rounded-lg">
          <div className="flex items-start">
            <div className="text-blue-400 mr-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <div>
              <p className="text-blue-100">
                Note: Currently only <strong>Cetus</strong> pools fully support
                deposits through our interface. Support for{" "}
                <span className="font-medium">
                  {selectedDex.charAt(0).toUpperCase() + selectedDex.slice(1)}{" "}
                </span>
                pools is coming soon.
              </p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-gray-800 rounded-xl p-10 text-center flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-gray-400">Loading pools data...</p>
        </div>
      ) : displayedPools.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-10 text-center">
          <p className="text-gray-400 mb-2">
            No pools found with the current filters.
          </p>
          <button
            onClick={handleResetFilters}
            className="text-blue-400 hover:text-blue-300 underline"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
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
        </div>
      )}

      {/* Render modal conditionally */}
      {modalPool && (
        <DepositModal
          pool={modalPool}
          onConfirm={handleModalConfirm}
          onClose={handleModalClose}
        />
      )}

      {/* Render notification conditionally */}
      {notification && notification.visible && (
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
