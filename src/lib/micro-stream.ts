/**
 * Real-time micro-payment streaming calculations for LLM inference, API usage, and continuous work.
 */

export interface TokenPricingRate {
  /** Cost in stroops per 1,000 prompt tokens (1 USDC = 10,000,000 stroops). */
  promptStroopsPer1k: bigint;
  /** Cost in stroops per 1,000 completion tokens. */
  completionStroopsPer1k: bigint;
}

/**
 * Calculate the exact stroop amount for given token usage.
 */
export function calculateTokenCost(
  promptTokens: number,
  completionTokens: number,
  rates: TokenPricingRate
): bigint {
  if (promptTokens < 0 || completionTokens < 0) {
    throw new Error("Token counts must be non-negative");
  }

  const promptCost = (BigInt(promptTokens) * rates.promptStroopsPer1k) / 1000n;
  const completionCost = (BigInt(completionTokens) * rates.completionStroopsPer1k) / 1000n;

  return promptCost + completionCost;
}

/**
 * Convert human-readable decimal USDC amount string to integer stroops (7 decimals).
 */
export function usdcToStroops(usdcAmount: string): bigint {
  const parts = usdcAmount.trim().split(".");
  if (parts.length > 2) throw new Error("Invalid decimal format");

  const whole = BigInt(parts[0] || "0");
  const fractionStr = (parts[1] || "").slice(0, 7).padEnd(7, "0");
  const fraction = BigInt(fractionStr);

  return whole * 10_000_000n + fraction;
}

/**
 * Convert stroops integer to human-readable 7-decimal USDC string.
 */
export function stroopsToUsdc(stroops: bigint): string {
  if (stroops < 0n) throw new Error("Stroops must be non-negative");
  const whole = stroops / 10_000_000n;
  const fraction = stroops % 10_000_000n;
  return `${whole}.${fraction.toString().padStart(7, "0")}`;
}
