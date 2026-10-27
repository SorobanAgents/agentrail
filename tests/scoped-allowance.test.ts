import { describe, it, expect } from "vitest";
import { verifyAndDeductSpend, renewEpochAllowance } from "../src/lib/scoped-allowance.js";
import { ScopedAllowance, SpendRequest } from "../src/types.js";

const now = Math.floor(Date.now() / 1000);

function createMockAllowance(overrides: Partial<ScopedAllowance> = {}): ScopedAllowance {
  return {
    id: "allowance-001",
    ownerPublicKey: "GOWNER1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    agentPublicKey: "GAGENT1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    maxStroops: 10_000_000n, // 1 USDC
    spentStroops: 0n,
    validFrom: now - 3600,
    validUntil: now + 3600,
    allowedDestinations: ["GDEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"],
    active: true,
    ...overrides,
  };
}

describe("Scoped Allowance Module", () => {
  it("authorizes valid spend and deducts from allowance", () => {
    const allowance = createMockAllowance();
    const req: SpendRequest = {
      allowanceId: allowance.id,
      agentPublicKey: allowance.agentPublicKey,
      destination: "GDEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
      amountStroops: 2_000_000n,
      timestamp: now,
    };

    const res = verifyAndDeductSpend(allowance, req);
    expect(res.ok).toBe(true);
    expect(res.code).toBe("SPEND_AUTHORIZED");
    expect(res.spentStroops).toBe(2_000_000n);
    expect(res.remainingStroops).toBe(8_000_000n);
    // 20 bps = 0.20% of 2,000,000 = 4,000 stroops fee
    expect(res.feeStroops).toBe(4_000n);
    expect(res.netStroops).toBe(1_996_000n);
    expect(res.treasuryPublicKey).toBe("GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT");
  });

  it("calculates custom protocol fee bps when specified", () => {
    const allowance = createMockAllowance({
      protocolFeeBps: 50, // 0.50%
      treasuryPublicKey: "GTREASURYCUSTOM11111111111111111111111111111111111111",
    });
    const req: SpendRequest = {
      allowanceId: allowance.id,
      agentPublicKey: allowance.agentPublicKey,
      destination: "GDEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
      amountStroops: 10_000_000n,
      timestamp: now,
    };

    const res = verifyAndDeductSpend(allowance, req);
    expect(res.ok).toBe(true);
    // 50 bps = 0.50% of 10,000,000 = 50,000 stroops
    expect(res.feeStroops).toBe(50_000n);
    expect(res.netStroops).toBe(9_950_000n);
    expect(res.treasuryPublicKey).toBe("GTREASURYCUSTOM11111111111111111111111111111111111111");
  });

  it("rejects spend when allowance is inactive/paused", () => {
    const allowance = createMockAllowance({ active: false });
    const req: SpendRequest = {
      allowanceId: allowance.id,
      agentPublicKey: allowance.agentPublicKey,
      destination: "GDEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
      amountStroops: 1000n,
      timestamp: now,
    };

    const res = verifyAndDeductSpend(allowance, req);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("ALLOWANCE_PAUSED");
  });

  it("rejects unauthorized agent public key", () => {
    const allowance = createMockAllowance();
    const req: SpendRequest = {
      allowanceId: allowance.id,
      agentPublicKey: "GWRONGAGENT99999999999999999999999999999999999999999",
      destination: "GDEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
      amountStroops: 1000n,
      timestamp: now,
    };

    const res = verifyAndDeductSpend(allowance, req);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("UNAUTHORIZED_AGENT");
  });

  it("rejects spend exceeding remaining allowance", () => {
    const allowance = createMockAllowance({ maxStroops: 5_000_000n });
    const req: SpendRequest = {
      allowanceId: allowance.id,
      agentPublicKey: allowance.agentPublicKey,
      destination: "GDEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
      amountStroops: 6_000_000n,
      timestamp: now,
    };

    const res = verifyAndDeductSpend(allowance, req);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("ALLOWANCE_EXCEEDED");
  });

  it("rejects unapproved destination when destinations filter is set", () => {
    const allowance = createMockAllowance({
      allowedDestinations: ["GAPPROVED111111111111111111111111111111111111111111"],
    });
    const req: SpendRequest = {
      allowanceId: allowance.id,
      agentPublicKey: allowance.agentPublicKey,
      destination: "GUNAPPROVED2222222222222222222222222222222222222222",
      amountStroops: 1000n,
      timestamp: now,
    };

    const res = verifyAndDeductSpend(allowance, req);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("UNAPPROVED_DESTINATION");
  });

  it("renews epoch allowance cleanly", () => {
    const allowance = createMockAllowance({ spentStroops: 5_000_000n });
    const renewed = renewEpochAllowance(allowance, now + 10, now + 86400);

    expect(renewed.spentStroops).toBe(0n);
    expect(renewed.validFrom).toBe(now + 10);
    expect(renewed.validUntil).toBe(now + 86400);
  });
});
