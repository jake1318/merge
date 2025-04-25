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
  if (amount === 0) return "$0.00";

  // For very small values, show with more decimals
  if (amount < 0.01 && amount > 0) {
    return "$<0.01";
  }

  // For small values (< $1), show up to 4 decimal places
  if (amount < 1) {
    return `$${amount.toFixed(4)}`;
  }

  // For medium values ($1-$1000), show up to 2 decimal places
  if (amount < 1000) {
    return `$${amount.toFixed(2)}`;
  }

  // For large values, format with K, M, B suffixes
  const units = ["", "K", "M", "B", "T"];
  const unitIndex = Math.floor(Math.log10(amount) / 3);
  const unitValue = amount / Math.pow(10, 3 * unitIndex);

  return `$${unitValue.toFixed(2)}${units[unitIndex]}`;
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
