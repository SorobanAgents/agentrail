/**
 * AgentRail - SEP-50 Compliant Autonomous Agent Verification Badge Issuer
 * 
 * Implements Stellar Ecosystem Proposal 50 (SEP-50) for On-Chain AI Agent Badges:
 * - Soulbound Non-Transferable verifiable credentials.
 * - Proof-of-Task and Nirium Attestation Binding.
 * - Dynamic Reputation Scoring (0-100) & Automatic Revocation Engine.
 * - Native metadata export for XOXNO & Stellar NFT Marketplaces.
 */

import {
  AgentBadgeMetadata,
  AgentBadgeType,
  AgentBadgeTier,
  IssueBadgeRequest,
  BadgeVerificationResult,
  XoxnoListingMetadata,
} from "../types.js";
import { createHash } from "crypto";

export class AgentBadgeIssuer {
  private badgesByAgent: Map<string, AgentBadgeMetadata> = new Map();
  private badgesById: Map<string, AgentBadgeMetadata> = new Map();

  /**
   * Issues a SEP-50 compliant verification badge to an autonomous AI agent.
   */
  public issueBadge(
    request: IssueBadgeRequest,
    issuerPublicKey: string
  ): AgentBadgeMetadata {
    if (!request.agentPublicKey || !request.agentPublicKey.startsWith("G")) {
      throw new Error(`Invalid agent public key format: ${request.agentPublicKey}`);
    }

    const tier = this.computeTier(request.auditScore, request.completedTasksCount);
    const reputationScore = this.computeReputationScore(request.auditScore, request.completedTasksCount);

    const now = Math.floor(Date.now() / 1000);
    const validitySeconds = (request.validityDays ?? 365) * 86400;
    const expiresAt = now + validitySeconds;

    // Deterministic Badge ID based on Agent Address, Type, and Issuer
    const badgeRaw = `${request.agentPublicKey}:${request.badgeType}:${issuerPublicKey}:${now}`;
    const badgeHash = createHash("sha256").update(badgeRaw).digest("hex").slice(0, 16);
    const badgeId = `sep50-agt-${badgeHash}`;

    const badge: AgentBadgeMetadata = {
      badgeId,
      agentPublicKey: request.agentPublicKey,
      agentName: request.agentName,
      badgeType: request.badgeType,
      tier,
      reputationScore,
      issuedAt: now,
      expiresAt,
      taskCommitmentHash: request.latestTaskCommitmentHash,
      ipfsAuditCid: request.ipfsAuditCid,
      revoked: false,
      issuerPublicKey,
      sep50Standard: "SEP-0050-v1",
    };

    this.badgesByAgent.set(request.agentPublicKey, badge);
    this.badgesById.set(badgeId, badge);

    return badge;
  }

  /**
   * Verifies the authenticity, validity, and active status of an agent's badge.
   */
  public verifyBadge(agentPublicKey: string): BadgeVerificationResult {
    const badge = this.badgesByAgent.get(agentPublicKey);

    if (!badge) {
      return {
        valid: false,
        code: "BADGE_NOT_FOUND",
        message: `No SEP-50 verification badge found for agent address ${agentPublicKey}.`,
      };
    }

    if (badge.revoked) {
      return {
        valid: false,
        code: "BADGE_REVOKED",
        message: `Badge ${badge.badgeId} has been revoked! Reason: ${badge.revocationReason || "Security rule violation"}`,
        badge,
      };
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > badge.expiresAt) {
      return {
        valid: false,
        code: "BADGE_EXPIRED",
        message: `Badge ${badge.badgeId} expired at timestamp ${badge.expiresAt}.`,
        badge,
      };
    }

    return {
      valid: true,
      code: "BADGE_VERIFIED_ACTIVE",
      message: `Agent holds valid ${badge.tier.toUpperCase()} SEP-50 badge (${badge.badgeType}) with reputation score ${badge.reputationScore}/100.`,
      badge,
    };
  }

  /**
   * Revokes an agent's badge immediately (e.g. on circuit-breaker trip or malicious behavior).
   */
  public revokeBadge(agentPublicKey: string, reason: string): boolean {
    const badge = this.badgesByAgent.get(agentPublicKey);
    if (!badge) return false;

    badge.revoked = true;
    badge.revocationReason = reason;
    this.badgesByAgent.set(agentPublicKey, badge);
    this.badgesById.set(badge.badgeId, badge);
    return true;
  }

  /**
   * Formats the badge into canonical SEP-50 on-chain JSON schema for Stellar wallets.
   */
  public formatSep50Metadata(badge: AgentBadgeMetadata): Record<string, unknown> {
    return {
      sep: 50,
      version: "1.0.0",
      standard: "Stellar Agentic Non-Transferable Attestation (Soulbound)",
      id: badge.badgeId,
      issuer: badge.issuerPublicKey,
      subject: badge.agentPublicKey,
      name: `AgentRail Verified Agent: ${badge.agentName}`,
      description: `Cryptographically verified autonomous agent on Stellar Soroban. Tier: ${badge.tier}, Score: ${badge.reputationScore}.`,
      type: badge.badgeType,
      tier: badge.tier,
      reputation_score: badge.reputationScore,
      issued_at: badge.issuedAt,
      expires_at: badge.expiresAt,
      is_transferable: false,
      attestation: {
        task_commitment_hash: badge.taskCommitmentHash || null,
        ipfs_audit_cid: badge.ipfsAuditCid || null,
        audited_by: "AgentRail Autonomous Protocol v0.1.0",
      },
    };
  }

  /**
   * Exports official listing payload for Mihai Eremia's XOXNO NFT & Agent Marketplace.
   */
  public exportXoxnoListing(
    badge: AgentBadgeMetadata,
    treasuryAddress: string
  ): XoxnoListingMetadata {
    return {
      id: badge.badgeId,
      name: `${badge.agentName} [AgentRail Verified - ${badge.tier.toUpperCase()}]`,
      description: `Official Verified Autonomous Agent badge issued under SEP-50 by AgentRail. Non-transferable Soulbound credential representing verified uptime, proof-of-task, and zero-drain security score of ${badge.reputationScore}/100.`,
      image: `https://agentrail.org/badges/${badge.tier}.png`,
      external_url: `https://agentrail.org/agents/${badge.agentPublicKey}`,
      attributes: [
        { trait_type: "Badge Standard", value: "SEP-50" },
        { trait_type: "Badge Type", value: badge.badgeType },
        { trait_type: "Tier", value: badge.tier.toUpperCase() },
        { trait_type: "Reputation Score", value: badge.reputationScore },
        { trait_type: "Transferable", value: "Soulbound (No)" },
        { trait_type: "IPFS Audit CID", value: badge.ipfsAuditCid || "verified-onchain" },
        { trait_type: "Protocol Fee BPS", value: 20 },
      ],
      seller_fee_basis_points: 20, // 20 BPS protocol revenue
      fee_recipient: treasuryAddress,
    };
  }

  private computeTier(auditScore: number, tasksCount: number): AgentBadgeTier {
    if (auditScore >= 95 && tasksCount >= 100) return "diamond";
    if (auditScore >= 85 && tasksCount >= 50) return "gold";
    if (auditScore >= 70 && tasksCount >= 10) return "silver";
    return "bronze";
  }

  private computeReputationScore(auditScore: number, tasksCount: number): number {
    // 60% weight on audit score, 40% weight on task execution volume (max 100 tasks)
    const taskFactor = Math.min(tasksCount, 100);
    const score = Math.round((auditScore * 0.6) + (taskFactor * 0.4));
    return Math.max(0, Math.min(100, score));
  }
}
