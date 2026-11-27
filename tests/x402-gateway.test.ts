import { describe, it, expect, beforeEach } from "vitest";
import { X402Gateway, PaymentAuthorizationHeader } from "../src/lib/x402-gateway.js";

describe("X402Gateway - Turnkey AI Micropayments", () => {
  let gateway: X402Gateway;
  const merchantWallet = "GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT";
  const defaultCost = 1000000n; // 0.1 USDC

  beforeEach(() => {
    gateway = new X402Gateway(merchantWallet, defaultCost, "stellar:pubnet");
  });

  it("should create a valid HTTP 402 challenge with nonce and TTL", () => {
    const challenge = gateway.createChallenge("Premium Soroban Analytics API");
    expect(challenge.status).toBe(402);
    expect(challenge.network).toBe("stellar:pubnet");
    expect(challenge.destination).toBe(merchantWallet);
    expect(challenge.amountStroops).toBe("1000000");
    expect(challenge.nonce).toHaveLength(32);
    expect(challenge.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("should verify valid payment authorization and issue cryptographic receipt", () => {
    const challenge = gateway.createChallenge("OCR Verification Fee");

    const validPayload: PaymentAuthorizationHeader = {
      txHash: "a".repeat(64),
      payerPublicKey: "GBHM5SCH2R5W5S63HVMQCXOFGCEXPSE2KL4GYRJY7GRTL4MYDB6M2CKY",
      amountStroops: "1000000",
      nonce: challenge.nonce,
      timestamp: Math.floor(Date.now() / 1000),
    };

    const result = gateway.verifyPayment(validPayload);
    expect(result.ok).toBe(true);
    expect(result.code).toBe("AUTHORIZED");
    expect(result.receiptHash).toBeDefined();
    expect(result.receiptHash).toHaveLength(64);
  });

  it("should block double-spending of the same transaction hash or consumed nonce", () => {
    const challenge = gateway.createChallenge("Single Invocation API");
    const payload: PaymentAuthorizationHeader = {
      txHash: "b".repeat(64),
      payerPublicKey: "GBHM5SCH2R5W5S63HVMQCXOFGCEXPSE2KL4GYRJY7GRTL4MYDB6M2CKY",
      amountStroops: "1000000",
      nonce: challenge.nonce,
      timestamp: Math.floor(Date.now() / 1000),
    };

    const firstAttempt = gateway.verifyPayment(payload);
    expect(firstAttempt.ok).toBe(true);

    // Replay attack with same payload
    const replayAttempt = gateway.verifyPayment(payload);
    expect(replayAttempt.ok).toBe(false);
    expect(replayAttempt.code).toBe("INVALID_NONCE");
  });

  it("should reject underpaid authorization payloads", () => {
    const challenge = gateway.createChallenge("Expensive Inference Tool", 5000000n);
    const underpaidPayload: PaymentAuthorizationHeader = {
      txHash: "c".repeat(64),
      payerPublicKey: "GBHM5SCH2R5W5S63HVMQCXOFGCEXPSE2KL4GYRJY7GRTL4MYDB6M2CKY",
      amountStroops: "1000000", // Only paying 1M instead of 5M
      nonce: challenge.nonce,
      timestamp: Math.floor(Date.now() / 1000),
    };

    const result = gateway.verifyPayment(underpaidPayload);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("UNDERPAID");
  });
});
