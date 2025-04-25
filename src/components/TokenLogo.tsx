import React from "react";

import "../styles/components/TokenLogo.scss";

interface TokenLogoProps {
  logoUrl?: string;
  symbol: string;
  size?: "sm" | "md" | "lg";
}

const TokenLogo: React.FC<TokenLogoProps> = ({
  logoUrl,
  symbol,
  size = "md",
}) => {
  const sizeClass =
    size === "sm"
      ? "token-logo-sm"
      : size === "lg"
      ? "token-logo-lg"
      : "token-logo";

  return (
    <div className={sizeClass}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={symbol}
          onError={(e) => {
            // Fallback to first letter if image fails to load
            e.currentTarget.style.display = "none";
            const parent = e.currentTarget.parentNode as HTMLElement;
            parent.innerHTML = `${symbol ? symbol.charAt(0) : "?"}`;
          }}
        />
      ) : (
        <span className="token-fallback">
          {symbol ? symbol.charAt(0) : "?"}
        </span>
      )}
    </div>
  );
};

export default TokenLogo;
