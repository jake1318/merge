// src/pages/Dex/Dex.tsx
import React, { useState, useEffect, useRef } from "react";
import { useWallet } from "@suiet/wallet-kit";

import Chart from "./components/Chart";
import OrderForm from "./components/OrderForm";
import TradingHistory from "./components/TradingHistory";
import PairSelector from "./components/PairSelector";
import LimitOrderManager from "./components/LimitOrderManager";

import { blockvisionService } from "../../services/blockvisionService";
import { birdeyeService } from "../../services/birdeyeService";

import "./Dex.scss";

// --- Token addresses for building your pairs list ---
const BASE_TOKEN_ADDRESSES = [
  "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
  "0x2::sui::SUI",
  "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
  "0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH",
  "0xaafb102dd0902f5055cadecd687fb5b71ca82ef0e0285d90afde828ec58ca96b::btc::BTC",
  "0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX",
  "0x7016aae72cfc67f2fadf55769c0a7dd54291a583b63051a5ed71081cce836ac6::sca::SCA",
  "0xb7844e289a8410e50fb3ca48d69eb9cf29e27d223ef90353fe1bd8e27ff8f3f8::coin::COIN",
  "0x3a5143bb1196e3bcdfab6203d1683ae29edd26294fc8bfeafe4aaa9d2704df37::coin::COIN",
];
const USDC_ADDRESS =
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

interface TradingPair {
  id: string;
  name: string;
  baseAsset: string;
  quoteAsset: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  baseAddress: string;
  quoteAddress: string;
  logo?: string;
}

const Dex: React.FC = () => {
  const { connected } = useWallet();
  const [tradingPairs, setTradingPairs] = useState<TradingPair[]>([]);
  const [selectedPair, setSelectedPair] = useState<TradingPair | null>(null);
  const [orderType, setOrderType] = useState<"buy" | "sell">("buy");
  const [orderMode, setOrderMode] = useState<"limit" | "market">("limit");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // BlockVision fetch
  const fetchBlockvisionData = async (coinType: string) => {
    try {
      const resp = await blockvisionService.getCoinDetail(coinType);
      const d = resp.data;
      return {
        name: d.name || "Unknown",
        symbol: d.symbol || "???",
        decimals: d.decimals || 0,
        logo: d.logo || "",
        price: d.price ? parseFloat(String(d.price)) : 0,
        change24h: d.priceChangePercentage24H
          ? parseFloat(String(d.priceChangePercentage24H))
          : 0,
      };
    } catch {
      return {
        name: "Unknown",
        symbol: "???",
        decimals: 0,
        logo: "",
        price: 0,
        change24h: 0,
      };
    }
  };

  // Birdeye fetch with rate‐limit & retry
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const fetchBirdeyeDataInSequence = async (addresses: string[]) => {
    const results = new Map<
      string,
      { volume24h: number; high24h: number; low24h: number }
    >();

    for (const addr of addresses) {
      let record = { volume24h: 0, high24h: 0, low24h: 0 };

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const resp = await birdeyeService.getPriceVolumeSingle(addr, "24h");
          const d = resp.data?.data || {};
          record = {
            volume24h: d.volumeUSD ?? 0,
            high24h: d.high24h ?? 0,
            low24h: d.low24h ?? 0,
          };
          break;
        } catch (err: any) {
          if (err.response?.status === 429 && attempt < 3) {
            await sleep(1000);
            continue;
          }
          console.error("Birdeye fetch error for", addr, err.message || err);
          break;
        }
      }

      results.set(addr, record);
      await sleep(150);
    }

    return results;
  };

  // Build trading pairs
  const loadPairs = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const bvList = await Promise.all(
        BASE_TOKEN_ADDRESSES.map(fetchBlockvisionData)
      );
      const beMap = await fetchBirdeyeDataInSequence(BASE_TOKEN_ADDRESSES);

      const pairs = BASE_TOKEN_ADDRESSES.map((addr, idx) => {
        const bv = bvList[idx];
        const be = beMap.get(addr)!;
        const sym = bv.symbol === "???" ? addr.slice(0, 8) : bv.symbol;
        return {
          id: `${sym.toLowerCase()}-usdc`,
          name: `${sym}/USDC`,
          baseAsset: sym,
          quoteAsset: "USDC",
          price: bv.price,
          change24h: bv.change24h,
          volume24h: be.volume24h,
          high24h: be.high24h,
          low24h: be.low24h,
          baseAddress: addr,
          quoteAddress: USDC_ADDRESS,
          logo: bv.logo,
        } as TradingPair;
      });

      setTradingPairs(pairs);
      if (pairs.length) setSelectedPair(pairs[0]);
    } catch (e: any) {
      console.error("loadPairs error:", e);
      setError(e.message || "Failed to load pairs");
    } finally {
      setIsLoading(false);
    }
  };

  // Auto‑refresh price & change
  const refreshSelectedPair = async (pair: TradingPair) => {
    try {
      const resp = await blockvisionService.getCoinDetail(pair.baseAddress);
      const d = resp.data;
      const newPrice = d.price ? parseFloat(String(d.price)) : 0;
      const newChg = d.priceChangePercentage24H
        ? parseFloat(String(d.priceChangePercentage24H))
        : 0;

      setTradingPairs((prev) =>
        prev.map((p) =>
          p.baseAddress === pair.baseAddress
            ? { ...p, price: newPrice, change24h: newChg }
            : p
        )
      );
      setSelectedPair((curr) =>
        curr?.baseAddress === pair.baseAddress
          ? { ...curr, price: newPrice, change24h: newChg }
          : curr
      );
    } catch (e) {
      console.error("Refresh error:", e);
    }
  };

  const startRefreshInterval = (pair: TradingPair) => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(
      () => refreshSelectedPair(pair),
      60_000
    );
  };

  // 👉 useEffect calls must not return a Promise! 👈
  useEffect(() => {
    loadPairs();
  }, []);

  useEffect(() => {
    if (selectedPair) {
      startRefreshInterval(selectedPair);
      // cleanup on unmount or when selectedPair changes
      return () => {
        if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      };
    }
  }, [selectedPair]);

  const handleSelectPair = (pair: TradingPair) => {
    setSelectedPair(pair);
  };

  const stats = selectedPair
    ? {
        price: selectedPair.price,
        change24h: selectedPair.change24h,
        volume24h: selectedPair.volume24h,
        high24h: selectedPair.high24h,
        low24h: selectedPair.low24h,
        logo: selectedPair.logo,
      }
    : {
        price: 0,
        change24h: 0,
        volume24h: 0,
        high24h: 0,
        low24h: 0,
        logo: "",
      };

  return (
    <div className="dex-page">
      <div className="glow-1" />
      <div className="glow-2" />
      <div className="vertical-scan" />

      <div className="dex-page__container">
        {/* Header */}
        <div className="dex-page__header">
          <h1>DEX Trading</h1>
          <div className="header-actions">
            {isLoading && <span className="loading-indicator">Updating…</span>}
            <button onClick={loadPairs} disabled={isLoading}>
              ↻ Refresh
            </button>
          </div>
        </div>

        {error && <div className="dex-error">{error}</div>}

        {selectedPair && (
          <div className="dex-page__grid">
            {/* Top Stats */}
            <div className="top-stats">
              <div className="stats-grid two-line-stats">
                <div className="ticker-cell">
                  <span className="ticker-text">{selectedPair.baseAsset}</span>
                  {stats.logo && (
                    <img
                      src={stats.logo}
                      alt={`${selectedPair.baseAsset} logo`}
                      className="token-logo"
                    />
                  )}
                </div>
                <span className="cell label">Price</span>
                <span className="cell label">24h Change</span>
                <span className="cell label">24h Volume</span>
                <span className="cell label">24h High</span>
                <span className="cell label">24h Low</span>

                <span
                  className={`cell value ${
                    stats.change24h >= 0 ? "positive" : "negative"
                  }`}
                >
                  ${stats.price.toFixed(stats.price < 1 ? 6 : 4)}
                </span>
                <span
                  className={`cell value ${
                    stats.change24h >= 0 ? "positive" : "negative"
                  }`}
                >
                  {stats.change24h >= 0 ? "+" : ""}
                  {stats.change24h.toFixed(2)}%
                </span>
                <span className="cell value">
                  ${stats.volume24h.toLocaleString()}
                </span>
                <span className="cell value">
                  ${stats.high24h.toFixed(stats.high24h < 1 ? 6 : 4)}
                </span>
                <span className="cell value">
                  ${stats.low24h.toFixed(stats.low24h < 1 ? 6 : 4)}
                </span>
              </div>
            </div>

            {/* Recent Trades */}
            <div className="trading-history-container">
              <TradingHistory pair={selectedPair} />
            </div>

            {/* Chart */}
            <div className="chart-panel">
              <Chart pair={selectedPair} />
            </div>

            {/* Pair Selector */}
            <div className="pair-selector-container">
              <PairSelector
                pairs={tradingPairs}
                selectedPair={selectedPair}
                onSelectPair={handleSelectPair}
              />
            </div>

            {/* Order Form */}
            <div className="order-form-container">
              <OrderForm
                pair={selectedPair}
                orderType={orderType}
                setOrderType={setOrderType}
                orderMode={orderMode}
                setOrderMode={setOrderMode}
              />
            </div>

            {/* Open/Closed Orders */}
            <div className="my-orders-container">
              <LimitOrderManager
                selectedPair={`${selectedPair.baseAddress}-${selectedPair.quoteAddress}`}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dex;
