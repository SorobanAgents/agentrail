import { ScopedAllowance, SpendRequest, SpendResult } from "../types.js";
import { verifyAndDeductSpend } from "../lib/scoped-allowance.js";
import { calculateTokenCost, TokenPricingRate, usdcToStroops, stroopsToUsdc } from "../lib/micro-stream.js";
import { evaluateContractTtl } from "../lib/ttl-keeper.js";
import { computeTaskCommitment, verifyTaskProof } from "../lib/proof-of-task.js";

export class AgentRailClient {
  private allowances: Map<string, ScopedAllowance> = new Map();

  /**
   * Register a newly provisioned scoped allowance for an autonomous agent session.
   */
  public registerAllowance(allowance: ScopedAllowance): void {
    this.allowances.set(allowance.id, { ...allowance });
  }

  /**
   * Authorize a micropayment spend from an active agent allowance.
   */
  public spend(request: SpendRequest): SpendResult {
    const allowance = this.allowances.get(request.allowanceId);
    if (!allowance) {
      return {
        ok: false,
        code: "ALLOWANCE_NOT_FOUND",
        message: `Allowance with ID ${request.allowanceId} was not found.`,
      };
    }

    const result = verifyAndDeductSpend(allowance, request);
    return result;
  }

  /**
   * Helper to compute inference micropayment cost in stroops.
   */
  public computeTokenFee(
    promptTokens: number,
    completionTokens: number,
    rates: TokenPricingRate
  ): bigint {
    return calculateTokenCost(promptTokens, completionTokens, rates);
  }

  /**
   * Helper to inspect Soroban contract TTL health.
   */
  public checkContractTtl(
    contractId: string,
    currentLedger: number,
    liveUntilLedger: number
  ) {
    return evaluateContractTtl(contractId, currentLedger, liveUntilLedger);
  }

  /**
   * Helper for proof of task commitment computation.
   */
  public makeProofCommitment(outputPayload: string, nonce: string): string {
    return computeTaskCommitment(outputPayload, nonce);
  }

  public getAllowance(id: string): ScopedAllowance | undefined {
    return this.allowances.get(id);
  }
}
