import { describe, it, expect } from "vitest";
import { computeTaskCommitment, verifyTaskProof } from "../src/lib/proof-of-task.js";
import { EscrowTask, ProofOfTaskSubmission } from "../src/types.js";

describe("Proof-of-Task Cryptographic Verification", () => {
  const now = Math.floor(Date.now() / 1000);
  const outputPayload = JSON.stringify({ summary: "Scraped 500 leads successfully", count: 500 });
  const nonce = "secure-random-nonce-987654";
  const commitmentHash = computeTaskCommitment(outputPayload, nonce);

  function createMockTask(overrides: Partial<EscrowTask> = {}): EscrowTask {
    return {
      taskId: "task-escrow-42",
      payerPublicKey: "GPAYER1111111111111111111111111111111111111111111111",
      agentWorkerPublicKey: "GWORKER222222222222222222222222222222222222222222222",
      rewardStroops: 50_000_000n, // 5 USDC
      taskCommitmentHash: commitmentHash,
      expiresAt: now + 3600,
      status: "pending",
      ...overrides,
    };
  }

  it("successfully verifies valid task proof matching commitment hash", () => {
    const task = createMockTask();
    const submission: ProofOfTaskSubmission = {
      taskId: task.taskId,
      agentWorkerPublicKey: task.agentWorkerPublicKey,
      outputPayload,
      nonce,
    };

    const verification = verifyTaskProof(task, submission, now);
    expect(verification.ok).toBe(true);
  });

  it("rejects proof with tampered output payload", () => {
    const task = createMockTask();
    const submission: ProofOfTaskSubmission = {
      taskId: task.taskId,
      agentWorkerPublicKey: task.agentWorkerPublicKey,
      outputPayload: "tampered payload data",
      nonce,
    };

    const verification = verifyTaskProof(task, submission, now);
    expect(verification.ok).toBe(false);
    expect(verification.reason).toContain("mismatch");
  });

  it("rejects proof submitted after expiration deadline", () => {
    const task = createMockTask({ expiresAt: now - 100 });
    const submission: ProofOfTaskSubmission = {
      taskId: task.taskId,
      agentWorkerPublicKey: task.agentWorkerPublicKey,
      outputPayload,
      nonce,
    };

    const verification = verifyTaskProof(task, submission, now);
    expect(verification.ok).toBe(false);
    expect(verification.reason).toContain("expired");
  });

  it("rejects proof submitted by unauthorized worker key", () => {
    const task = createMockTask();
    const submission: ProofOfTaskSubmission = {
      taskId: task.taskId,
      agentWorkerPublicKey: "GUNAUTHORIZED3333333333333333333333333333333333333",
      outputPayload,
      nonce,
    };

    const verification = verifyTaskProof(task, submission, now);
    expect(verification.ok).toBe(false);
    expect(verification.reason).toContain("designated worker");
  });
});
