// src/pages/Lending/LendingPage.tsx
// Last Updated: 2025-05-08 17:38:37 UTC by jake1318

import React, { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { Link } from "react-router-dom";
import TokenIcon from "../../components/TokenIcon";
import {
  formatDollars,
  formatPercentage,
  formatLargeNumber,
} from "../../utils/formatters";
import "../../styles/pages/Lending/LendingPage.scss";

// Types for lending markets and user positions
interface LendingMarket {
  id: string;
  tokenSymbol: string;
  tokenAddress: string;
  tokenLogo: string;
  totalSupply: number;
  totalBorrowed: number;
  depositAPY: number;
  borrowAPY: number;
  utilizationRate: number; // percentage of total supply that's borrowed
  availableLiquidity: number;
  price: number; // USD price
}

interface UserLendPosition {
  marketId: string;
  tokenSymbol: string;
  tokenAddress: string;
  tokenLogo: string;
  amountSupplied: number;
  aTokenBalance: number; // lending receipt token amount
  valueSupplied: number; // USD value
  earnedInterest: number; // USD value
  depositAPY: number;
}

interface UserBorrowPosition {
  marketId: string;
  tokenSymbol: string;
  tokenAddress: string;
  tokenLogo: string;
  amountBorrowed: number;
  debtTokenBalance: number;
  valueBorrowed: number; // USD value
  accruedInterest: number; // USD value
  borrowAPY: number;
  healthFactor: number; // > 1 is good, < 1 is liquidation territory
}

interface UserLendingStats {
  totalSupplied: number; // USD value
  totalBorrowed: number; // USD value
  borrowLimit: number; // USD value
  borrowLimitUsed: number; // percentage
  netAPY: number; // net APY taking into account lending and borrowing
}

const LendingPage: React.FC = () => {
  const { account, connected } = useWallet();
  const [activeTab, setActiveTab] = useState<"supply" | "borrow">("supply");
  const [loading, setLoading] = useState<boolean>(true);
  const [marketsData, setMarketsData] = useState<LendingMarket[]>([]);
  const [userSupplyPositions, setUserSupplyPositions] = useState<
    UserLendPosition[]
  >([]);
  const [userBorrowPositions, setUserBorrowPositions] = useState<
    UserBorrowPosition[]
  >([]);
  const [userStats, setUserStats] = useState<UserLendingStats>({
    totalSupplied: 0,
    totalBorrowed: 0,
    borrowLimit: 0,
    borrowLimitUsed: 0,
    netAPY: 0,
  });

  const [supplyModalOpen, setSupplyModalOpen] = useState<boolean>(false);
  const [borrowModalOpen, setBorrowModalOpen] = useState<boolean>(false);
  const [selectedMarket, setSelectedMarket] = useState<LendingMarket | null>(
    null
  );

  useEffect(() => {
    loadData();
  }, [connected, account?.address]);

  // Mock data loading function - would be replaced with actual API calls
  const loadData = async () => {
    setLoading(true);

    try {
      // Simulating API call wait time
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Load mock market data
      const mockMarkets: LendingMarket[] = [
        {
          id: "sui-market",
          tokenSymbol: "SUI",
          tokenAddress: "0x2::sui::SUI",
          tokenLogo:
            "https://coin-images.coingecko.com/coins/images/26375/small/sui-ocean-square.png?1727791290",
          totalSupply: 2450000,
          totalBorrowed: 1100000,
          depositAPY: 1.8,
          borrowAPY: 3.2,
          utilizationRate: 44.89,
          availableLiquidity: 1350000,
          price: 1.43,
        },
        {
          id: "usdc-market",
          tokenSymbol: "USDC",
          tokenAddress:
            "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
          tokenLogo:
            "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png",
          totalSupply: 5800000,
          totalBorrowed: 4200000,
          depositAPY: 3.2,
          borrowAPY: 4.1,
          utilizationRate: 72.41,
          availableLiquidity: 1600000,
          price: 1.0,
        },
        {
          id: "usdt-market",
          tokenSymbol: "USDT",
          tokenAddress:
            "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN",
          tokenLogo:
            "https://assets.coingecko.com/coins/images/325/thumb/Tether.png",
          totalSupply: 3200000,
          totalBorrowed: 2100000,
          depositAPY: 3.0,
          borrowAPY: 4.5,
          utilizationRate: 65.62,
          availableLiquidity: 1100000,
          price: 1.0,
        },
        {
          id: "eth-market",
          tokenSymbol: "wETH",
          tokenAddress:
            "0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN",
          tokenLogo:
            "https://assets.coingecko.com/coins/images/279/small/ethereum.png?1595348880",
          totalSupply: 980000,
          totalBorrowed: 680000,
          depositAPY: 0.95,
          borrowAPY: 1.35,
          utilizationRate: 69.38,
          availableLiquidity: 300000,
          price: 3282.47,
        },
        {
          id: "cetus-market",
          tokenSymbol: "CETUS",
          tokenAddress:
            "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
          tokenLogo: "https://icons.llama.fi/cetus.png",
          totalSupply: 12500000,
          totalBorrowed: 5800000,
          depositAPY: 8.6,
          borrowAPY: 12.4,
          utilizationRate: 46.4,
          availableLiquidity: 6700000,
          price: 0.0324,
        },
      ];

      setMarketsData(mockMarkets);

      // If user is connected, load their positions
      if (connected && account?.address) {
        // Mock user supply positions
        setUserSupplyPositions([
          {
            marketId: "usdc-market",
            tokenSymbol: "USDC",
            tokenAddress:
              "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
            tokenLogo:
              "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png",
            amountSupplied: 5000,
            aTokenBalance: 5012.5,
            valueSupplied: 5000,
            earnedInterest: 12.5,
            depositAPY: 3.2,
          },
          {
            marketId: "sui-market",
            tokenSymbol: "SUI",
            tokenAddress: "0x2::sui::SUI",
            tokenLogo:
              "https://coin-images.coingecko.com/coins/images/26375/small/sui-ocean-square.png?1727791290",
            amountSupplied: 2500,
            aTokenBalance: 2520,
            valueSupplied: 3575,
            earnedInterest: 28.6,
            depositAPY: 1.8,
          },
        ]);

        // Mock user borrow positions
        setUserBorrowPositions([
          {
            marketId: "usdt-market",
            tokenSymbol: "USDT",
            tokenAddress:
              "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN",
            tokenLogo:
              "https://assets.coingecko.com/coins/images/325/thumb/Tether.png",
            amountBorrowed: 2000,
            debtTokenBalance: 2008,
            valueBorrowed: 2000,
            accruedInterest: 8,
            borrowAPY: 4.5,
            healthFactor: 1.8,
          },
        ]);

        // Mock user stats
        setUserStats({
          totalSupplied: 8575, // $5000 (USDC) + $3575 (SUI)
          totalBorrowed: 2000, // $2000 (USDT)
          borrowLimit: 6002.5, // 70% of totalSupplied
          borrowLimitUsed: 33.32, // (totalBorrowed / borrowLimit) * 100
          netAPY: 1.05, // weighted average of deposit APY - borrow APY
        });
      }
    } catch (error) {
      console.error("Error loading lending data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSupply = (market: LendingMarket) => {
    setSelectedMarket(market);
    setSupplyModalOpen(true);
  };

  const handleBorrow = (market: LendingMarket) => {
    setSelectedMarket(market);
    setBorrowModalOpen(true);
  };

  const handleWithdraw = (position: UserLendPosition) => {
    const market = marketsData.find((m) => m.id === position.marketId);
    if (market) {
      setSelectedMarket(market);
      // Here you would open a withdraw modal
      console.log(`Withdraw from ${market.tokenSymbol}`);
    }
  };

  const handleRepay = (position: UserBorrowPosition) => {
    const market = marketsData.find((m) => m.id === position.marketId);
    if (market) {
      setSelectedMarket(market);
      // Here you would open a repay modal
      console.log(`Repay ${market.tokenSymbol} loan`);
    }
  };

  // Render the user's dashboard with their lending/borrowing positions
  const renderUserDashboard = () => {
    if (!connected) {
      return (
        <div className="connect-wallet-prompt">
          <div className="empty-state">
            <div className="empty-icon">🔐</div>
            <h3>Wallet Not Connected</h3>
            <p>
              Connect your wallet to view your lending positions and start
              earning interest.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="user-lending-dashboard">
        <div className="dashboard-stats">
          <div className="stat-item">
            <span className="stat-label">Supply Balance</span>
            <span className="stat-value">
              {formatDollars(userStats.totalSupplied)}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Borrow Balance</span>
            <span className="stat-value">
              {formatDollars(userStats.totalBorrowed)}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Borrow Limit</span>
            <div className="limit-bar">
              <div
                className="limit-fill"
                style={{ width: `${userStats.borrowLimitUsed}%` }}
                data-status={
                  userStats.borrowLimitUsed > 80 ? "warning" : "safe"
                }
              ></div>
            </div>
            <div className="limit-text">
              <span>{formatDollars(userStats.totalBorrowed)}</span>
              <span>{formatDollars(userStats.borrowLimit)}</span>
            </div>
            <span className="limit-percentage">
              {formatPercentage(userStats.borrowLimitUsed)}% used
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Net APY</span>
            <span
              className="stat-value"
              data-value-type={userStats.netAPY >= 0 ? "positive" : "negative"}
            >
              {formatPercentage(userStats.netAPY)}%
            </span>
          </div>
        </div>

        {/* User supply positions */}
        {userSupplyPositions.length > 0 && (
          <div className="user-positions-section">
            <h3>Your Supplies</h3>
            <div className="positions-table">
              <table>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th className="align-right">Balance</th>
                    <th className="align-right">APY</th>
                    <th className="align-right">Collateral</th>
                    <th className="actions-column">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {userSupplyPositions.map((position) => (
                    <tr key={position.marketId}>
                      <td className="asset-cell">
                        <div className="asset-info">
                          <TokenIcon
                            token={{
                              symbol: position.tokenSymbol,
                              name: position.tokenSymbol,
                              address: position.tokenAddress,
                            }}
                            metadata={{
                              logo_uri: position.tokenLogo,
                              logoUrl: position.tokenLogo,
                              logoURI: position.tokenLogo,
                              logo: position.tokenLogo,
                              address: position.tokenAddress,
                            }}
                            size="small"
                          />
                          <span>{position.tokenSymbol}</span>
                        </div>
                      </td>
                      <td className="align-right">
                        <div className="balance-info">
                          <div>
                            {formatLargeNumber(position.amountSupplied)}
                          </div>
                          <div className="secondary-text">
                            {formatDollars(position.valueSupplied)}
                          </div>
                        </div>
                      </td>
                      <td className="align-right">
                        <span className="apy-value">
                          {formatPercentage(position.depositAPY)}%
                        </span>
                      </td>
                      <td className="align-right">
                        <span className="status-badge success">Yes</span>
                      </td>
                      <td className="actions-cell">
                        <div className="action-buttons">
                          <button
                            className="btn btn--primary btn--sm"
                            onClick={() => handleWithdraw(position)}
                          >
                            Withdraw
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* User borrow positions */}
        {userBorrowPositions.length > 0 && (
          <div className="user-positions-section">
            <h3>Your Borrows</h3>
            <div className="positions-table">
              <table>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th className="align-right">Debt</th>
                    <th className="align-right">APY</th>
                    <th className="align-right">Health Factor</th>
                    <th className="actions-column">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {userBorrowPositions.map((position) => (
                    <tr key={position.marketId}>
                      <td className="asset-cell">
                        <div className="asset-info">
                          <TokenIcon
                            token={{
                              symbol: position.tokenSymbol,
                              name: position.tokenSymbol,
                              address: position.tokenAddress,
                            }}
                            metadata={{
                              logo_uri: position.tokenLogo,
                              logoUrl: position.tokenLogo,
                              logoURI: position.tokenLogo,
                              logo: position.tokenLogo,
                              address: position.tokenAddress,
                            }}
                            size="small"
                          />
                          <span>{position.tokenSymbol}</span>
                        </div>
                      </td>
                      <td className="align-right">
                        <div className="balance-info">
                          <div>
                            {formatLargeNumber(position.amountBorrowed)}
                          </div>
                          <div className="secondary-text">
                            {formatDollars(position.valueBorrowed)}
                          </div>
                        </div>
                      </td>
                      <td className="align-right">
                        <span className="apy-value">
                          {formatPercentage(position.borrowAPY)}%
                        </span>
                      </td>
                      <td className="align-right">
                        <span
                          className={`health-factor ${
                            position.healthFactor < 1.2 ? "warning" : "safe"
                          }`}
                        >
                          {position.healthFactor.toFixed(2)}
                        </span>
                      </td>
                      <td className="actions-cell">
                        <div className="action-buttons">
                          <button
                            className="btn btn--primary btn--sm"
                            onClick={() => handleRepay(position)}
                          >
                            Repay
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render all available lending markets
  const renderMarketsTable = () => {
    return (
      <div className="markets-table-container">
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              {activeTab === "supply" && (
                <>
                  <th className="align-right">Total Supply</th>
                  <th className="align-right">Supply APY</th>
                </>
              )}
              {activeTab === "borrow" && (
                <>
                  <th className="align-right">Total Borrowed</th>
                  <th className="align-right">Borrow APY</th>
                </>
              )}
              <th className="align-right">Utilization</th>
              <th className="actions-column">Actions</th>
            </tr>
          </thead>
          <tbody>
            {marketsData.map((market) => (
              <tr key={market.id} className="market-row">
                <td className="asset-cell">
                  <div className="asset-info">
                    <TokenIcon
                      token={{
                        symbol: market.tokenSymbol,
                        name: market.tokenSymbol,
                        address: market.tokenAddress,
                      }}
                      metadata={{
                        logo_uri: market.tokenLogo,
                        logoUrl: market.tokenLogo,
                        logoURI: market.tokenLogo,
                        logo: market.tokenLogo,
                        address: market.tokenAddress,
                      }}
                      size="small"
                    />
                    <span>{market.tokenSymbol}</span>
                  </div>
                </td>
                {activeTab === "supply" && (
                  <>
                    <td className="align-right">
                      <div className="balance-info">
                        <div>{formatLargeNumber(market.totalSupply)}</div>
                        <div className="secondary-text">
                          {formatDollars(market.totalSupply)}
                        </div>
                      </div>
                    </td>
                    <td className="align-right">
                      <span className="apy-value positive">
                        {formatPercentage(market.depositAPY)}%
                      </span>
                    </td>
                  </>
                )}
                {activeTab === "borrow" && (
                  <>
                    <td className="align-right">
                      <div className="balance-info">
                        <div>{formatLargeNumber(market.totalBorrowed)}</div>
                        <div className="secondary-text">
                          {formatDollars(market.totalBorrowed)}
                        </div>
                      </div>
                    </td>
                    <td className="align-right">
                      <span className="apy-value negative">
                        {formatPercentage(market.borrowAPY)}%
                      </span>
                    </td>
                  </>
                )}
                <td className="align-right">
                  <div className="utilization-wrapper">
                    <div className="utilization-bar">
                      <div
                        className="utilization-fill"
                        style={{ width: `${market.utilizationRate}%` }}
                      ></div>
                    </div>
                    <span className="utilization-text">
                      {formatPercentage(market.utilizationRate)}%
                    </span>
                  </div>
                </td>
                <td className="actions-cell">
                  <div className="action-buttons">
                    {activeTab === "supply" && (
                      <button
                        className="btn btn--primary btn--sm"
                        onClick={() => handleSupply(market)}
                      >
                        Supply
                      </button>
                    )}
                    {activeTab === "borrow" && (
                      <button
                        className="btn btn--accent btn--sm"
                        onClick={() => handleBorrow(market)}
                      >
                        Borrow
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="lending-page">
      <div className="content-container">
        <div className="page-header">
          <div className="page-title">
            <h1>Lending &amp; Borrowing</h1>
            <p className="subtitle">
              Supply assets to earn interest or borrow against your collateral
            </p>
          </div>
        </div>

        {/* User dashboard if connected */}
        {renderUserDashboard()}

        {/* Tab navigation */}
        <div className="tabs-navigation">
          <button
            className={`tab-button ${activeTab === "supply" ? "active" : ""}`}
            onClick={() => setActiveTab("supply")}
          >
            Supply Markets
          </button>
          <button
            className={`tab-button ${activeTab === "borrow" ? "active" : ""}`}
            onClick={() => setActiveTab("borrow")}
          >
            Borrow Markets
          </button>
        </div>

        {/* Markets tables */}
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <div className="loading-text">Loading markets data...</div>
          </div>
        ) : (
          renderMarketsTable()
        )}

        {/* Supply Modal would go here */}

        {/* Borrow Modal would go here */}
      </div>
    </div>
  );
};

export default LendingPage;
