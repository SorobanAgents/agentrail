import { createHash } from "node:crypto";
import { EscrowTask, ProofOfTaskSubmission } from "../types.js";

/**
 * Compute the canonical SHA-256 commitment hash for a task output and nonce.
 */
export function computeTaskCommitment(outputPayload: string, nonce: string): string {
  return createHash("sha256")
    .update(`${outputPayload}:${nonce}`, "utf8")
    .digest("hex");
}

/**
 * Verify an autonomous AI agent's submitted proof against the on-chain task escrow.
 */
export function verifyTaskProof(
  task: EscrowTask,
  submission: ProofOfTaskSubmission,
  currentTimestamp: number
): { ok: boolean; reason?: string } {
  if (task.status !== "pending") {
    return { ok: false, reason: `Task is not pending (status: ${task.status})` };
  }

  if (submission.agentWorkerPublicKey !== task.agentWorkerPublicKey) {
    return { ok: false, reason: "Proof submitter does not match designated worker key" };
  }

  if (currentTimestamp > task.expiresAt) {
    return { ok: false, reason: "Task escrow deadline has expired; refund available" };
  }

  const computedHash = computeTaskCommitment(submission.outputPayload, submission.nonce);
  if (computedHash !== task.taskCommitmentHash) {
    return { ok: false, reason: "Cryptographic commitment hash mismatch" };
  }

  return { ok: true };
}
