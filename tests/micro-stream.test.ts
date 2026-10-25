import { describe, it, expect } from "vitest";
import {
  calculateTokenCost,
  usdcToStroops,
  stroopsToUsdc,
  TokenPricingRate,
} from "../src/lib/micro-stream.js";

const mockRates: TokenPricingRate = {
  promptStroopsPer1k: 1500n,     // 0.00015 USDC per 1k prompt tokens
  completionStroopsPer1k: 6000n, // 0.00060 USDC per 1k completion tokens
};

describe("Micro-Stream Payment Calculator", () => {
  it("calculates exact stroop fees for prompt and completion tokens", () => {
    // 2,000 prompt tokens = 3,000 stroops
    // 1,000 completion tokens = 6,000 stroops
    // Total = 9,000 stroops ($0.0009 USDC)
    const cost = calculateTokenCost(2000, 1000, mockRates);
    expect(cost).toBe(9000n);
  });

  it("handles zero token counts gracefully", () => {
    expect(calculateTokenCost(0, 0, mockRates)).toBe(0n);
  });

  it("converts decimal USDC to integer stroops accurately", () => {
    expect(usdcToStroops("1.5000000")).toBe(15_000_000n);
    expect(usdcToStroops("0.0000001")).toBe(1n);
    expect(usdcToStroops("10")).toBe(100_000_000n);
  });

  it("converts integer stroops to 7-decimal USDC string", () => {
    expect(stroopsToUsdc(15_000_000n)).toBe("1.5000000");
    expect(stroopsToUsdc(1n)).toBe("0.0000001");
    expect(stroopsToUsdc(100_000_000n)).toBe("10.0000000");
  });
});
