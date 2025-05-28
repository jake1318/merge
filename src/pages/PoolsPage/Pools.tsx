// src/pages/Pools.tsx
// Last Updated: 2025-05-23 22:50:22 UTC by jake1318

import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useWallet } from "@suiet/wallet-kit";
import DepositModal from "../../components/DepositModal";
import TurbosDepositModal from "../../components/TurbosDepositModal"; // Import the Turbos-specific modal
import TransactionNotification from "../../components/TransactionNotification";
import EnhancedTokenIcon from "../../components/EnhancedTokenIcon";
import ProtocolBadge from "./ProtocolBadge";
import { VaultSection } from "../../components/VaultSection";
import { PoolInfo } from "../../services/coinGeckoService";
import * as coinGeckoService from "../../services/coinGeckoService";
import * as cetusService from "../../services/cetusService";
import * as bluefinService from "../../services/bluefinService";
import * as turbosService from "../../services/turbosService";
import * as birdeyeService from "../../services/birdeyeService";
import "../../styles/pages/Pools.scss";
import "./protocolBadges.scss";

// Define all supported DEXes from CoinGecko
interface DexInfo {
  id: string;
  name: string;
}

// Pre-defined list of DEXes that CoinGecko supports
// Keep Bluefin in the list since we want to display their pools
const SUPPORTED_DEXES: DexInfo[] = [
  { id: "bluemove", name: "BlueMove" },
  { id: "cetus", name: "Cetus" },
  { id: "kriya-dex", name: "KriyaDEX" },
  { id: "turbos-finance", name: "Turbos Finance" },
  { id: "bluefin", name: "Bluefin" },
  { id: "flow-x", name: "FlowX" },
  { id: "aftermath", name: "Aftermath" },
  { id: "alphafi", name: "AlphaFi" },
  { id: "alphalend", name: "AlphaLend" },
  { id: "bucket", name: "Bucket" },
  { id: "haedal", name: "Haedal" },
  { id: "kai", name: "Kai" },
  { id: "navi", name: "Navi" },
  { id: "scallop", name: "Scallop" },
  { id: "suilend", name: "SuiLend" },
  { id: "suistake", name: "Suistake" },
  { id: "typus", name: "Typus" },
  { id: "walrus", name: "Walrus" },
];

const DEFAULT_TOKEN_ICON = "/assets/token-placeholder.png";

// Define the tab types
enum TabType {
  POOLS = "pools",
  MY_POSITIONS = "positions",
  PORTFOLIO = "portfolio",
  VAULTS = "vaults",
}

const Pools: React.FC = () => {
  const wallet = useWallet();
  const { connected, account } = wallet;
  const navigate = useNavigate();

  // State to track active tab
  const [activeTab, setActiveTab] = useState<TabType>(TabType.POOLS);

  const [originalPools, setOriginalPools] = useState<PoolInfo[]>([]);
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [filteredPools, setFilteredPools] = useState<PoolInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [sortColumn, setSortColumn] = useState<
    "liquidityUSD" | "volumeUSD" | "feesUSD" | "apr" | "dex"
  >("apr");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // State for deposit modals - separate state for each modal type
  const [isDepositModalOpen, setIsDepositModalOpen] = useState<boolean>(false);
  const [isTurbosModalOpen, setIsTurbosModalOpen] = useState<boolean>(false);
  const [selectedPool, setSelectedPool] = useState<PoolInfo | null>(null);

  const [notification, setNotification] = useState<{
    message: string;
    isSuccess: boolean;
    txDigest?: string;
  } | null>(null);

  // State for token balances to pass to deposit modals
  const [tokenABalance, setTokenABalance] = useState<string>("0");
  const [tokenBBalance, setTokenBBalance] = useState<string>("0");

  // Track selected DEX filter
  const [selectedDex, setSelectedDex] = useState<string | null>(null);

  // Add search debounce timer
  const [searchTimer, setSearchTimer] = useState<NodeJS.Timeout | null>(null);

  // Cache BirdEye metadata for all token addresses
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, any>>({});

  // Currently supported DEXes for deposit
  const supportedDexes = ["cetus", "bluefin", "turbos-finance", "turbos"];

  // Set maximum number of pools to show in results
  const MAX_POOLS_TO_DISPLAY = 20;

  // Handle navigation to other pages
  const navigateToPage = (tab: TabType) => {
    if (tab === TabType.MY_POSITIONS) {
      navigate("/positions");
    } else if (tab === TabType.PORTFOLIO) {
      navigate("/portfolio");
    } else if (tab === TabType.VAULTS) {
      setActiveTab(TabType.VAULTS);
    } else {
      setActiveTab(TabType.POOLS);
    }
  };

  /** ------------------------------------------------------------
   * Fetch pools from CoinGecko + enrich with BirdEye logos
   * ----------------------------------------------------------- */
  const fetchPools = useCallback(async () => {
    setLoading(true);
    try {
      const poolsData = await coinGeckoService.getDefaultPools();
      console.log(`Fetched ${poolsData.length} pools from CoinGecko`);

      // Collect all token addresses
      const addrs = new Set<string>();
      poolsData.forEach((p) => {
        if (p.tokenAAddress) addrs.add(p.tokenAAddress);
        if (p.tokenBAddress) addrs.add(p.tokenBAddress);
      });

      // Fetch BirdEye metadata in one batch
      if (addrs.size) {
        console.log(
          `Fetching BirdEye metadata for ${addrs.size} token addresses`
        );
        const meta = await birdeyeService.getMultipleTokenMetadata(
          Array.from(addrs)
        );
        console.log(
          `Retrieved metadata for ${Object.keys(meta).length} tokens`
        );

        // Log a sample of the metadata to check format
        if (Object.keys(meta).length > 0) {
          const sampleKey = Object.keys(meta)[0];
          console.log(`Sample metadata for ${sampleKey}:`, meta[sampleKey]);
        }

        setTokenMetadata(meta);
      }

      // Save to state
      setOriginalPools(poolsData);
      setPools(poolsData);

      // Sort by APR by default
      const sortedPools = [...poolsData].sort((a, b) => b.apr - a.apr);
      setFilteredPools(sortedPools.slice(0, MAX_POOLS_TO_DISPLAY));
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
   * Fetch pools by DEX + enrich with BirdEye logos
   */
  const fetchPoolsByDex = useCallback(
    async (dex: string) => {
      setLoading(true);
      try {
        console.log(`Fetching top pools for DEX: ${dex}`);

        // Try to use cached data first
        const dexPools = originalPools.filter(
          (p) => p.dex.toLowerCase() === dex.toLowerCase()
        );
        if (dexPools.length >= MAX_POOLS_TO_DISPLAY) {
          const sorted = [...dexPools].sort(
            (a, b) => b.liquidityUSD - a.liquidityUSD
          );
          setPools(sorted);
          setFilteredPools(sorted.slice(0, MAX_POOLS_TO_DISPLAY));
          setLoading(false);
          return;
        }

        // Otherwise fetch fresh
        const poolsByDex = await coinGeckoService.getPoolsByDex(
          dex,
          MAX_POOLS_TO_DISPLAY
        );

        // Collect addresses & fetch metadata
        const addrs = new Set<string>();
        poolsByDex.forEach((p) => {
          if (p.tokenAAddress) addrs.add(p.tokenAAddress);
          if (p.tokenBAddress) addrs.add(p.tokenBAddress);
        });
        if (addrs.size) {
          const meta = await birdeyeService.getMultipleTokenMetadata(
            Array.from(addrs)
          );
          setTokenMetadata((prev) => ({ ...prev, ...meta }));
        }

        setPools(poolsByDex);
        setFilteredPools(poolsByDex);
      } catch (error) {
        console.error(`Failed to fetch pools for DEX ${dex}:`, error);
        // Fallback to cached
        const dexPools = originalPools.filter(
          (p) => p.dex.toLowerCase() === dex.toLowerCase()
        );
        setPools(dexPools);
        setFilteredPools(dexPools.slice(0, MAX_POOLS_TO_DISPLAY));
      } finally {
        setLoading(false);
      }
    },
    [originalPools]
  );

  /**
   * Search pools + enrich with BirdEye logos
   */
  const performSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        if (selectedDex) {
          setFilteredPools(
            pools.filter(
              (p) => p.dex.toLowerCase() === selectedDex.toLowerCase()
            )
          );
        } else {
          setFilteredPools(pools);
        }
        return;
      }

      setLoading(true);
      try {
        const searchResults = await coinGeckoService.searchPools(
          query,
          MAX_POOLS_TO_DISPLAY
        );
        console.log(`Search returned ${searchResults.length} results`);

        // Enrich logos
        const addrs = new Set<string>();
        searchResults.forEach((p) => {
          if (p.tokenAAddress) addrs.add(p.tokenAAddress);
          if (p.tokenBAddress) addrs.add(p.tokenBAddress);
        });
        if (addrs.size) {
          const meta = await birdeyeService.getMultipleTokenMetadata(
            Array.from(addrs)
          );
          setTokenMetadata((prev) => ({ ...prev, ...meta }));
        }

        let result = searchResults;
        if (selectedDex) {
          result = result.filter(
            (p) => p.dex.toLowerCase() === selectedDex.toLowerCase()
          );
        }
        result.sort((a, b) => {
          const va = a[sortColumn];
          const vb = b[sortColumn];
          if (sortOrder === "asc") return va > vb ? 1 : -1;
          return va < vb ? 1 : -1;
        });
        setFilteredPools(result);
      } catch (error) {
        console.error("Error during search:", error);
        // fallback filter
        const lower = query.toLowerCase();
        let result = pools.filter(
          (p) =>
            p.tokenA.toLowerCase().includes(lower) ||
            p.tokenB.toLowerCase().includes(lower) ||
            p.name.toLowerCase().includes(lower) ||
            p.dex.toLowerCase().includes(lower) ||
            p.rewardSymbols.some((s) => s.toLowerCase().includes(lower))
        );
        if (selectedDex) {
          result = result.filter(
            (p) => p.dex.toLowerCase() === selectedDex.toLowerCase()
          );
        }
        setFilteredPools(result.slice(0, MAX_POOLS_TO_DISPLAY));
      } finally {
        setLoading(false);
      }
    },
    [pools, selectedDex, sortColumn, sortOrder]
  );

  // Debounced search handler
  const handleSearch = useCallback(
    (query: string) => {
      setSearch(query);
      if (searchTimer) clearTimeout(searchTimer);
      const t = setTimeout(() => performSearch(query), 300);
      setSearchTimer(t);
    },
    [searchTimer, performSearch]
  );

  // Cleanup debounce on unmount
  useEffect(
    () => () => {
      if (searchTimer) clearTimeout(searchTimer);
    },
    [searchTimer]
  );

  // Reset filters
  const handleReset = useCallback(() => {
    setSearch("");
    setSelectedDex(null);
    setSortColumn("apr");
    setSortOrder("desc");
    setPools(originalPools);
    setFilteredPools(
      [...originalPools]
        .sort((a, b) => b.apr - a.apr)
        .slice(0, MAX_POOLS_TO_DISPLAY)
    );
  }, [originalPools]);

  // Sorting
  const handleSort = (col: typeof sortColumn) => {
    if (sortColumn === col) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(col);
      setSortOrder("desc");
    }
  };
  useEffect(() => {
    setFilteredPools((prev) =>
      [...prev].sort((a, b) => {
        const va = a[sortColumn],
          vb = b[sortColumn];
        if (sortOrder === "asc") return va > vb ? 1 : -1;
        return va < vb ? 1 : -1;
      })
    );
  }, [sortColumn, sortOrder]);

  // DEX filter
  const handleDexChange = useCallback(
    (dex: string | null) => {
      setSelectedDex(dex);
      if (dex) {
        fetchPoolsByDex(dex);
      } else {
        setPools(originalPools);
        if (search.trim()) performSearch(search);
        else setFilteredPools(originalPools.slice(0, MAX_POOLS_TO_DISPLAY));
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

  /**
   * Check if a pool is a Turbos pool
   */
  const isTurbosPool = (pool: PoolInfo): boolean => {
    // Check if the pool belongs to Turbos Finance
    return (
      turbosService.isTurbosPool(pool.address, pool.dex) ||
      pool.dex.toLowerCase() === "turbos" ||
      pool.dex.toLowerCase() === "turbos-finance"
    );
  };

  /**
   * Fetch token balances for the deposit modals
   */
  const fetchTokenBalances = async (pool: PoolInfo) => {
    if (!account?.address) return;

    try {
      // This is a simplified example - you might need to adjust this based on your actual API
      const tokenABalance = await birdeyeService.getTokenBalance(
        account.address,
        pool.tokenAAddress || pool.tokenA
      );
      const tokenBBalance = await birdeyeService.getTokenBalance(
        account.address,
        pool.tokenBAddress || pool.tokenB
      );

      setTokenABalance(tokenABalance);
      setTokenBBalance(tokenBBalance);
    } catch (error) {
      console.error("Failed to fetch token balances:", error);
      setTokenABalance("0");
      setTokenBBalance("0");
    }
  };

  // Deposit modal
  const handleOpenDepositModal = async (pool: PoolInfo) => {
    setSelectedPool(pool);

    // Fetch token balances
    await fetchTokenBalances(pool);

    // Check if this is a Turbos pool to determine which modal to open
    if (isTurbosPool(pool)) {
      console.log("Opening Turbos deposit modal for pool:", pool.address);
      setIsTurbosModalOpen(true);
    } else {
      console.log("Opening standard deposit modal for pool:", pool.address);
      setIsDepositModalOpen(true);
    }
  };

  const handleCloseDepositModal = () => {
    setIsDepositModalOpen(false);
    setIsTurbosModalOpen(false);
    setSelectedPool(null);
  };

  /**
   * Determine which service to use based on the pool
   */
  const getServiceForPool = (pool: PoolInfo) => {
    if (bluefinService.isBluefinPool(pool.address, pool.dex)) {
      return bluefinService;
    } else if (turbosService.isTurbosPool(pool.address, pool.dex)) {
      return turbosService;
    } else {
      return cetusService; // Default to Cetus
    }
  };

  /**
   * Handle deposit submission from standard deposit modal
   */
  const handleDeposit = async (
    amountA: string,
    amountB: string,
    slippage: string,
    tickLower?: number,
    tickUpper?: number,
    deltaLiquidity?: string
  ) => {
    if (!selectedPool || !connected || !account) {
      console.error("Cannot deposit: missing context");
      return { success: false, digest: "" };
    }
    try {
      console.log("Initiating deposit to", selectedPool.address);
      console.log("Amount A:", amountA, selectedPool.tokenA);
      console.log("Amount B:", amountB, selectedPool.tokenB);
      console.log("Slippage:", slippage + "%");

      if (tickLower !== undefined && tickUpper !== undefined) {
        console.log("Tick Range:", tickLower, "to", tickUpper);
      }

      const aNum = parseFloat(amountA);
      const bNum = parseFloat(amountB);
      if (isNaN(aNum) || isNaN(bNum)) {
        throw new Error("Invalid amount");
      }

      // Determine which service to use
      const service = getServiceForPool(selectedPool);
      const serviceName =
        service === bluefinService
          ? "Bluefin"
          : service === turbosService
          ? "Turbos"
          : "Cetus";

      console.log(
        `Using ${serviceName} service for deposit to ${selectedPool.address}`
      );

      let txResult;

      // Handle deposit based on the service
      if (service === turbosService) {
        // Turbos finance deposit
        txResult = await service.deposit(
          wallet,
          selectedPool.address,
          aNum,
          bNum,
          selectedPool,
          tickLower,
          tickUpper,
          parseFloat(slippage) // Pass slippage percentage
        );
      } else if (service === bluefinService) {
        // Bluefin deposit (doesn't use tick ranges)
        txResult = await service.deposit(
          wallet,
          selectedPool.address,
          aNum,
          bNum,
          selectedPool
        );
      } else {
        // Cetus deposit
        txResult = await service.deposit(
          wallet,
          selectedPool.address,
          aNum,
          bNum,
          selectedPool,
          tickLower,
          tickUpper
        );
      }

      console.log("Deposit transaction completed:", txResult);

      setNotification({
        message: `Successfully deposited ${amountA} ${selectedPool.tokenA} and ${amountB} ${selectedPool.tokenB} to ${selectedPool.dex} pool`,
        isSuccess: true,
        txDigest: txResult.digest,
      });

      // Refresh positions after a delay
      setTimeout(() => {
        if (account?.address) {
          // Refresh positions logic would go here
        }
      }, 3000);

      return txResult;
    } catch (err: any) {
      console.error("Deposit failed:", err);
      setNotification({
        message: `Failed to deposit: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
        isSuccess: false,
      });
      throw err;
    }
  };

  /**
   * Handle deposit submission from Turbos deposit modal
   */
  const handleTurbosDeposit = async (
    poolId: string,
    amountA: number,
    amountB: number,
    tickLower: number,
    tickUpper: number,
    slippage: number
  ) => {
    if (!selectedPool || !connected || !account) {
      console.error("Cannot deposit: missing context");
      return { success: false, digest: "" };
    }

    try {
      console.log("Initiating Turbos deposit to", poolId);
      console.log("Amount A:", amountA, selectedPool.tokenA);
      console.log("Amount B:", amountB, selectedPool.tokenB);
      console.log("Slippage:", slippage + "%");
      console.log("Tick Range:", tickLower, "to", tickUpper);

      // Use the Turbos service for the deposit
      console.log("Using Turbos service for deposit to", poolId);

      const result = await turbosService.deposit(
        wallet,
        poolId,
        amountA,
        amountB,
        selectedPool, // Pass pool info
        tickLower,
        tickUpper,
        slippage
      );

      if (result.success) {
        setNotification({
          message: `Successfully deposited ${amountA} ${selectedPool.tokenA} and ${amountB} ${selectedPool.tokenB} to Turbos pool`,
          isSuccess: true,
          txDigest: result.digest,
        });

        // Refresh positions after a delay
        setTimeout(() => {
          if (account?.address) {
            // Refresh positions logic would go here
          }
        }, 3000);
      }

      return result;
    } catch (err: any) {
      console.error("Turbos deposit failed:", err);
      setNotification({
        message: `Failed to deposit: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
        isSuccess: false,
      });
      throw err;
    }
  };

  const dismissNotification = () => setNotification(null);

  const getAprClass = (apr: number) => {
    if (apr >= 100) return "high";
    if (apr >= 50) return "medium";
    return "low";
  };

  const isDexSupported = (dex: string) => {
    const normalizedDex = dex.toLowerCase();
    return supportedDexes.some(
      (supported) =>
        normalizedDex === supported.toLowerCase() ||
        normalizedDex.includes(supported.toLowerCase())
    );
  };

  const getDexDisplayName = (id: string) => {
    const d = SUPPORTED_DEXES.find(
      (x) => x.id.toLowerCase() === id.toLowerCase()
    );
    return d ? d.name : id.charAt(0).toUpperCase() + id.slice(1);
  };

  const normalizeProtocolName = (dexId: string) => {
    const special: Record<string, string> = {
      "flow-x": "flowx",
      "turbos-finance": "turbos",
      "kriya-dex": "kriya",
    };
    const norm = dexId.toLowerCase();
    return special[norm] ?? norm.replace(/[-_]/g, "");
  };

  // Helper to get the best logo URL for a token
  const getTokenLogoUrl = (pool: PoolInfo, isTokenA: boolean) => {
    // First try to get token address
    const address = isTokenA ? pool.tokenAAddress : pool.tokenBAddress;
    const symbol = isTokenA ? pool.tokenA : pool.tokenB;

    // For debugging, log what we have
    console.debug(
      `Getting logo for ${symbol} (${isTokenA ? "token A" : "token B"})${
        address ? ` address ${address}` : ""
      }`
    );

    // First try BirdEye metadata
    if (address && tokenMetadata[address]) {
      const metadata = tokenMetadata[address];

      console.debug(`Found BirdEye metadata for ${symbol}`, metadata);

      // Check all possible logo fields
      if (metadata.logo_uri) return metadata.logo_uri;
      if (metadata.logoUrl) return metadata.logoUrl;
      if (metadata.logoURI) return metadata.logoURI;
      if (metadata.logo) return metadata.logo;
    } else if (address) {
      console.debug(`No BirdEye metadata found for ${symbol} (${address})`);
    }

    // Then try pool metadata
    const poolMetadata = isTokenA ? pool.tokenAMetadata : pool.tokenBMetadata;
    if (poolMetadata) {
      console.debug(`Found pool metadata for ${symbol}`, poolMetadata);

      // Check all possible logo fields
      const logo =
        poolMetadata.logo_uri ||
        poolMetadata.logoUrl ||
        poolMetadata.logoURI ||
        poolMetadata.logo;

      if (logo) return logo;
    }

    // No logo found in metadata
    console.debug(`No logo URL found for ${symbol}`);
    return undefined;
  };

  // Render the pool content
  const renderPoolContent = () => {
    return (
      <>
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
                            <EnhancedTokenIcon
                              symbol={pool.tokenA}
                              logoUrl={getTokenLogoUrl(pool, true)}
                              address={pool.tokenAAddress}
                              size="md"
                              className="token-a"
                            />
                            <EnhancedTokenIcon
                              symbol={pool.tokenB}
                              logoUrl={getTokenLogoUrl(pool, false)}
                              address={pool.tokenBAddress}
                              size="md"
                              className="token-b"
                            />
                          </div>
                          <div className="pool-info">
                            <div className="pair-name">
                              {pool.tokenA} / {pool.tokenB}
                            </div>
                            {pool.name?.match(/(\d+(\.\d+)?)%/) && (
                              <div className="fee-tier">
                                {pool.name.match(/(\d+(\.\d+)?)%/)![0]}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        <ProtocolBadge
                          protocol={getDexDisplayName(pool.dex)}
                          protocolClass={normalizeProtocolName(pool.dex)}
                        />
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
                          onClick={() =>
                            isDexSupported(pool.dex)
                              ? handleOpenDepositModal(pool)
                              : undefined
                          }
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
      </>
    );
  };

  return (
    <div className="pools-page">
      <div className="content-container">
        <div className="main-navigation">
          <div
            className={`nav-link ${
              activeTab === TabType.POOLS ? "active" : ""
            }`}
            onClick={() => navigateToPage(TabType.POOLS)}
          >
            Pools
          </div>
          <Link to="/positions" className="nav-link">
            My Positions
          </Link>
          <Link to="/portfolio" className="nav-link">
            Portfolio
          </Link>
          <div
            className={`nav-link ${
              activeTab === TabType.VAULTS ? "active" : ""
            }`}
            onClick={() => navigateToPage(TabType.VAULTS)}
          >
            Vaults
          </div>
        </div>

        {activeTab === TabType.POOLS && renderPoolContent()}
        {activeTab === TabType.VAULTS && <VaultSection />}

        {/* Standard Deposit Modal for non-Turbos pools */}
        {selectedPool && !isTurbosPool(selectedPool) && (
          <DepositModal
            isOpen={isDepositModalOpen}
            onClose={handleCloseDepositModal}
            onDeposit={handleDeposit}
            pool={selectedPool}
            walletConnected={connected}
          />
        )}

        {/* Turbos-specific Deposit Modal */}
        {selectedPool && isTurbosPool(selectedPool) && (
          <TurbosDepositModal
            visible={isTurbosModalOpen}
            onCancel={handleCloseDepositModal}
            onDeposit={handleTurbosDeposit}
            poolInfo={selectedPool}
            tokenABalance={tokenABalance}
            tokenBBalance={tokenBBalance}
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
