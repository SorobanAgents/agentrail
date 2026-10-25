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
