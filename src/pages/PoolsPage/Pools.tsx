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

const Pools: React.FC = () => {
  const { connected, account } = useWallet();
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

  // Track available DEXes and selected DEX filter
  const [availableDexes, setAvailableDexes] = useState<string[]>([]);
  const [selectedDex, setSelectedDex] = useState<string | null>(null);

  // Currently supported DEXes for deposit
  const supportedDexes = ["cetus"];

  const fetchPools = useCallback(async () => {
    setLoading(true);
    try {
      // Changed from getPools to getDefaultPools
      const poolsData = await coinGeckoService.getDefaultPools();
      console.log("Fetched pools:", poolsData);
      setPools(poolsData);

      // Extract unique DEXes
      const dexes = [...new Set(poolsData.map((p) => p.dex.toLowerCase()))];
      setAvailableDexes(dexes);
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

  // Apply filters and sorting
  useEffect(() => {
    let result = [...pools];

    // Apply DEX filter if selected
    if (selectedDex) {
      result = result.filter(
        (pool) => pool.dex.toLowerCase() === selectedDex.toLowerCase()
      );
    }

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
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

    setFilteredPools(result);
  }, [pools, search, sortColumn, sortOrder, selectedDex]);

  const handleSearch = (query: string) => {
    setSearch(query);
  };

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

  const handleDexChange = (dex: string | null) => {
    setSelectedDex(dex);
  };

  const handleOpenDepositModal = (pool: PoolInfo) => {
    setSelectedPool(pool);
    setIsDepositModalOpen(true);
  };

  const handleCloseDepositModal = () => {
    setIsDepositModalOpen(false);
    setSelectedPool(null);
  };

  const handleDeposit = async (amount: string) => {
    if (!selectedPool || !connected || !account) return;

    try {
      setNotification({
        message: "Processing deposit...",
        isSuccess: true,
      });

      // Simulate a successful deposit for now
      await new Promise((resolve) => setTimeout(resolve, 2000));

      setNotification({
        message: `Successfully deposited ${amount} to ${selectedPool.tokenA}/${selectedPool.tokenB} pool`,
        isSuccess: true,
        txDigest: "simulated-tx-" + Date.now().toString(),
      });

      handleCloseDepositModal();
    } catch (error) {
      console.error("Deposit failed:", error);
      setNotification({
        message: "Deposit failed. Please try again.",
        isSuccess: false,
      });
    }
  };

  const dismissNotification = () => {
    setNotification(null);
  };

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
                {availableDexes.map((dex) => (
                  <option key={dex} value={dex}>
                    {dex.charAt(0).toUpperCase() + dex.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <button
              className="action-button"
              onClick={() => handleDexChange(null)}
            >
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
                  <th onClick={() => {}}>Pool</th>
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
                        <span className="dex-badge">{pool.dex}</span>
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
                          disabled={!isDexSupported(pool.dex)}
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
          <TransactionNotification
            message={notification.message}
            txDigest={notification.txDigest}
            isSuccess={notification.isSuccess}
            onClose={dismissNotification}
          />
        )}
      </div>
    </div>
  );
};

// Helper function to format numbers with commas and limited decimal places
function formatNumber(value: number, decimals: number = 2): string {
  if (!value && value !== 0) return "0";

  // Handle very small values
  if (value > 0 && value < 0.01) {
    return "<0.01";
  }

  // Format with commas and limited decimal places
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
  }).format(value);
}

export default Pools;
