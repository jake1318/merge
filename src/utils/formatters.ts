// src/utils/formatters.ts
// Last Updated: 2025-05-05 06:51:22 UTC by jake1318

/**
 * Format large numbers with K, M, B, T suffixes
 */
export function formatLargeNumber(num: number): string {
  if (num === 0) return "0";

  if (num < 1000) {
    return num.toLocaleString();
  }

  const units = ["", "K", "M", "B", "T"];
  const unitIndex = Math.floor(Math.log10(num) / 3);
  const unitValue = num / Math.pow(10, 3 * unitIndex);

  return unitValue.toFixed(2) + units[unitIndex];
}

/**
 * Format dollar amounts with $ prefix and appropriate decimal places
 */
export function formatDollars(amount: number): string {
  // Ensure we're working with a number
  const numericAmount =
    typeof amount === "string" ? parseFloat(amount) : amount;

  // Force to 0 if NaN or undefined
  if (isNaN(numericAmount) || numericAmount === undefined) return "$0.00";

  // For very small values, show with more decimals
  if (numericAmount === 0) return "$0.00";

  // For very small values, show with more decimals
  if (numericAmount < 0.01 && numericAmount > 0) {
    return "$<0.01";
  }

  // For negative small values
  if (numericAmount > -0.01 && numericAmount < 0) {
    return "-$<0.01";
  }

  // For small values (< $1), show up to 4 decimal places
  if (Math.abs(numericAmount) < 1) {
    return numericAmount >= 0
      ? `$${numericAmount.toFixed(4)}`
      : `-$${Math.abs(numericAmount).toFixed(4)}`;
  }

  // For medium values ($1-$1000), show up to 2 decimal places
  if (Math.abs(numericAmount) < 1000) {
    return numericAmount >= 0
      ? `$${numericAmount.toFixed(2)}`
      : `-$${Math.abs(numericAmount).toFixed(2)}`;
  }

  // For large values, format with K, M, B suffixes
  const units = ["", "K", "M", "B", "T"];
  const unitIndex = Math.floor(Math.log10(Math.abs(numericAmount)) / 3);
  const unitValue = numericAmount / Math.pow(10, 3 * unitIndex);

  return numericAmount >= 0
    ? `$${unitValue.toFixed(2)}${units[unitIndex]}`
    : `-$${Math.abs(unitValue).toFixed(2)}${units[unitIndex]}`;
}

/**
 * Format percentages with % suffix and appropriate decimal places
 */
export function formatPercentage(value: number): string {
  if (isNaN(value)) return "0.00%";

  // For very small values
  if (Math.abs(value) < 0.01) {
    return value === 0 ? "0.00%" : value > 0 ? "<0.01%" : ">-0.01%";
  }

  // For normal values, show 2 decimal places
  return `${value.toFixed(2)}%`;
}

/**
 * Format numbers with commas and limited decimal places
 */
export function formatNumber(value: number, decimals: number = 2): string {
  // Handle edge cases
  if (value === null || value === undefined || isNaN(value)) return "0";
  if (value === 0) return "0";
  if (value > 0 && value < 0.01) return "<0.01";
  if (value < 0 && value > -0.01) return ">-0.01";

  // Format with the specified number of decimal places
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}
