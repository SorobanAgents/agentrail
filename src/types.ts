/**
 * Core type definitions for AgentRail Protocol.
 */

export interface ScopedAllowance {
  /** Unique allowance identifier. */
  id: string;
  /** Human or organization master account public key (G...). */
  ownerPublicKey: string;
  /** Autonomous AI Agent session public key (G...). */
  agentPublicKey: string;
  /** Maximum allowance amount in stroops (1 USDC = 10^7 stroops). */
  maxStroops: bigint;
  /** Currently spent stroops in the active epoch. */
  spentStroops: bigint;
  /** Unix timestamp in seconds when the allowance window opens. */
  validFrom: number;
  /** Unix timestamp in seconds when the allowance window expires. */
  validUntil: number;
  /** Array of approved destination public keys or contract IDs. */
  allowedDestinations?: string[];
  /** Whether the allowance is currently active or paused. */
  active: boolean;
  /** Protocol fee basis points (e.g. 20 bps = 0.20%). Defaults to 20 if omitted. */
  protocolFeeBps?: number;
  /** Protocol treasury wallet address that collects transaction fees. */
  treasuryPublicKey?: string;
}

export interface SpendRequest {
  allowanceId: string;
  agentPublicKey: string;
  destination: string;
  amountStroops: bigint;
  timestamp: number;
  memo?: string;
}

export interface SpendResult {
  ok: boolean;
  code: string;
  message: string;
  remainingStroops?: bigint;
  spentStroops?: bigint;
  /** Protocol monetization fee in stroops routed to treasury. */
  feeStroops?: bigint;
  /** Net amount in stroops routed to recipient. */
  netStroops?: bigint;
  /** Treasury address where fee was routed. */
  treasuryPublicKey?: string;
}

export interface EscrowTask {
  taskId: string;
  payerPublicKey: string;
  agentWorkerPublicKey: string;
  rewardStroops: bigint;
  taskCommitmentHash: string;
  expiresAt: number;
  status: "pending" | "fulfilled" | "refunded" | "disputed";
}

export interface ProofOfTaskSubmission {
  taskId: string;
  agentWorkerPublicKey: string;
  outputPayload: string;
  nonce: string;
}

export interface SorobanTtlStatus {
  contractId: string;
  currentLedger: number;
  liveUntilLedger: number;
  remainingLedgers: number;
  thresholdLedgers: number;
  needsBump: boolean;
  recommendedExtendLedgers: number;
}

// ==========================================
// AXIS CLOB DEX & Autonomous Trading Types
// ==========================================

export type AxisOrderSide = "buy" | "sell";
export type AxisOrderType = "limit" | "market";

export interface AxisMarketInfo {
  contract: string;
  symbol: string;
  volume: string;
  quoteVolume: string;
}

export interface AxisLimitOrder {
  orderId: string;
  agentPublicKey: string;
  marketContract: string; // AXIS market contract ID (e.g. CDEXKHTLZ...)
  baseAsset: string;
  quoteAsset: string;
  side: AxisOrderSide;
  orderType: AxisOrderType;
  price: number;
  amount: number;
  quoteAmountStroops: bigint;
  expiresAt: number;
  clientNonce: string;
}

export interface AxisTradingScopePolicy {
  allowedMarkets: string[]; // List of permitted AXIS contract addresses
  allowedPairs: string[]; // e.g. ["XLM/USDC", "USDC/EURC"]
  maxSingleOrderStroops: bigint; // Max stroops per single order
  maxSlippagePercent: number; // Max allowed deviation from reference oracle price (e.g. 2.0%)
  allowMarketOrders: boolean; // Whether market taker orders are permitted
}

export interface AxisOrderValidationResult {
  ok: boolean;
  code: string;
  message: string;
  effectiveSpendStroops?: bigint;
  remainingAllowanceStroops?: bigint;
  marketContract?: string;
  expectedExecutionPrice?: number;
}

// ==========================================
// Reflector Oracle Price Feed Types
// ==========================================

export type OracleFeedStatus = "live" | "stale" | "circuit_broken";

export interface ReflectorPriceFeed {
  symbol: string; // e.g. "XLM", "USDC", "BTC", "ETH", "EURC"
  priceUsd: number;
  decimals: number;
  timestamp: number;
  ledgerSeq: number;
  oracleContractId?: string;
  status: OracleFeedStatus;
}

export interface ReflectorAdapterConfig {
  reflectorContractId?: string;
  maxStalenessSeconds?: number;
  maxDeviationPercent?: number;
  fallbackEnabled?: boolean;
}

export interface ReflectorValidationResult {
  ok: boolean;
  code: string;
  message: string;
  referencePriceUsd?: number;
  deviationPercent?: number;
  feedStatus?: OracleFeedStatus;
}

// ==========================================
// SEP-50 Autonomous Agent Verification Badge Types
// ==========================================

export type AgentBadgeType = 
  | "autonomous_agent_verified" 
  | "inference_worker" 
  | "dex_arbitrageur" 
  | "risk_auditor";

export type AgentBadgeTier = "bronze" | "silver" | "gold" | "diamond";

export interface AgentBadgeMetadata {
  badgeId: string;
  agentPublicKey: string;
  agentName: string;
  badgeType: AgentBadgeType;
  tier: AgentBadgeTier;
  reputationScore: number; // 0-100
  issuedAt: number;
  expiresAt: number;
  taskCommitmentHash?: string;
  ipfsAuditCid?: string;
  revoked: boolean;
  revocationReason?: string;
  issuerPublicKey: string;
  sep50Standard: "SEP-0050-v1";
}

export interface IssueBadgeRequest {
  agentPublicKey: string;
  agentName: string;
  badgeType: AgentBadgeType;
  completedTasksCount: number;
  auditScore: number;
  latestTaskCommitmentHash?: string;
  ipfsAuditCid?: string;
  validityDays?: number;
}

export interface BadgeVerificationResult {
  valid: boolean;
  code: string;
  message: string;
  badge?: AgentBadgeMetadata;
}

export interface XoxnoListingMetadata {
  id: string;
  name: string;
  description: string;
  image: string;
  external_url: string;
  attributes: Array<{
    trait_type: string;
    value: string | number;
  }>;
  seller_fee_basis_points: number;
  fee_recipient: string;
}


