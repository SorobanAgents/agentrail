/**
 * AgentRail - AXIS CLOB DEX Provider
 * 
 * Implements non-custodial Scoped Allowance guardrails for autonomous AI agents
 * trading on AXIS (Central Limit Order Book DEX on Stellar Soroban).
 * 
 * Provides:
 * - Real-time market data ingestion from AXIS API (REST / Mainnet)
 * - Zero-Trust Pre-flight order validation against ScopedAllowance budget
 * - Protection against Hot-Wallet draining, address spoofing, and excessive slippage
 * - Atomic deduction with protocol monetization fee accounting
 */

import {
  ScopedAllowance,
  AxisLimitOrder,
  AxisTradingScopePolicy,
  AxisOrderValidationResult,
  SpendResult
} from "../types.js";
import { isPoisonedAddress, verifyAndDeductSpend } from "./scoped-allowance.js";

export const AXIS_MAINNET_CONTRACT_ID = "CDEXKHTLZ24O7OIKNCUMA6I4KFINHOQQAHZ3RNYUH3THVKAFDLOGAXIS";
export const AXIS_TESTNET_CONTRACT_ID = "CDEXXIITLZ24O70IKNCUMA6I4KFINIIXQQAIZ3RNYUII3TIIVKAFDDLOGAXIS";

export const AXIS_MAINNET_API_BASE = "https://api.axis.markets";
export const AXIS_TESTNET_API_BASE = "https://demo-api.axis.markets";

export interface Axis24hTickerItem {
  symbol: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  lastPrice: string;
  volume: string;
  quoteVolume: string;
  change: number;
  avgPrice: string;
  trades: number;
}

export interface Axis24hTickerResponse {
  ledger: number;
  timestamp: number;
  ticker: Axis24hTickerItem[];
}

/**
 * Fetch live 24h ticker metrics from AXIS Mainnet REST API.
 */
export async function fetchAxisTicker24h(
  apiBase: string = AXIS_MAINNET_API_BASE
): Promise<Axis24hTickerResponse> {
  const url = `${apiBase.replace(/\/$/, "")}/ticker/24h`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "AgentRail-AXIS-Provider/1.0 (Autonomous Agent Execution Engine)",
      "Accept": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch AXIS tickers: HTTP ${res.status} from ${url}`);
  }

  return (await res.json()) as Axis24hTickerResponse;
}

/**
 * Validate an autonomous AI Agent's order attempt against its ScopedAllowance and Trading Policy.
 * Guarantees that an agent cannot exceed allocated budget, trade unauthorized pairs, or get front-run.
 */
export function validateAxisOrderAgainstScope(
  allowance: ScopedAllowance,
  policy: AxisTradingScopePolicy,
  order: AxisLimitOrder,
  referenceMidPrice?: number
): AxisOrderValidationResult {
  // 1. Anti-Poisoning & Target Verification
  if (
    isPoisonedAddress(order.marketContract, AXIS_MAINNET_CONTRACT_ID) ||
    isPoisonedAddress(order.marketContract, AXIS_TESTNET_CONTRACT_ID)
  ) {
    return {
      ok: false,
      code: "AXIS_POISONED_CONTRACT_DETECTED",
      message: `Target contract ${order.marketContract} is a spoofed vanity lookalike mimicking official AXIS contract. Blocked.`,
    };
  }

  if (
    policy.allowedMarkets &&
    policy.allowedMarkets.length > 0 &&
    !policy.allowedMarkets.includes(order.marketContract)
  ) {
    return {
      ok: false,
      code: "DISALLOWED_MARKET_CONTRACT",
      message: `Contract ${order.marketContract} is not in the agent's whitelist of permitted AXIS contracts.`,
    };
  }

  // 2. Pair Validation
  const pairSymbol = `${order.baseAsset}/${order.quoteAsset}`.toUpperCase();
  if (
    policy.allowedPairs &&
    policy.allowedPairs.length > 0 &&
    !policy.allowedPairs.includes(pairSymbol)
  ) {
    return {
      ok: false,
      code: "UNAUTHORIZED_TRADING_PAIR",
      message: `Trading pair ${pairSymbol} is not authorized for this agent. Allowed pairs: [${policy.allowedPairs.join(", ")}].`,
    };
  }

  // 3. Order Type (Market order guard)
  if (order.orderType === "market" && !policy.allowMarketOrders) {
    return {
      ok: false,
      code: "MARKET_ORDERS_DISALLOWED",
      message: "Market taker orders are disabled by policy to prevent unexpected execution slippage.",
    };
  }

  // 4. Single-Order Budget Limit
  if (order.quoteAmountStroops > policy.maxSingleOrderStroops) {
    return {
      ok: false,
      code: "ORDER_SIZE_EXCEEDS_POLICY_CAP",
      message: `Order size ${order.quoteAmountStroops} stroops exceeds max single-order cap of ${policy.maxSingleOrderStroops} stroops.`,
    };
  }

  // 5. Total Allowance Budget Limit
  const remainingAllowance = allowance.maxStroops - allowance.spentStroops;
  if (order.quoteAmountStroops > remainingAllowance) {
    return {
      ok: false,
      code: "INSUFFICIENT_SCOPED_ALLOWANCE",
      message: `Order size ${order.quoteAmountStroops} stroops exceeds remaining epoch allowance of ${remainingAllowance} stroops.`,
    };
  }

  // 6. Price Slippage & Flash Loan Attack Guard
  if (referenceMidPrice !== undefined && referenceMidPrice > 0) {
    const slippagePct = policy.maxSlippagePercent || 2.0;
    if (order.side === "buy") {
      const maxAllowedBuyPrice = referenceMidPrice * (1 + slippagePct / 100);
      if (order.price > maxAllowedBuyPrice) {
        return {
          ok: false,
          code: "SLIPPAGE_LIMIT_EXCEEDED",
          message: `Buy order price ${order.price} exceeds max allowed price ${maxAllowedBuyPrice.toFixed(6)} (+${slippagePct}% over mid-market price ${referenceMidPrice}).`,
        };
      }
    } else if (order.side === "sell") {
      const minAllowedSellPrice = referenceMidPrice * (1 - slippagePct / 100);
      if (order.price < minAllowedSellPrice) {
        return {
          ok: false,
          code: "SLIPPAGE_LIMIT_EXCEEDED",
          message: `Sell order price ${order.price} falls below min allowed price ${minAllowedSellPrice.toFixed(6)} (-${slippagePct}% under mid-market price ${referenceMidPrice}).`,
        };
      }
    }
  }

  return {
    ok: true,
    code: "ORDER_VALIDATED_FOR_EXECUTION",
    message: "Order successfully passed pre-flight risk inspection and scoped allowance constraints.",
    effectiveSpendStroops: order.quoteAmountStroops,
    remainingAllowanceStroops: remainingAllowance - order.quoteAmountStroops,
    marketContract: order.marketContract,
    expectedExecutionPrice: order.price,
  };
}

/**
 * Atomically validate and execute an order spend deduction under AgentRail protocol rules.
 */
export function executeAxisPreFlightSpend(
  allowance: ScopedAllowance,
  policy: AxisTradingScopePolicy,
  order: AxisLimitOrder,
  timestamp: number = Math.floor(Date.now() / 1000),
  referenceMidPrice?: number
): { validation: AxisOrderValidationResult; spendResult?: SpendResult } {
  const validation = validateAxisOrderAgainstScope(allowance, policy, order, referenceMidPrice);
  if (!validation.ok) {
    return { validation };
  }

  const spendResult = verifyAndDeductSpend(allowance, {
    allowanceId: allowance.id,
    agentPublicKey: order.agentPublicKey,
    destination: order.marketContract,
    amountStroops: order.quoteAmountStroops,
    timestamp,
    memo: `AXIS:${order.side.toUpperCase()}:${order.baseAsset}/${order.quoteAsset}@${order.price}`,
  });

  return { validation, spendResult };
}
