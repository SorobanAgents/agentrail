import { describe, it, expect } from "vitest";
import { AnomalyCircuitBreaker } from "../src/lib/circuit-breaker.js";
import { ScopedAllowance, SpendRequest } from "../src/types.js";

function makeAllowance(overrides: Partial<ScopedAllowance> = {}): ScopedAllowance {
  return {
    id: "cb-allowance-01",
    ownerPublicKey: "GOWNER11111111111111111111111111111111111111111111111111",
    agentPublicKey: "GAGENT22222222222222222222222222222222222222222222222222",
    maxStroops: 100_000_000n,
    spentStroops: 0n,
    validFrom: 1000,
    validUntil: 999999,
    active: true,
    ...overrides,
  };
}

function makeRequest(
  allowance: ScopedAllowance,
  timestamp: number,
  amountStroops: bigint = 1_000_000n
): SpendRequest {
  return {
    allowanceId: allowance.id,
    agentPublicKey: allowance.agentPublicKey,
    destination: "GDEST333333333333333333333333333333333333333333333333333",
    amountStroops,
    timestamp,
  };
}

describe("Anomaly Spending Detection & Circuit Breaker Module (#7)", () => {
  it("tracks moving-window transaction counts and trips when frequency threshold is exceeded", () => {
    const breaker = new AnomalyCircuitBreaker({
      windowSeconds: 60,
      maxTransactionsInWindow: 3,
    });
    const allowance = makeAllowance();

    expect(breaker.evaluateAndRecord(allowance, makeRequest(allowance, 2000)).allowed).toBe(true);
    expect(breaker.evaluateAndRecord(allowance, makeRequest(allowance, 2015)).allowed).toBe(true);
    const third = breaker.evaluateAndRecord(allowance, makeRequest(allowance, 2030));
    expect(third.allowed).toBe(true);
    expect(third.status.windowTransactionCount).toBe(3);

    // 4th transaction within the 60s window trips the circuit breaker and pauses allowance
    const fourth = breaker.evaluateAndRecord(allowance, makeRequest(allowance, 2045));
    expect(fourth.allowed).toBe(false);
    expect(fourth.code).toBe("CIRCUIT_TRIPPED_FREQUENCY");
    expect(fourth.status.state).toBe("OPEN");
    expect(allowance.active).toBe(false);

    // Subsequent attempts while OPEN are rejected immediately
    const fifth = breaker.evaluateAndRecord(allowance, makeRequest(allowance, 2050));
    expect(fifth.allowed).toBe(false);
    expect(fifth.code).toBe("CIRCUIT_OPEN");
  });

  it("slides the moving window cleanly so old transactions expire without tripping", () => {
    const breaker = new AnomalyCircuitBreaker({
      windowSeconds: 60,
      maxTransactionsInWindow: 2,
    });
    const allowance = makeAllowance();

    expect(breaker.evaluateAndRecord(allowance, makeRequest(allowance, 1000)).allowed).toBe(true);
    expect(breaker.evaluateAndRecord(allowance, makeRequest(allowance, 1020)).allowed).toBe(true);

    // At t = 1065, the t = 1000 transaction is outside (1005, 1065], so count is 2 -> allowed
    const afterSlide = breaker.evaluateAndRecord(allowance, makeRequest(allowance, 1065));
    expect(afterSlide.allowed).toBe(true);
    expect(afterSlide.status.windowTransactionCount).toBe(2);
    expect(allowance.active).toBe(true);
  });

  it("detects rapid-succession burst withdrawals and trips immediately", () => {
    const breaker = new AnomalyCircuitBreaker({
      windowSeconds: 60,
      maxTransactionsInWindow: 10,
      minIntervalSeconds: 5,
    });
    const allowance = makeAllowance();

    expect(breaker.evaluateAndRecord(allowance, makeRequest(allowance, 3000)).allowed).toBe(true);

    // Second withdrawal only 2 seconds later (< 5s minIntervalSeconds) trips burst guard
    const burst = breaker.evaluateAndRecord(allowance, makeRequest(allowance, 3002));
    expect(burst.allowed).toBe(false);
    expect(burst.code).toBe("CIRCUIT_TRIPPED_RAPID_BURST");
    expect(allowance.active).toBe(false);
  });

  it("supports manual reset and cooldown auto-recovery from tripped state", () => {
    const breaker = new AnomalyCircuitBreaker({
      windowSeconds: 60,
      maxTransactionsInWindow: 1,
      cooldownSeconds: 120,
    });
    const allowance = makeAllowance();

    expect(breaker.evaluateAndRecord(allowance, makeRequest(allowance, 5000)).allowed).toBe(true);
    const tripped = breaker.evaluateAndRecord(allowance, makeRequest(allowance, 5010));
    expect(tripped.allowed).toBe(false);
    expect(allowance.active).toBe(false);

    // Manual reset restores CLOSED state and reactivates allowance
    const resetStatus = breaker.reset(allowance.id, allowance);
    expect(resetStatus.state).toBe("CLOSED");
    expect(allowance.active).toBe(true);

    // Trip again at t = 6010 and verify cooldown auto-recovery at t = 6135 (>= 120s cooldown)
    expect(breaker.evaluateAndRecord(allowance, makeRequest(allowance, 6000)).allowed).toBe(true);
    expect(breaker.evaluateAndRecord(allowance, makeRequest(allowance, 6010)).allowed).toBe(false);
    expect(allowance.active).toBe(false);

    const recovered = breaker.evaluateAndRecord(allowance, makeRequest(allowance, 6135));
    expect(recovered.allowed).toBe(true);
    expect(recovered.status.state).toBe("CLOSED");
    expect(allowance.active).toBe(true);
  });
});
