import { createHash } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { SpendRequest } from "../types.js";

/**
 * Configuration for an M-of-N multi-party swarm treasury threshold policy.
 */
export interface ThresholdPolicy {
  /** Minimum number of valid distinct Ed25519 co-signatures required (M). */
  threshold: number;
  /** Set of authorized swarm subagent Stellar public keys (G...) (N). */
  authorizedSigners: string[];
  /** Spend ceiling in stroops above which M-of-N threshold co-signing is mandatory. */
  highValueCeilingStroops: bigint;
}

/**
 * Individual Ed25519 signature contributed by a swarm subagent.
 */
export interface SignerAttestation {
  /** Stellar Ed25519 public key (G...). */
  signerPublicKey: string;
  /** Hex or base64 encoded 64-byte Ed25519 signature over the canonical spend digest. */
  signature: string;
  /** Encoding format of the signature (defaults to "hex"). */
  encoding?: "hex" | "base64";
}

/**
 * Result of evaluating an M-of-N threshold signature bundle.
 */
export interface ThresholdVerificationResult {
  ok: boolean;
  code:
    | "THRESHOLD_SATISFIED"
    | "INVALID_POLICY"
    | "DUPLICATE_SIGNER"
    | "UNAUTHORIZED_SIGNER"
    | "INVALID_SIGNATURE"
    | "INSUFFICIENT_SIGNATURES";
  message: string;
  validSigners: string[];
  requiredThreshold: number;
}

/**
 * Compute a deterministic SHA-256 digest over a SpendRequest for Ed25519 co-signing.
 */
export function computeSpendSigningDigest(request: SpendRequest): Buffer {
  const canonical = [
    request.allowanceId,
    request.agentPublicKey,
    request.destination,
    request.amountStroops.toString(),
    request.timestamp.toString(),
    request.memo ?? "",
  ].join("|");
  return createHash("sha256").update(canonical, "utf8").digest();
}

/**
 * Helper to sign a SpendRequest using a Stellar Keypair and produce a SignerAttestation.
 */
export function signSpendRequest(
  request: SpendRequest,
  keypair: Keypair,
  encoding: "hex" | "base64" = "hex"
): SignerAttestation {
  const digest = computeSpendSigningDigest(request);
  const sigBuffer = keypair.sign(digest);
  return {
    signerPublicKey: keypair.publicKey(),
    signature: sigBuffer.toString(encoding),
    encoding,
  };
}

/**
 * Validate threshold policy invariants: 1 <= M <= N and unique authorized signers.
 */
export function validateThresholdPolicy(policy: ThresholdPolicy): {
  ok: boolean;
  reason?: string;
  uniqueAuthorized: Set<string>;
} {
  const uniqueAuthorized = new Set(
    policy.authorizedSigners.map((s) => s.trim()).filter(Boolean)
  );
  if (uniqueAuthorized.size === 0) {
    return {
      ok: false,
      reason: "Threshold policy must specify at least one authorized signer.",
      uniqueAuthorized,
    };
  }
  if (uniqueAuthorized.size !== policy.authorizedSigners.length) {
    return {
      ok: false,
      reason: "Threshold policy contains duplicate public keys in authorizedSigners.",
      uniqueAuthorized,
    };
  }
  if (
    !Number.isInteger(policy.threshold) ||
    policy.threshold < 1 ||
    policy.threshold > uniqueAuthorized.size
  ) {
    return {
      ok: false,
      reason: `Invalid threshold M=${policy.threshold} for N=${uniqueAuthorized.size} signers (must satisfy 1 <= M <= N).`,
      uniqueAuthorized,
    };
  }
  if (policy.highValueCeilingStroops < 0n) {
    return {
      ok: false,
      reason: "highValueCeilingStroops must be non-negative.",
      uniqueAuthorized,
    };
  }
  return { ok: true, uniqueAuthorized };
}

/**
 * Verify an M-of-N Ed25519 signature set against a SpendRequest and ThresholdPolicy.
 */
export function verifyThresholdSignatures(
  request: SpendRequest,
  policy: ThresholdPolicy,
  attestations: SignerAttestation[]
): ThresholdVerificationResult {
  const policyCheck = validateThresholdPolicy(policy);
  if (!policyCheck.ok) {
    return {
      ok: false,
      code: "INVALID_POLICY",
      message: policyCheck.reason ?? "Invalid threshold policy configuration.",
      validSigners: [],
      requiredThreshold: policy.threshold,
    };
  }

  const seenSigners = new Set<string>();
  const validSigners: string[] = [];
  const digest = computeSpendSigningDigest(request);

  for (const att of attestations) {
    const pubKey = att.signerPublicKey.trim();

    if (seenSigners.has(pubKey)) {
      return {
        ok: false,
        code: "DUPLICATE_SIGNER",
        message: `Duplicate signature submitted for public key ${pubKey}.`,
        validSigners,
        requiredThreshold: policy.threshold,
      };
    }
    seenSigners.add(pubKey);

    if (!policyCheck.uniqueAuthorized.has(pubKey)) {
      return {
        ok: false,
        code: "UNAUTHORIZED_SIGNER",
        message: `Rogue or unauthorized signer public key ${pubKey} is not in the swarm roster.`,
        validSigners,
        requiredThreshold: policy.threshold,
      };
    }

    try {
      const kp = Keypair.fromPublicKey(pubKey);
      const encoding = att.encoding ?? "hex";
      const sigBytes = Buffer.from(att.signature, encoding);
      if (sigBytes.length !== 64 || !kp.verify(digest, sigBytes)) {
        return {
          ok: false,
          code: "INVALID_SIGNATURE",
          message: `Cryptographic Ed25519 signature verification failed for signer ${pubKey}.`,
          validSigners,
          requiredThreshold: policy.threshold,
        };
      }
      validSigners.push(pubKey);
    } catch {
      return {
        ok: false,
        code: "INVALID_SIGNATURE",
        message: `Malformed public key or Ed25519 signature format for signer ${pubKey}.`,
        validSigners,
        requiredThreshold: policy.threshold,
      };
    }
  }

  if (validSigners.length < policy.threshold) {
    return {
      ok: false,
      code: "INSUFFICIENT_SIGNATURES",
      message: `Threshold not met: received ${validSigners.length} valid signature(s), require at least ${policy.threshold}.`,
      validSigners,
      requiredThreshold: policy.threshold,
    };
  }

  return {
    ok: true,
    code: "THRESHOLD_SATISFIED",
    message: `Verified ${validSigners.length}-of-${policyCheck.uniqueAuthorized.size} threshold co-signatures.`,
    validSigners,
    requiredThreshold: policy.threshold,
  };
}
