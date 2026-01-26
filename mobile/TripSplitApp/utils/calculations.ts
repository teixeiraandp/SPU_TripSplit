/**
 * Client-side utility functions for TripSplit
 *
 * Note: Balance calculations and settlement suggestions are now handled
 * by the backend API. This file contains only display/formatting utilities.
 */

/**
 * Format currency with proper sign
 */
export function formatCurrency(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount).toFixed(2);
  return sign + "$" + abs;
}