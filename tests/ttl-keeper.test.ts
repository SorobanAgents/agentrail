import { describe, it, expect } from "vitest";
import { evaluateContractTtl, DEFAULT_TTL_THRESHOLD_LEDGERS, DEFAULT_EXTEND_TO_LEDGERS } from "../src/lib/ttl-keeper.js";

describe("Soroban State TTL Keeper Module", () => {
  const contractId = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

  it("reports no bump needed when remaining ledgers comfortably exceed threshold", () => {
    const current = 100_000;
    const liveUntil = 200_000; // 100,000 ledgers remaining > 17,280 threshold
    const status = evaluateContractTtl(contractId, current, liveUntil);

    expect(status.needsBump).toBe(false);
    expect(status.remainingLedgers).toBe(100_000);
    expect(status.recommendedExtendLedgers).toBe(0);
  });

  it("flags needsBump when remaining ledgers drop below threshold", () => {
    const current = 100_000;
    const liveUntil = 110_000; // 10,000 ledgers remaining <= 17,280 threshold
    const status = evaluateContractTtl(contractId, current, liveUntil);

    expect(status.needsBump).toBe(true);
    expect(status.remainingLedgers).toBe(10_000);
    expect(status.recommendedExtendLedgers).toBe(DEFAULT_EXTEND_TO_LEDGERS - 10_000);
  });

  it("handles expired ledger state by demanding immediate full extension", () => {
    const current = 100_000;
    const liveUntil = 95_000; // already expired
    const status = evaluateContractTtl(contractId, current, liveUntil);

    expect(status.needsBump).toBe(true);
    expect(status.remainingLedgers).toBe(0);
    expect(status.recommendedExtendLedgers).toBe(DEFAULT_EXTEND_TO_LEDGERS);
  });
});
