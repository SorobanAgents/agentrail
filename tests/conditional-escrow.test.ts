import { describe, it, expect, beforeEach } from "vitest";
import { ConditionalEscrowManager } from "../src/lib/conditional-escrow.js";
import { ProofOfTaskSubmission } from "../src/types.js";

describe("ConditionalEscrowManager - Decentralized Proof-of-Task Settlement", () => {
  let escrow: ConditionalEscrowManager;
  const payer = "GBHM5SCH2R5W5S63HVMQCXOFGCEXPSE2KL4GYRJY7GRTL4MYDB6M2CKY";
  const worker = "GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT";
  const reward = 2500000n; // 0.25 USDC

  beforeEach(() => {
    escrow = new ConditionalEscrowManager();
  });

  it("should create a conditional escrow with expected task commitment", () => {
    const task = escrow.createEscrow(
      "task-edgar-ocr-1",
      payer,
      worker,
      reward,
      "REVENUE_2025_Q3:145000000",
      "nonce-secure-999",
      3600
    );

    expect(task.taskId).toBe("task-edgar-ocr-1");
    expect(task.status).toBe("pending");
    expect(task.rewardStroops).toBe(reward);
    expect(task.taskCommitmentHash).toHaveLength(64);
  });

  it("should fulfill escrow and release funds when output matches commitment", () => {
    const task = escrow.createEscrow(
      "task-math-proof-2",
      payer,
      worker,
      reward,
      "SOLVED_INVARIANT_X402",
      "nonce-42",
      3600
    );

    const validSubmission: ProofOfTaskSubmission = {
      taskId: "task-math-proof-2",
      agentWorkerPublicKey: worker,
      outputPayload: "SOLVED_INVARIANT_X402",
      nonce: "nonce-42",
    };

    const result = escrow.fulfillTask(validSubmission, "e".repeat(64));
    expect(result.ok).toBe(true);
    expect(result.code).toBe("FULFILLED");
    expect(result.receiptHash).toBeDefined();

    const updatedTask = escrow.getTask("task-math-proof-2");
    expect(updatedTask?.status).toBe("fulfilled");
  });

  it("should reject garbage/mismatched output payload and protect client funds", () => {
    const task = escrow.createEscrow(
      "task-translation-3",
      payer,
      worker,
      reward,
      "ACCURATE_TRANSLATION_FR_EN",
      "nonce-77",
      3600
    );

    const garbageSubmission: ProofOfTaskSubmission = {
      taskId: "task-translation-3",
      agentWorkerPublicKey: worker,
      outputPayload: "GARBAGE_HALLUCINATED_TEXT", // Garbage text!
      nonce: "nonce-77",
    };

    const result = escrow.fulfillTask(garbageSubmission, "f".repeat(64));
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_PROOF");
    expect(result.message).toContain("Cryptographic commitment hash mismatch");

    const updatedTask = escrow.getTask("task-translation-3");
    expect(updatedTask?.status).toBe("pending"); // Funds remain protected
  });

  it("should allow client to claim 100% refund when SLA expires without valid delivery", () => {
    const task = escrow.createEscrow(
      "task-timeout-4",
      payer,
      worker,
      reward,
      "EXPECTED_ANALYSIS",
      "nonce-11",
      60 // 60 seconds TTL
    );

    const now = Math.floor(Date.now() / 1000);

    // Try claiming refund before expiry -> should fail
    const prematureRefund = escrow.claimRefund("task-timeout-4", now + 10);
    expect(prematureRefund.ok).toBe(false);
    expect(prematureRefund.code).toBe("INVALID_PROOF");

    // Claim refund after deadline -> should succeed with full reward returned
    const legitimateRefund = escrow.claimRefund("task-timeout-4", now + 120);
    expect(legitimateRefund.ok).toBe(true);
    expect(legitimateRefund.code).toBe("REFUNDED");
    expect(legitimateRefund.refundStroops).toBe(reward);

    const updatedTask = escrow.getTask("task-timeout-4");
    expect(updatedTask?.status).toBe("refunded");
  });
});
