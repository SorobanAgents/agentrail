import { describe, it, expect, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { executeOnChainPipelineSpend } from "../src/cli/pipeline.js";

describe("executeOnChainPipelineSpend", () => {
  it("calculates 20 bps protocol fee split, submits transaction and anchors receipt", async () => {
    const agent = Keypair.random();
    const destination = Keypair.random();
    const treasury = Keypair.random();

    const mockLoadAccount = vi.fn().mockResolvedValue({
      accountId: () => agent.publicKey(),
      sequenceNumber: () => "100",
      incrementSequenceNumber: () => {},
    });

    const mockSubmitTransaction = vi.fn().mockResolvedValue({
      hash: "a".repeat(64),
      ledger: 123456,
    });

    const mockHorizonServer: any = {
      loadAccount: mockLoadAccount,
      submitTransaction: mockSubmitTransaction,
    };

    const mockAuditProvider = {
      anchor: vi.fn().mockResolvedValue({
        cid: "QmTestCID123456789",
        contentSha256: "b".repeat(64),
        gatewayUrl: "https://gateway.pinata.cloud/ipfs/QmTestCID123456789",
        anchoredAt: "2026-11-19T00:00:00Z",
      }),
    };

    // Gross amount = 10,000,000 stroops (1.0 XLM)
    // 20 bps = 20,000 stroops (0.002 XLM)
    // Net = 9,980,000 stroops (0.998 XLM)
    const result = await executeOnChainPipelineSpend({
      agentKeypair: agent,
      destinationAddress: destination.publicKey(),
      treasuryAddress: treasury.publicKey(),
      amountStroops: 10000000n,
      feeBps: 20,
      horizonServer: mockHorizonServer,
      auditProvider: mockAuditProvider as any,
    });

    expect(result.ok).toBe(true);
    expect(result.txHash).toBe("a".repeat(64));
    expect(result.grossStroops).toBe(10000000n);
    expect(result.feeStroops).toBe(20000n);
    expect(result.netStroops).toBe(9980000n);
    expect(mockSubmitTransaction).toHaveBeenCalledTimes(1);
    expect(mockAuditProvider.anchor).toHaveBeenCalledTimes(1);

    const anchorCall = mockAuditProvider.anchor.mock.calls[0][0];
    expect(anchorCall.tag).toBe("agentrail-pipeline-spend");
    expect(anchorCall.txHash).toBe("a".repeat(64));
    expect(anchorCall.network).toBe("testnet");
    expect(anchorCall.agent).toBeDefined();
    expect(anchorCall.agent?.key).toBe(agent.publicKey());
    expect(typeof anchorCall.agent?.signature).toBe("string");
  });

  it("handles Horizon submission errors safely and returns ok: false", async () => {
    const agent = Keypair.random();
    const destination = Keypair.random();

    const mockHorizonServer: any = {
      loadAccount: vi.fn().mockRejectedValue(new Error("Horizon node timeout")),
      submitTransaction: vi.fn(),
    };

    const result = await executeOnChainPipelineSpend({
      agentKeypair: agent,
      destinationAddress: destination.publicKey(),
      amountStroops: 5000000n,
      horizonServer: mockHorizonServer,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Horizon node timeout");
    expect(result.txHash).toBeUndefined();
  });

  it("skips receipt anchoring when anchorReceiptFlag is false", async () => {
    const agent = Keypair.random();
    const destination = Keypair.random();

    const mockHorizonServer: any = {
      loadAccount: vi.fn().mockResolvedValue({
        accountId: () => agent.publicKey(),
        sequenceNumber: () => "100",
        incrementSequenceNumber: () => {},
      }),
      submitTransaction: vi.fn().mockResolvedValue({
        hash: "c".repeat(64),
      }),
    };

    const mockAuditProvider = {
      anchor: vi.fn(),
    };

    const result = await executeOnChainPipelineSpend({
      agentKeypair: agent,
      destinationAddress: destination.publicKey(),
      amountStroops: 10000000n,
      anchorReceiptFlag: false,
      horizonServer: mockHorizonServer,
      auditProvider: mockAuditProvider as any,
    });

    expect(result.ok).toBe(true);
    expect(result.txHash).toBe("c".repeat(64));
    expect(mockAuditProvider.anchor).not.toHaveBeenCalled();
    expect(result.anchorOutcome).toBeUndefined();
  });
});
