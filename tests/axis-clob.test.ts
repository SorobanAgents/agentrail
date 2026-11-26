import { describe, it, expect } from "vitest";
import {
  AXIS_MAINNET_CONTRACT_ID,
  AXIS_TESTNET_CONTRACT_ID,
  validateAxisOrderAgainstScope,
  executeAxisPreFlightSpend
} from "../src/lib/axis-clob-provider.js";
import {
  ScopedAllowance,
  AxisLimitOrder,
  AxisTradingScopePolicy
} from "../src/types.js";

describe("AgentRail - AXIS CLOB DEX Trading Adapter", () => {
  const masterOwner = "GA6HCMBLTZS5VYYBCATRBRZ3ACJ2DZISNL6WB74H7TBD2TV52UV7SJIR";
  const agentKey = "GCXKG6RN4ONIEPCMNFB732A436Z5PNDSRLGWK7GBLCMQLIFO4HXQNXAL";
  const treasuryKey = "GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT";

  const defaultAllowance: ScopedAllowance = {
    id: "allowance-axis-demo-1",
    ownerPublicKey: masterOwner,
    agentPublicKey: agentKey,
    maxStroops: 500_0000000n, // 500 USDC
    spentStroops: 0n,
    validFrom: 1700000000,
    validUntil: 2000000000,
    allowedDestinations: [AXIS_MAINNET_CONTRACT_ID],
    active: true,
    protocolFeeBps: 20, // 0.20%
    treasuryPublicKey: treasuryKey,
  };

  const defaultPolicy: AxisTradingScopePolicy = {
    allowedMarkets: [AXIS_MAINNET_CONTRACT_ID, AXIS_TESTNET_CONTRACT_ID],
    allowedPairs: ["XLM/USDC", "USDC/EURC", "PYUSD/USDC"],
    maxSingleOrderStroops: 100_0000000n, // 100 USDC max per order
    maxSlippagePercent: 2.0, // 2% max deviation
    allowMarketOrders: false,
  };

  const validBuyOrder: AxisLimitOrder = {
    orderId: "ord-101",
    agentPublicKey: agentKey,
    marketContract: AXIS_MAINNET_CONTRACT_ID,
    baseAsset: "XLM",
    quoteAsset: "USDC",
    side: "buy",
    orderType: "limit",
    price: 0.125,
    amount: 40,
    quoteAmountStroops: 5_0000000n, // 5 USDC
    expiresAt: 1900000000,
    clientNonce: "nonce-xyz-1",
  };

  it("should validate and approve a compliant limit order within scoped boundaries", () => {
    const res = validateAxisOrderAgainstScope(
      defaultAllowance,
      defaultPolicy,
      validBuyOrder,
      0.1245 // Reference mid price (~0.4% deviation)
    );

    expect(res.ok).toBe(true);
    expect(res.code).toBe("ORDER_VALIDATED_FOR_EXECUTION");
    expect(res.effectiveSpendStroops).toBe(5_0000000n);
    expect(res.remainingAllowanceStroops).toBe(495_0000000n);
  });

  it("should execute atomic pre-flight spend deduction with protocol fee accounting", () => {
    const mutableAllowance = { ...defaultAllowance };
    const { validation, spendResult } = executeAxisPreFlightSpend(
      mutableAllowance,
      defaultPolicy,
      validBuyOrder,
      1750000000,
      0.1245
    );

    expect(validation.ok).toBe(true);
    expect(spendResult).toBeDefined();
    expect(spendResult?.ok).toBe(true);
    // 5 USDC = 50,000,000 stroops. 20 bps = 100,000 stroops fee.
    expect(spendResult?.feeStroops).toBe(100000n);
    expect(spendResult?.netStroops).toBe(49900000n);
    expect(spendResult?.remainingStroops).toBe(495_0000000n);
  });

  it("should reject an order exceeding single-order policy cap", () => {
    const oversizedOrder: AxisLimitOrder = {
      ...validBuyOrder,
      quoteAmountStroops: 150_0000000n, // 150 USDC (Cap is 100 USDC)
    };

    const res = validateAxisOrderAgainstScope(
      defaultAllowance,
      defaultPolicy,
      oversizedOrder
    );

    expect(res.ok).toBe(false);
    expect(res.code).toBe("ORDER_SIZE_EXCEEDS_POLICY_CAP");
  });

  it("should reject an order exceeding remaining epoch allowance", () => {
    const drainedAllowance: ScopedAllowance = {
      ...defaultAllowance,
      spentStroops: 498_0000000n, // Remaining is 2 USDC
    };

    const largeOrder: AxisLimitOrder = {
      ...validBuyOrder,
      quoteAmountStroops: 5_0000000n, // 5 USDC
    };

    const res = validateAxisOrderAgainstScope(
      drainedAllowance,
      defaultPolicy,
      largeOrder
    );

    expect(res.ok).toBe(false);
    expect(res.code).toBe("INSUFFICIENT_SCOPED_ALLOWANCE");
  });

  it("should block an unauthorized trading pair", () => {
    const unapprovedPairOrder: AxisLimitOrder = {
      ...validBuyOrder,
      baseAsset: "SHIB",
      quoteAsset: "USDC",
    };

    const res = validateAxisOrderAgainstScope(
      defaultAllowance,
      defaultPolicy,
      unapprovedPairOrder
    );

    expect(res.ok).toBe(false);
    expect(res.code).toBe("UNAUTHORIZED_TRADING_PAIR");
    expect(res.message).toContain("SHIB/USDC");
  });

  it("should block market orders when disallowed by policy", () => {
    const marketOrder: AxisLimitOrder = {
      ...validBuyOrder,
      orderType: "market",
    };

    const res = validateAxisOrderAgainstScope(
      defaultAllowance,
      defaultPolicy,
      marketOrder
    );

    expect(res.ok).toBe(false);
    expect(res.code).toBe("MARKET_ORDERS_DISALLOWED");
  });

  it("should block predatory slippage exceeding policy threshold (Buy side)", () => {
    // Reference price is 0.100. Order is at 0.105 (+5% deviation, cap is 2%)
    const badBuyOrder: AxisLimitOrder = {
      ...validBuyOrder,
      price: 0.105,
    };

    const res = validateAxisOrderAgainstScope(
      defaultAllowance,
      defaultPolicy,
      badBuyOrder,
      0.100
    );

    expect(res.ok).toBe(false);
    expect(res.code).toBe("SLIPPAGE_LIMIT_EXCEEDED");
    expect(res.message).toContain("exceeds max allowed price");
  });

  it("should block predatory slippage exceeding policy threshold (Sell side)", () => {
    // Reference price is 1.00. Sell order dumped at 0.95 (-5% deviation, cap is 2%)
    const badSellOrder: AxisLimitOrder = {
      ...validBuyOrder,
      side: "sell",
      price: 0.95,
    };

    const res = validateAxisOrderAgainstScope(
      defaultAllowance,
      defaultPolicy,
      badSellOrder,
      1.00
    );

    expect(res.ok).toBe(false);
    expect(res.code).toBe("SLIPPAGE_LIMIT_EXCEEDED");
    expect(res.message).toContain("falls below min allowed price");
  });

  it("should catch and block address-poisoning spoof attacks mimicking AXIS contract", () => {
    // Exact 56-character spoofed address with matching CDEX prefix and AXIS suffix
    const poisonedContract = "CDEX" + "A".repeat(48) + "AXIS";
    expect(poisonedContract.length).toBe(56);

    const poisonedOrder: AxisLimitOrder = {
      ...validBuyOrder,
      marketContract: poisonedContract,
    };

    const res = validateAxisOrderAgainstScope(
      defaultAllowance,
      defaultPolicy,
      poisonedOrder
    );

    expect(res.ok).toBe(false);
    expect(res.code).toBe("AXIS_POISONED_CONTRACT_DETECTED");
  });
});
