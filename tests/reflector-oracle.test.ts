import { describe, it, expect, beforeEach } from "vitest";
import { ReflectorOracleAdapter } from "../src/lib/reflector-oracle-adapter.js";

describe("ReflectorOracleAdapter - Verifiable On-Chain Price Feeds & Slippage Guard", () => {
  let adapter: ReflectorOracleAdapter;

  beforeEach(() => {
    adapter = new ReflectorOracleAdapter({
      maxStalenessSeconds: 120, // 2 minutes
      maxDeviationPercent: 2.0, // 2% max deviation
      fallbackEnabled: true,
    });
  });

  it("should fetch live reference prices for major Stellar assets", async () => {
    const xlmFeed = await adapter.getPrice("XLM");
    expect(xlmFeed.symbol).toBe("XLM");
    expect(xlmFeed.priceUsd).toBeGreaterThan(0);
    expect(xlmFeed.status).toBe("live");

    const usdcFeed = await adapter.getPrice("USDC");
    expect(usdcFeed.priceUsd).toBe(1.00);
    expect(usdcFeed.decimals).toBe(7);
  });

  it("should validate proposed trade execution price within allowed deviation tolerance", async () => {
    // Current XLM is $0.52. 1% deviation ($0.525) should pass
    const validation = await adapter.validateTradePrice("XLM", 0.525, 2.0);
    expect(validation.ok).toBe(true);
    expect(validation.code).toBe("PRICE_VALIDATED");
    expect(validation.deviationPercent).toBeLessThan(2.0);
  });

  it("should reject proposed trade execution price when deviation exceeds tolerance", async () => {
    // Current XLM is $0.52. $0.55 is ~5.77% deviation -> should reject
    const validation = await adapter.validateTradePrice("XLM", 0.55, 2.0);
    expect(validation.ok).toBe(false);
    expect(validation.code).toBe("EXCESSIVE_SLIPPAGE_DEVIATION");
    expect(validation.message).toContain("deviates by");
  });

  it("should auto-trip circuit breaker on extreme market flash-crash / manipulation attempt", async () => {
    // Proposed price $0.20 is -61.5% deviation -> extreme anomaly (>= 10%)
    const validation = await adapter.validateTradePrice("XLM", 0.20, 2.0);
    expect(validation.ok).toBe(false);
    expect(validation.code).toBe("EXCESSIVE_SLIPPAGE_DEVIATION");

    // Subsequent query should report circuit broken
    const feed = await adapter.getPrice("XLM");
    expect(feed.status).toBe("circuit_broken");

    // Next trade attempt should be blocked by circuit breaker
    const blockedTrade = await adapter.validateTradePrice("XLM", 0.52);
    expect(blockedTrade.ok).toBe(false);
    expect(blockedTrade.code).toBe("ORACLE_CIRCUIT_BROKEN");
  });

  it("should flag stale price feeds when timestamp exceeds max staleness window", async () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 300; // 5 minutes ago
    adapter.updatePriceFeed("XLM", 0.50, oldTimestamp);

    const feed = await adapter.getPrice("XLM");
    expect(feed.status).toBe("stale");
  });

  it("should accurately convert currency amounts using real-time oracle exchange rates", async () => {
    adapter.updatePriceFeed("XLM", 0.50);
    adapter.updatePriceFeed("USDC", 1.00);

    // 100 XLM @ $0.50 should equal 50 USDC
    const conversion = await adapter.convertAmount("XLM", "USDC", 100);
    expect(conversion.convertedAmount).toBe(50);
    expect(conversion.rate).toBe(0.5);
  });

  it("should allow manual circuit breaker trip and recovery", async () => {
    adapter.triggerCircuitBreaker("BTC", "Emergency volatility lock");
    let feed = await adapter.getPrice("BTC");
    expect(feed.status).toBe("circuit_broken");

    adapter.resetCircuitBreaker("BTC");
    feed = await adapter.getPrice("BTC");
    expect(feed.status).toBe("live");
  });
});
