import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import {
  signSpendRequest,
  validateThresholdPolicy,
  verifyThresholdSignatures,
  ThresholdPolicy,
} from "../src/lib/threshold-signature.js";
import { AgentRailClient } from "../src/sdk/agent-client.js";
import { ScopedAllowance, SpendRequest } from "../src/types.js";

describe("Cryptographic Multi-Party Threshold Signature Verification (#10)", () => {
  const now = Math.floor(Date.now() / 1000);
  const signer1 = Keypair.random();
  const signer2 = Keypair.random();
  const signer3 = Keypair.random();
  const rogueSigner = Keypair.random();

  const policy: ThresholdPolicy = {
    threshold: 2,
    authorizedSigners: [
      signer1.publicKey(),
      signer2.publicKey(),
      signer3.publicKey(),
    ],
    highValueCeilingStroops: 10_000_000n, // 1 USDC ceiling
  };

  const baseRequest: SpendRequest = {
    allowanceId: "swarm-treasury-001",
    agentPublicKey: signer1.publicKey(),
    destination: Keypair.random().publicKey(),
    amountStroops: 25_000_000n, // 2.5 USDC (exceeds 1 USDC ceiling)
    timestamp: now,
    memo: "gpu-cluster-settlement",
  };

  it("authorizes high-value spend with valid 2-of-3 Ed25519 co-signatures", () => {
    const att1 = signSpendRequest(baseRequest, signer1);
    const att2 = signSpendRequest(baseRequest, signer2, "base64");

    const res = verifyThresholdSignatures(baseRequest, policy, [att1, att2]);
    expect(res.ok).toBe(true);
    expect(res.code).toBe("THRESHOLD_SATISFIED");
    expect(res.validSigners).toEqual([signer1.publicKey(), signer2.publicKey()]);
  });

  it("rejects sub-threshold signature sets (1-of-3 when 2-of-3 required)", () => {
    const att1 = signSpendRequest(baseRequest, signer1);
    const res = verifyThresholdSignatures(baseRequest, policy, [att1]);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("INSUFFICIENT_SIGNATURES");
  });

  it("rejects duplicate signatures from the same public key", () => {
    const att1 = signSpendRequest(baseRequest, signer1);
    const res = verifyThresholdSignatures(baseRequest, policy, [att1, att1]);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("DUPLICATE_SIGNER");
  });

  it("rejects rogue / unauthorized signer keys not in the swarm roster", () => {
    const att1 = signSpendRequest(baseRequest, signer1);
    const rogueAtt = signSpendRequest(baseRequest, rogueSigner);
    const res = verifyThresholdSignatures(baseRequest, policy, [att1, rogueAtt]);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("UNAUTHORIZED_SIGNER");
  });

  it("rejects forged or tampered payload signatures", () => {
    const att1 = signSpendRequest(baseRequest, signer1);
    const tamperedRequest: SpendRequest = {
      ...baseRequest,
      amountStroops: 99_000_000n,
    };
    const att2OnWrongPayload = signSpendRequest(tamperedRequest, signer2);

    const res = verifyThresholdSignatures(baseRequest, policy, [
      att1,
      att2OnWrongPayload,
    ]);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("INVALID_SIGNATURE");
  });

  it("enforces threshold math invariants (1 <= M <= N and unique roster)", () => {
    expect(
      validateThresholdPolicy({
        threshold: 4,
        authorizedSigners: [signer1.publicKey(), signer2.publicKey()],
        highValueCeilingStroops: 1000n,
      }).ok
    ).toBe(false);

    expect(
      validateThresholdPolicy({
        threshold: 2,
        authorizedSigners: [signer1.publicKey(), signer1.publicKey()],
        highValueCeilingStroops: 1000n,
      }).ok
    ).toBe(false);
  });

  it("integrates with AgentRailClient spend pipeline for low-value and high-value spends", () => {
    const client = new AgentRailClient();
    const allowance: ScopedAllowance = {
      id: baseRequest.allowanceId,
      ownerPublicKey: Keypair.random().publicKey(),
      agentPublicKey: baseRequest.agentPublicKey,
      maxStroops: 100_000_000n,
      spentStroops: 0n,
      validFrom: now - 60,
      validUntil: now + 3600,
      active: true,
    };

    client.registerAllowance(allowance);
    client.registerThresholdPolicy(allowance.id, policy);

    // 1. Spend below ceiling (0.5 USDC <= 1 USDC) succeeds without co-signatures
    const lowSpend = client.spend({
      ...baseRequest,
      amountStroops: 5_000_000n,
    });
    expect(lowSpend.ok).toBe(true);

    // 2. High-value spend above ceiling without co-signatures is blocked
    const blockedHighSpend = client.spend(baseRequest, []);
    expect(blockedHighSpend.ok).toBe(false);
    expect(blockedHighSpend.code).toBe("INSUFFICIENT_SIGNATURES");

    // 3. High-value spend with 2-of-3 co-signatures succeeds and deducts balance
    const authorizedHighSpend = client.spend(baseRequest, [
      signSpendRequest(baseRequest, signer1),
      signSpendRequest(baseRequest, signer3),
    ]);
    expect(authorizedHighSpend.ok).toBe(true);
    expect(authorizedHighSpend.spentStroops).toBe(30_000_000n);
  });
});
