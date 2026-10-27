import { ScopedAllowance, SpendRequest } from "../types.js";

/**
 * Configuration rules for the anomaly spending detection & circuit breaker module.
 */
export interface CircuitBreakerConfig {
  /** Sliding time window duration in seconds (e.g., 60s). */
  windowSeconds: number;
  /** Maximum number of spend transactions permitted within the sliding window before tripping. */
  maxTransactionsInWindow: number;
  /** Optional minimum interval in seconds between consecutive withdrawals to prevent burst draining. */
  minIntervalSeconds?: number;
  /** Optional maximum cumulative stroops allowed within the sliding window. */
  maxVolumeStroopsInWindow?: bigint;
  /** Optional cooldown duration in seconds after which a tripped breaker can auto-recover. */
  cooldownSeconds?: number;
}

/**
 * Snapshot of the circuit breaker's state for an allowance.
 */
export interface CircuitBreakerStatus {
  allowanceId: string;
  state: "CLOSED" | "OPEN";
  trippedAt?: number;
  tripReason?: string;
  windowTransactionCount: number;
  windowVolumeStroops: bigint;
  lastSpendTimestamp?: number;
}

interface RecordedSpendEvent {
  timestamp: number;
  amountStroops: bigint;
}

interface AllowanceBreakerEntry {
  state: "CLOSED" | "OPEN";
  trippedAt?: number;
  tripReason?: string;
  events: RecordedSpendEvent[];
}

/**
 * Anomaly Spending Detection & Circuit Breaker Engine.
 * Tracks moving-window transaction frequency, burst intervals, and cumulative volume
 * per allowance and automatically pauses allowances when anomalous behavior is detected.
 */
export class AnomalyCircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private readonly records: Map<string, AllowanceBreakerEntry> = new Map();

  constructor(config: CircuitBreakerConfig) {
    if (config.windowSeconds <= 0) {
      throw new Error("windowSeconds must be strictly greater than zero.");
    }
    if (config.maxTransactionsInWindow < 1) {
      throw new Error("maxTransactionsInWindow must be at least 1.");
    }
    this.config = { ...config };
  }

  /**
   * Evaluate an incoming SpendRequest against moving-window anomaly rules.
   * If a rule is violated, trips the circuit breaker to OPEN and sets `allowance.active = false`.
   */
  public evaluateAndRecord(
    allowance: ScopedAllowance,
    request: SpendRequest
  ): {
    allowed: boolean;
    code:
      | "CIRCUIT_CLOSED"
      | "CIRCUIT_TRIPPED_FREQUENCY"
      | "CIRCUIT_TRIPPED_RAPID_BURST"
      | "CIRCUIT_TRIPPED_WINDOW_VOLUME"
      | "CIRCUIT_OPEN";
    reason?: string;
    status: CircuitBreakerStatus;
  } {
    const entry = this.getOrInitEntry(allowance.id);
    const now = request.timestamp;

    // Check if already tripped (and whether cooldown has elapsed)
    if (entry.state === "OPEN") {
      if (
        this.config.cooldownSeconds !== undefined &&
        entry.trippedAt !== undefined &&
        now - entry.trippedAt >= this.config.cooldownSeconds
      ) {
        this.reset(allowance.id, allowance);
      } else {
        return {
          allowed: false,
          code: "CIRCUIT_OPEN",
          reason:
            entry.tripReason ??
            `Circuit breaker is OPEN for allowance ${allowance.id}.`,
          status: this.buildStatus(allowance.id, entry, now),
        };
      }
    }

    // Prune events outside the sliding window [now - windowSeconds, now]
    this.pruneWindow(entry, now);

    // 1. Check rapid-succession burst interval
    const lastEvent = entry.events[entry.events.length - 1];
    if (
      this.config.minIntervalSeconds !== undefined &&
      lastEvent !== undefined &&
      now - lastEvent.timestamp < this.config.minIntervalSeconds
    ) {
      return this.trip(
        allowance,
        entry,
        now,
        "CIRCUIT_TRIPPED_RAPID_BURST",
        `Rapid succession withdrawal detected (${now - lastEvent.timestamp}s < ${this.config.minIntervalSeconds}s minimum interval).`
      );
    }

    // 2. Check moving-window transaction count threshold
    if (entry.events.length + 1 > this.config.maxTransactionsInWindow) {
      return this.trip(
        allowance,
        entry,
        now,
        "CIRCUIT_TRIPPED_FREQUENCY",
        `Moving-window transaction count (${entry.events.length + 1}) exceeded maxTransactionsInWindow (${this.config.maxTransactionsInWindow}) within ${this.config.windowSeconds}s.`
      );
    }

    // 3. Check moving-window cumulative stroop volume
    const currentVolume = entry.events.reduce((acc, ev) => acc + ev.amountStroops, 0n);
    if (
      this.config.maxVolumeStroopsInWindow !== undefined &&
      currentVolume + request.amountStroops > this.config.maxVolumeStroopsInWindow
    ) {
      return this.trip(
        allowance,
        entry,
        now,
        "CIRCUIT_TRIPPED_WINDOW_VOLUME",
        `Moving-window spend volume (${currentVolume + request.amountStroops} stroops) exceeded maxVolumeStroopsInWindow (${this.config.maxVolumeStroopsInWindow} stroops).`
      );
    }

    // Record normal spend event
    entry.events.push({
      timestamp: now,
      amountStroops: request.amountStroops,
    });

    return {
      allowed: true,
      code: "CIRCUIT_CLOSED",
      status: this.buildStatus(allowance.id, entry, now),
    };
  }

  /**
   * Manually reset a tripped circuit breaker back to CLOSED and optionally reactivate the allowance.
   */
  public reset(allowanceId: string, allowance?: ScopedAllowance): CircuitBreakerStatus {
    const entry = this.getOrInitEntry(allowanceId);
    entry.state = "CLOSED";
    entry.trippedAt = undefined;
    entry.tripReason = undefined;
    entry.events = [];
    if (allowance && allowance.id === allowanceId) {
      allowance.active = true;
    }
    return this.buildStatus(allowanceId, entry, Math.floor(Date.now() / 1000));
  }

  /**
   * Inspect current circuit breaker status for an allowance at a given timestamp.
   */
  public getStatus(
    allowanceId: string,
    currentTimestamp: number = Math.floor(Date.now() / 1000)
  ): CircuitBreakerStatus {
    const entry = this.getOrInitEntry(allowanceId);
    this.pruneWindow(entry, currentTimestamp);
    return this.buildStatus(allowanceId, entry, currentTimestamp);
  }

  private getOrInitEntry(allowanceId: string): AllowanceBreakerEntry {
    let entry = this.records.get(allowanceId);
    if (!entry) {
      entry = { state: "CLOSED", events: [] };
      this.records.set(allowanceId, entry);
    }
    return entry;
  }

  private pruneWindow(entry: AllowanceBreakerEntry, now: number): void {
    const cutoff = now - this.config.windowSeconds;
    entry.events = entry.events.filter((ev) => ev.timestamp > cutoff);
  }

  private trip(
    allowance: ScopedAllowance,
    entry: AllowanceBreakerEntry,
    now: number,
    code:
      | "CIRCUIT_TRIPPED_FREQUENCY"
      | "CIRCUIT_TRIPPED_RAPID_BURST"
      | "CIRCUIT_TRIPPED_WINDOW_VOLUME",
    reason: string
  ) {
    entry.state = "OPEN";
    entry.trippedAt = now;
    entry.tripReason = reason;
    allowance.active = false;

    return {
      allowed: false,
      code,
      reason,
      status: this.buildStatus(allowance.id, entry, now),
    };
  }

  private buildStatus(
    allowanceId: string,
    entry: AllowanceBreakerEntry,
    now: number
  ): CircuitBreakerStatus {
    this.pruneWindow(entry, now);
    const windowVolumeStroops = entry.events.reduce(
      (acc, ev) => acc + ev.amountStroops,
      0n
    );
    const lastEvent = entry.events[entry.events.length - 1];
    return {
      allowanceId,
      state: entry.state,
      trippedAt: entry.trippedAt,
      tripReason: entry.tripReason,
      windowTransactionCount: entry.events.length,
      windowVolumeStroops,
      lastSpendTimestamp: lastEvent?.timestamp,
    };
  }
}
