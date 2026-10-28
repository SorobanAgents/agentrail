import { describe, it, expect } from "vitest";
import { provisionSandbox, inspectBalance, executeSandboxSpend } from "../src/cli/sandbox.js";

describe("AgentRail CLI & Sandbox Provisioner", () => {
  it("should provision a sandbox session with active allowance and proper defaults", () => {
    const env = provisionSandbox("Test-Agent-X", "100.00", 25);
    expect(env.agent.name).toBe("Test-Agent-X");
    expect(env.ownerAddress).toBe("GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT");
    expect(env.treasuryAddress).toBe("GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT");
    expect(env.protocolFeeBps).toBe(25);
    expect(env.allowance.active).toBe(true);
    expect(env.allowance.maxStroops).toBe(1000000000n);
    expect(env.allowance.spentStroops).toBe(0n);
  });

  it("should inspect initial balance accurately", () => {
    const env = provisionSandbox("Test-Agent-Y", "50.00", 20);
    const balance = inspectBalance(env, env.allowance.id);

    expect(balance.allowanceId).toBe(env.allowance.id);
    expect(balance.totalLimitStroops).toBe("500000000");
    expect(balance.spentStroops).toBe("0");
    expect(balance.remainingStroops).toBe("500000000");
    expect(balance.remainingUsdc).toBe("50.0000000");
    expect(balance.active).toBe(true);
    expect(balance.isExpired).toBe(false);
  });

  it("should execute micro-spend, deduct balance, and route protocol fee accurately", () => {
    const env = provisionSandbox("Test-Agent-Z", "10.00", 20); // 20 bps = 0.20%
    const { result, feeStroops, netStroops } = executeSandboxSpend(env, "2.00", "test:inference");

    expect(result.ok).toBe(true);
    expect(result.code).toBe("SPEND_AUTHORIZED");

    // 2 USDC = 20,000,000 stroops
    // 20 bps of 20,000,000 = 40,000 stroops
    // Net = 19,960,000 stroops
    expect(feeStroops).toBe(40000n);
    expect(netStroops).toBe(19960000n);
    expect(result.feeStroops).toBe(40000n);
    expect(result.netStroops).toBe(19960000n);

    // Verify post-spend inspection
    const postBalance = inspectBalance(env, env.allowance.id);
    expect(postBalance.spentStroops).toBe("20000000");
    expect(postBalance.remainingStroops).toBe("80000000");
    expect(postBalance.remainingUsdc).toBe("8.0000000");
  });

  it("should reject spend when exceeding remaining allowance balance", () => {
    const env = provisionSandbox("Test-Agent-Limited", "1.00", 20);
    const { result } = executeSandboxSpend(env, "5.00");

    expect(result.ok).toBe(false);
    expect(result.code).toBe("ALLOWANCE_EXCEEDED");
  });

  it("should identify expired allowance during balance inspection", () => {
    const env = provisionSandbox("Test-Agent-Expiring", "10.00", 20);
    // Inspect with future timestamp past validUntil
    const futureTime = env.allowance.validUntil + 1000;
    const balance = inspectBalance(env, env.allowance.id, futureTime);

    expect(balance.isExpired).toBe(true);
    expect(balance.active).toBe(false);
  });
});
