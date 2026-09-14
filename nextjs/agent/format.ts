/**
 * Formatters shared by server and client components.
 *
 * Kept free of node imports so client bundles can use them too.
 */

export function formatInr(amount: number): string {
  return `₹${new Intl.NumberFormat("en-IN").format(Math.round(amount))}`;
}

export function formatUsd(amount: number): string {
  if (amount === 0) return "$0";
  return amount < 0.01 ? `$${amount.toFixed(4)}` : `$${amount.toFixed(2)}`;
}
