/**
 * AgentRail - Conditional Escrow & Proof-of-Task Protocol
 * 
 * Directly resolves the #1 open problem in x402 AI payments:
 * "Decentralized delivery verification & refund protection"
 * 
 * Prevents "pay-for-garbage" failure modes:
 * 1. Client locks funds in conditional escrow with expected task commitment.
 * 2. Worker executes task and submits output payload + nonce.
 * 3. Funds are released ONLY if cryptographic commitment matches.
 * 4. Automatic 100% refund is unlocked if worker fails or deadline expires.
 */

import type { EscrowTask, ProofOfTaskSubmission } from "../types.js";
import { computeTaskCommitment, verifyTaskProof } from "./proof-of-task.js";
export { computeTaskCommitment, verifyTaskProof };
export type { EscrowTask, ProofOfTaskSubmission };
import { buildSpendReceipt, hashReceipt } from "./receipts.js";
import { createHash } from "node:crypto";

export interface EscrowSettlementResult {
  ok: boolean;
  code: "FULFILLED" | "INVALID_PROOF" | "EXPIRED" | "REFUNDED" | "ALREADY_SETTLED";
  receiptHash?: string;
  refundStroops?: bigint;
  message: string;
}

export class ConditionalEscrowManager {
  private escrows: Map<string, EscrowTask> = new Map();
  private receipts: Map<string, string> = new Map();

  constructor(
    public readonly tokenContractId = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75"
  ) {}

  /**
   * Create a new conditional escrow for an autonomous AI task.
   */
  public createEscrow(
    taskId: string,
    payerPublicKey: string,
    agentWorkerPublicKey: string,
    rewardStroops: bigint,
    expectedOutputPayload: string,
    expectedNonce: string,
    ttlSeconds = 3600 // 1 hour default SLA
  ): EscrowTask {
    const taskCommitmentHash = computeTaskCommitment(expectedOutputPayload, expectedNonce);
    const now = Math.floor(Date.now() / 1000);

    const task: EscrowTask = {
      taskId,
      payerPublicKey,
      agentWorkerPublicKey,
      rewardStroops,
      taskCommitmentHash,
      expiresAt: now + ttlSeconds,
      status: "pending",
    };

    this.escrows.set(taskId, task);
    return task;
  }

  /**
   * Worker submits proof of task. If cryptographic commitment matches, payment is released.
   */
  public fulfillTask(
    submission: ProofOfTaskSubmission,
    onChainTxHash: string,
    currentTimestamp = Math.floor(Date.now() / 1000)
  ): EscrowSettlementResult {
    const task = this.escrows.get(submission.taskId);
    if (!task) {
      return { ok: false, code: "ALREADY_SETTLED", message: `Task '${submission.taskId}' not found` };
    }

    const verification = verifyTaskProof(task, submission, currentTimestamp);
    if (!verification.ok) {
      return {
        ok: false,
        code: "INVALID_PROOF",
        message: verification.reason || "Proof verification failed",
      };
    }

    // Mark fulfilled
    task.status = "fulfilled";

    // Generate cryptographic receipt
    const receipt = buildSpendReceipt(
      {
        allowanceId: `escrow-${task.taskId}`,
        agentPublicKey: task.payerPublicKey,
        destination: task.agentWorkerPublicKey,
        amountStroops: task.rewardStroops,
        timestamp: currentTimestamp,
      },
      {
        ok: true,
        code: "PROOF_OF_TASK_FULFILLED",
        message: `Task ${task.taskId} verified & settled conditionally`,
        spentStroops: task.rewardStroops,
        feeStroops: 100n,
        netStroops: task.rewardStroops,
        remainingStroops: 0n,
      },
      {
        contractId: this.tokenContractId,
        txHash: onChainTxHash,
      }
    );

    const receiptHash = hashReceipt(receipt);
    this.receipts.set(task.taskId, receiptHash);

    return {
      ok: true,
      code: "FULFILLED",
      receiptHash,
      message: "Proof verified successfully. Escrow funds released to worker.",
    };
  }

  /**
   * Payer claims 100% refund if task deadline expired without verified proof.
   */
  public claimRefund(
    taskId: string,
    currentTimestamp = Math.floor(Date.now() / 1000)
  ): EscrowSettlementResult {
    const task = this.escrows.get(taskId);
    if (!task) {
      return { ok: false, code: "ALREADY_SETTLED", message: `Task '${taskId}' not found` };
    }

    if (task.status !== "pending") {
      return {
        ok: false,
        code: "ALREADY_SETTLED",
        message: `Task is already ${task.status}`,
      };
    }

    if (currentTimestamp <= task.expiresAt) {
      return {
        ok: false,
        code: "INVALID_PROOF",
        message: "Escrow deadline has not yet expired. Worker still has active SLA window.",
      };
    }

    task.status = "refunded";
    return {
      ok: true,
      code: "REFUNDED",
      refundStroops: task.rewardStroops,
      message: `Task expired without valid proof. ${task.rewardStroops} Stroops refunded to payer.`,
    };
  }

  public getTask(taskId: string): EscrowTask | null {
    return this.escrows.get(taskId) || null;
  }
}
