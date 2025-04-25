import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import SearchBar from "../../components/SearchBar";
import PoolTable from "../../components/PoolTable";
import DepositModal from "../../components/DepositModal";
import TransactionNotification from "../../components/TransactionNotification";
import { PoolInfo } from "../../services/coinGeckoService";
import { getDefaultPools, searchPools } from "../../services/coinGeckoService";
import { getMultipleTokenMetadata } from "../../services/birdeyeService";
import "../../styles/pages/Pools.scss";

const DEFAULT_DEX = "all";

const Pools: React.FC = () => {
  const [defaultPools, setDefaultPools] = useState<PoolInfo[]>([]);
  const [displayPools, setDisplayPools] = useState<PoolInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDex, setSelectedDex] = useState<string>(DEFAULT_DEX);
  const [availableDexes, setAvailableDexes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMetadata, setLoadingMetadata] = useState(false);

  const [sortColumn, setSortColumn] = useState<keyof PoolInfo>("volumeUSD");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // modal & notification state
  const [modalPool, setModalPool] = useState<PoolInfo | null>(null);
  const [notification, setNotification] = useState<{
    visible: boolean;
    message: string;
    isSuccess: boolean;
    txDigest?: string;
  } | null>(null);

  // 1) load all pools
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const pools = await getDefaultPools();
        setDefaultPools(pools);
        setDisplayPools(pools);
        // build dex list
        const dexList = Array.from(
          new Set(pools.map((p) => p.dex.toLowerCase()))
        );
        setAvailableDexes([DEFAULT_DEX, ...dexList]);
      } catch (e) {
        console.error("load pools failed", e);
      } finally {
        setLoading(false);
      }
      // background token metadata
      fetchMetadata(defaultPools);
    }
    load();
  }, []);

  // 2) fetch metadata for top pools
  const fetchMetadata = async (pools: PoolInfo[]) => {
    if (!pools.length) return;
    setLoadingMetadata(true);
    try {
      const top = [...pools]
        .sort((a, b) => b.liquidityUSD - a.liquidityUSD)
        .slice(0, 20);

      const addresses = new Set<string>();
      top.forEach((p) => {
        if (p.tokenAAddress) addresses.add(p.tokenAAddress);
        if (p.tokenBAddress) addresses.add(p.tokenBAddress);
      });

      const meta = await getMultipleTokenMetadata(Array.from(addresses));
      setDefaultPools((prev) =>
        prev.map((p) => ({
          ...p,
          tokenAMetadata: p.tokenAAddress ? meta[p.tokenAAddress] : undefined,
          tokenBMetadata: p.tokenBAddress ? meta[p.tokenBAddress] : undefined,
        }))
      );
    } catch (e) {
      console.error("fetch metadata failed", e);
    } finally {
      setLoadingMetadata(false);
    }
  };

  // 3) handle search
  const onSearch = useCallback(
    async (term: string) => {
      setSearchTerm(term);
      if (!term.trim()) {
        // reset
        setDisplayPools(defaultPools);
      } else {
        try {
          const results = await searchPools(term);
          setDisplayPools(results);
          // optionally pull metadata for new ones...
        } catch (e) {
          console.error("searchPools error", e);
        }
      }
    },
    [defaultPools]
  );

  // 4) handle dex filter
  const onDexChange = (dex: string | null) => {
    const dexKey = dex || DEFAULT_DEX;
    setSelectedDex(dexKey);
    let filtered = defaultPools;
    if (dexKey !== DEFAULT_DEX) {
      filtered = defaultPools.filter((p) => p.dex.toLowerCase() === dexKey);
    }
    // also respect searchTerm
    if (searchTerm.trim()) {
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.tokenA.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.tokenB.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    setDisplayPools(filtered);
  };

  // 5) sorting
  const onSortChange = (column: keyof PoolInfo) => {
    if (column === sortColumn) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortOrder("desc");
    }
  };

  // 6) deposit button handler
  const onDeposit = (pool: PoolInfo) => {
    setModalPool(pool);
  };

  return (
    <div className="pools-page">
      <h1>Liquidity Pools</h1>
      <div className="pools-controls">
        <Link to="/">Pools</Link> | <Link to="/positions">My Positions</Link>
        <SearchBar
          value={searchTerm}
          placeholder="Search pools or tokens..."
          onChange={onSearch}
        />
        <div>
          DEX:
          <select
            value={selectedDex}
            onChange={(e) => onDexChange(e.target.value || DEFAULT_DEX)}
          >
            {availableDexes.map((dex) => (
              <option key={dex} value={dex}>
                {dex === DEFAULT_DEX ? "All DEXes" : dex.toUpperCase()}
              </option>
            ))}
          </select>
          <button onClick={() => onDexChange(DEFAULT_DEX)}>Reset</button>
        </div>
      </div>

      <PoolTable
        pools={displayPools}
        sortColumn={sortColumn}
        sortOrder={sortOrder}
        onSortChange={onSortChange}
        onDeposit={onDeposit}
      />

      {modalPool && (
        <DepositModal
          pool={modalPool}
          onClose={() => setModalPool(null)}
          onSuccess={(msg, tx) =>
            setNotification({
              visible: true,
              message: msg,
              txDigest: tx,
              isSuccess: true,
            })
          }
          onFailure={(msg) =>
            setNotification({ visible: true, message: msg, isSuccess: false })
          }
        />
      )}

      {notification && notification.visible && (
        <TransactionNotification
          message={notification.message}
          txDigest={notification.txDigest}
          isSuccess={notification.isSuccess}
          onClose={() => setNotification(null)}
        />
      )}
    </div>
  );
};

export default Pools;
