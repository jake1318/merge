// src/pages/Dex/components/PairSelector.tsx
import React, { useState, useEffect } from "react";
import "./PairSelector.scss";

export interface TradingPair {
  id: string;
  name: string; // e.g. "BTC/USDC"
  baseAsset: string; // e.g. "BTC"
  quoteAsset: string; // e.g. "USDC"
  price: number;
  change24h: number; // percent, e.g. -0.62 or +1.78
}

interface PairSelectorProps {
  pairs: TradingPair[];
  selectedPair: TradingPair;
  onSelectPair: (pair: TradingPair) => void;
}

const PairSelector: React.FC<PairSelectorProps> = ({
  pairs,
  selectedPair,
  onSelectPair,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showFavorites, setShowFavorites] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem("favoritePairs");
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem("favoritePairs", JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (symbol: string) => {
    setFavorites((prev) =>
      prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol]
    );
  };

  const filtered = pairs.filter((p) => {
    const sym = p.name.toLowerCase();
    if (searchTerm && !sym.includes(searchTerm.toLowerCase())) return false;
    if (showFavorites && !favorites.includes(p.name)) return false;
    return true;
  });

  return (
    <div className="pair-selector">
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="filter-bar">
        <button
          className={!showFavorites ? "active" : ""}
          onClick={() => setShowFavorites(false)}
        >
          All
        </button>
        <button
          className={showFavorites ? "active" : ""}
          onClick={() => setShowFavorites(true)}
        >
          Favorites
        </button>
      </div>

      <div className="pair-list">
        {filtered.map((p) => {
          const symbol = p.name;
          const isActive = selectedPair.id === p.id;
          const positive = p.change24h > 0;
          const changeClass = positive
            ? "positive"
            : p.change24h < 0
            ? "negative"
            : "neutral";
          return (
            <div
              key={p.id}
              className={`pair-item ${isActive ? "active" : ""}`}
              onClick={() => onSelectPair(p)}
            >
              <span className="pair-symbol">
                <span
                  className={`star ${
                    favorites.includes(symbol) ? "favorite" : ""
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(symbol);
                  }}
                >
                  {favorites.includes(symbol) ? "★" : "☆"}
                </span>
                {symbol}
              </span>
              <span className="pair-price">{p.price.toFixed(4)}</span>
              <span className={`pair-change ${changeClass}`}>
                {positive ? "+" : ""}
                {p.change24h.toFixed(2)}%
              </span>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="no-results">No pairs found</div>
        )}
      </div>
    </div>
  );
};

export default PairSelector;
