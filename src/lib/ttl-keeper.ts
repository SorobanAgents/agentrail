import { SorobanTtlStatus } from "../types.js";

/** Default ledger threshold (approx 1 day at ~5 sec/ledger = 17,280 ledgers). */
export const DEFAULT_TTL_THRESHOLD_LEDGERS = 17_280;

/** Default ledger extension size (approx 30 days = 518,400 ledgers). */
export const DEFAULT_EXTEND_TO_LEDGERS = 518_400;

/**
 * Evaluate the Soroban contract state Time-To-Live (TTL) and determine
 * if an automated `extend_ttl` transaction is required to prevent state archival.
 */
export function evaluateContractTtl(
  contractId: string,
  currentLedger: number,
  liveUntilLedger: number,
  thresholdLedgers: number = DEFAULT_TTL_THRESHOLD_LEDGERS,
  extendToLedgers: number = DEFAULT_EXTEND_TO_LEDGERS
): SorobanTtlStatus {
  if (liveUntilLedger < currentLedger) {
    return {
      contractId,
      currentLedger,
      liveUntilLedger,
      remainingLedgers: 0,
      thresholdLedgers,
      needsBump: true,
      recommendedExtendLedgers: extendToLedgers,
    };
  }

  const remaining = liveUntilLedger - currentLedger;
  const needsBump = remaining <= thresholdLedgers;

  return {
    contractId,
    currentLedger,
    liveUntilLedger,
    remainingLedgers: remaining,
    thresholdLedgers,
    needsBump,
    recommendedExtendLedgers: needsBump ? extendToLedgers - remaining : 0,
  };
}
