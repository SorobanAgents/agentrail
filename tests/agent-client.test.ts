import { describe, it, expect } from "vitest";
import { AgentRailClient } from "../src/sdk/agent-client.js";
import { ScopedAllowance, SpendRequest } from "../src/types.js";

describe("AgentRailClient Core SDK Wrapper", () => {
  const now = Math.floor(Date.now() / 1000);
  const client = new AgentRailClient();

  const mockAllowance: ScopedAllowance = {
    id: "session-allowance-abc",
    ownerPublicKey: "GOWNER111111111111111111111111111111111111111111111",
    agentPublicKey: "GAGENT222222222222222222222222222222222222222222222",
    maxStroops: 20_000_000n, // 2 USDC
    spentStroops: 0n,
    validFrom: now - 100,
    validUntil: now + 3600,
    active: true,
  };

  it("registers allowance and authorizes spend through client instance", () => {
    client.registerAllowance(mockAllowance);
    expect(client.getAllowance(mockAllowance.id)).toBeDefined();

    const spendReq: SpendRequest = {
      allowanceId: mockAllowance.id,
      agentPublicKey: mockAllowance.agentPublicKey,
      destination: "GDEST333333333333333333333333333333333333333333333",
      amountStroops: 5_000_000n,
      timestamp: now,
    };

    const result = client.spend(spendReq);
    expect(result.ok).toBe(true);
    expect(result.spentStroops).toBe(5_000_000n);
    expect(result.remainingStroops).toBe(15_000_000n);
    expect(result.feeStroops).toBe(10_000n);
    expect(result.netStroops).toBe(4_990_000n);
    expect(result.treasuryPublicKey).toBe("GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT");
  });

  it("handles unknown allowance gracefully", () => {
    const spendReq: SpendRequest = {
      allowanceId: "non-existent-allowance",
      agentPublicKey: "GAGENT222222222222222222222222222222222222222222222",
      destination: "GDEST333333333333333333333333333333333333333333333",
      amountStroops: 1000n,
      timestamp: now,
    };

    const result = client.spend(spendReq);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("ALLOWANCE_NOT_FOUND");
  });

  it("computes token fee through SDK helper", () => {
    const fee = client.computeTokenFee(1000, 500, {
      promptStroopsPer1k: 2000n,
      completionStroopsPer1k: 8000n,
    });
    expect(fee).toBe(6000n);
  });
});
