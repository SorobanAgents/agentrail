import { ScopedAllowance, SpendRequest, SpendResult } from "../types.js";

/**
 * Validate and process an agent spend attempt against a scoped allowance.
 */
export function verifyAndDeductSpend(
  allowance: ScopedAllowance,
  request: SpendRequest
): SpendResult {
  if (!allowance.active) {
    return {
      ok: false,
      code: "ALLOWANCE_PAUSED",
      message: "The specified allowance is currently paused or inactive.",
    };
  }

  if (request.agentPublicKey !== allowance.agentPublicKey) {
    return {
      ok: false,
      code: "UNAUTHORIZED_AGENT",
      message: "Agent public key does not match allowance beneficiary.",
    };
  }

  if (request.timestamp < allowance.validFrom) {
    return {
      ok: false,
      code: "ALLOWANCE_NOT_YET_VALID",
      message: `Allowance window opens at timestamp ${allowance.validFrom}.`,
    };
  }

  if (request.timestamp > allowance.validUntil) {
    return {
      ok: false,
      code: "ALLOWANCE_EXPIRED",
      message: `Allowance window expired at timestamp ${allowance.validUntil}.`,
    };
  }

  if (request.amountStroops <= 0n) {
    return {
      ok: false,
      code: "INVALID_AMOUNT",
      message: "Spend amount must be strictly greater than zero.",
    };
  }

  if (
    allowance.allowedDestinations &&
    allowance.allowedDestinations.length > 0 &&
    !allowance.allowedDestinations.includes(request.destination)
  ) {
    return {
      ok: false,
      code: "UNAPPROVED_DESTINATION",
      message: `Destination ${request.destination} is not in the approved routing list.`,
    };
  }

  const remaining = allowance.maxStroops - allowance.spentStroops;
  if (request.amountStroops > remaining) {
    return {
      ok: false,
      code: "ALLOWANCE_EXCEEDED",
      message: `Requested ${request.amountStroops} stroops exceeds remaining allowance of ${remaining} stroops.`,
      remainingStroops: remaining,
    };
  }

  // Deduct
  allowance.spentStroops += request.amountStroops;
  const newRemaining = allowance.maxStroops - allowance.spentStroops;

  return {
    ok: true,
    code: "SPEND_AUTHORIZED",
    message: "Spend authorized successfully within scoped allowance.",
    remainingStroops: newRemaining,
    spentStroops: allowance.spentStroops,
  };
}

/**
 * Reset spent balance for a recurring epoch if timestamp has rolled over.
 */
export function renewEpochAllowance(
  allowance: ScopedAllowance,
  newValidFrom: number,
  newValidUntil: number
): ScopedAllowance {
  return {
    ...allowance,
    spentStroops: 0n,
    validFrom: newValidFrom,
    validUntil: newValidUntil,
    active: true,
  };
}
