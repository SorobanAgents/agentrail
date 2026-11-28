/**
 * AgentRail - Turnkey HTTP 402 Paywall & AI Settlement Gateway
 * 
 * Implements standard x402 payment-required challenge & verification middleware
 * for autonomous AI agent micropayments. Enables any developer to monetize an API
 * or dataset with Circle USDC on Stellar without human checkout flows.
 */

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { buildSpendReceipt, hashReceipt } from "./receipts.js";

export const MAX_FUTURE_TIMESTAMP_SKEW_SECONDS = 60;

export const PaymentChallengeSchema = z.object({
  status: z.literal(402),
  network: z.enum(["stellar:pubnet", "stellar:testnet"]),
  destination: z.string().regex(/^G[A-Z2-7]{55}$/),
  amountStroops: z.string(),
  asset: z.string().default("USDC"),
  issuer: z.string().optional(),
  nonce: z.string(),
  expiresAt: z.number().int(),
  details: z.string(),
});

export const PaymentAuthorizationHeaderSchema = z.object({
  txHash: z.string().regex(/^[0-9a-fA-F]{64}$/),
  payerPublicKey: z.string().regex(/^G[A-Z2-7]{55}$/),
  destination: z.string().regex(/^G[A-Z2-7]{55}$/).optional(),
  amountStroops: z.string().regex(/^\d+$/),
  nonce: z.string().min(1),
  timestamp: z.number().int().positive(),
  signature: z.string().optional(),
});

export type PaymentChallenge = z.infer<typeof PaymentChallengeSchema>;
export type PaymentAuthorizationHeader = z.infer<typeof PaymentAuthorizationHeaderSchema>;

export interface GatewayVerificationResult {
  ok: boolean;
  code: "AUTHORIZED" | "PAYMENT_REQUIRED" | "INVALID_NONCE" | "EXPIRED_CHALLENGE" | "UNDERPAID";
  receiptHash?: string;
  error?: string;
}

export class X402Gateway {
  private activeChallenges: Map<string, PaymentChallenge> = new Map();
  private processedTransactions: Set<string> = new Set();
  public readonly tokenContractId: string;

  constructor(
    private readonly destinationWallet: string,
    private readonly defaultPriceStroops: bigint,
    private readonly network: "stellar:pubnet" | "stellar:testnet" = "stellar:pubnet",
    tokenContractId = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75"
  ) {
    this.tokenContractId = tokenContractId;
  }

  /**
   * Generate an HTTP 402 Payment Challenge for an incoming agent request.
   */
  public createChallenge(
    details = "AgentRail x402 Micropayment Required",
    customStroops?: bigint,
    ttlSeconds = 300 // 5 minutes validity
  ): PaymentChallenge {
    const nonce = randomBytes(16).toString("hex");

    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const challenge: PaymentChallenge = {
      status: 402,
      network: this.network,
      destination: this.destinationWallet,
      amountStroops: (customStroops || this.defaultPriceStroops).toString(),
      asset: "USDC",
      issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      nonce,
      expiresAt,
      details,
    };

    PaymentChallengeSchema.parse(challenge);
    this.activeChallenges.set(nonce, challenge);
    return challenge;
  }

  /**
   * Verify an incoming agent payment proof against an issued challenge.
   */
  public verifyPayment(
    authPayload: PaymentAuthorizationHeader
  ): GatewayVerificationResult {
    const parsed = PaymentAuthorizationHeaderSchema.safeParse(authPayload);
    if (!parsed.success) {
      return { ok: false, code: "PAYMENT_REQUIRED", error: "Malformed payment authorization header" };
    }

    const { txHash, payerPublicKey, destination, amountStroops, nonce, timestamp } = parsed.data;

    // Check challenge existence & expiry
    const challenge = this.activeChallenges.get(nonce);
    if (!challenge) {
      return { ok: false, code: "INVALID_NONCE", error: "Challenge nonce not found or already consumed" };
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > challenge.expiresAt) {
      this.activeChallenges.delete(nonce);
      return { ok: false, code: "EXPIRED_CHALLENGE", error: "Payment challenge has expired" };
    }

    if (timestamp > now + MAX_FUTURE_TIMESTAMP_SKEW_SECONDS || timestamp > challenge.expiresAt) {
      return {
        ok: false,
        code: "EXPIRED_CHALLENGE",
        error: "Payment authorization timestamp is future-dated or beyond challenge expiry",
      };
    }

    if (destination !== undefined && destination !== challenge.destination) {
      return {
        ok: false,
        code: "PAYMENT_REQUIRED",
        error: "Payment destination does not match challenge recipient",
      };
    }

    // Case-insensitive double-spend & re-org replay check
    const normalizedTxHash = txHash.toLowerCase();
    if (this.processedTransactions.has(normalizedTxHash)) {
      return { ok: false, code: "INVALID_NONCE", error: "Transaction has already been settled" };
    }

    // Amount sufficiency check
    if (BigInt(amountStroops) < BigInt(challenge.amountStroops)) {
      return { ok: false, code: "UNDERPAID", error: "Transferred amount is less than required challenge cost" };
    }

    // Mark consumed & settled
    this.activeChallenges.delete(nonce);
    this.processedTransactions.add(normalizedTxHash);

    // Build canonical cryptographic receipt
    const receipt = buildSpendReceipt(
      {
        allowanceId: `x402-settlement-${nonce}`,
        agentPublicKey: payerPublicKey,
        destination: this.destinationWallet,
        amountStroops: BigInt(amountStroops),
        timestamp: now,
      },
      {
        ok: true,
        code: "X402_PAYMENT_SETTLED",
        message: "x402 micropayment settled successfully",
        spentStroops: BigInt(amountStroops),
        feeStroops: 100n,
        netStroops: BigInt(amountStroops),
        remainingStroops: 0n,
      },
      {
        contractId: this.tokenContractId,
        txHash: normalizedTxHash,
      }
    );

    const receiptHash = hashReceipt(receipt);

    return {
      ok: true,
      code: "AUTHORIZED",
      receiptHash,
    };
  }
}
