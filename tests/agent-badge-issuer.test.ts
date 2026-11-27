import { describe, it, expect, beforeEach } from "vitest";
import { AgentBadgeIssuer } from "../src/lib/agent-badge-issuer.js";

describe("AgentBadgeIssuer - SEP-50 Verified Badges & XOXNO Showcase Engine", () => {
  let issuer: AgentBadgeIssuer;
  const mockIssuerPublicKey = "GBHM5SCH2R5W5S63HVMQCXOFGCEXPSE2KL4GYRJY7GRTL4MYDB6M2CKY";
  const mockAgentPublicKey = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
  const mockTreasuryWallet = "GBHRSZLBJNR32ERCZT6PE3HJVVQGXT5KWQXGL5SVEPJXUQUDXSDBCWVE";

  beforeEach(() => {
    issuer = new AgentBadgeIssuer();
  });

  it("should issue a SEP-50 Diamond tier verification badge to high-performing agent", () => {
    const badge = issuer.issueBadge(
      {
        agentPublicKey: mockAgentPublicKey,
        agentName: "Nirium-Alpha-Trader",
        badgeType: "dex_arbitrageur",
        completedTasksCount: 150,
        auditScore: 98,
        latestTaskCommitmentHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        ipfsAuditCid: "QmdJowsxyyDjv8UxwgceawgpZN4zsDUDaKeSiqDpQX3p8a",
        validityDays: 180,
      },
      mockIssuerPublicKey
    );

    expect(badge.badgeId).toMatch(/^sep50-agt-[a-f0-9]{16}$/);
    expect(badge.tier).toBe("diamond");
    expect(badge.reputationScore).toBeGreaterThanOrEqual(95);
    expect(badge.revoked).toBe(false);
    expect(badge.sep50Standard).toBe("SEP-0050-v1");
  });

  it("should correctly compute bronze, silver, and gold tiers based on audit scores and task volume", () => {
    const bronze = issuer.issueBadge(
      {
        agentPublicKey: "GBRONZE1111111111111111111111111111111111111111111111111111",
        agentName: "Newbie-Bot",
        badgeType: "inference_worker",
        completedTasksCount: 5,
        auditScore: 60,
      },
      mockIssuerPublicKey
    );
    expect(bronze.tier).toBe("bronze");

    const silver = issuer.issueBadge(
      {
        agentPublicKey: "GSILVER2222222222222222222222222222222222222222222222222222",
        agentName: "Mid-Tier-Worker",
        badgeType: "inference_worker",
        completedTasksCount: 20,
        auditScore: 75,
      },
      mockIssuerPublicKey
    );
    expect(silver.tier).toBe("silver");

    const gold = issuer.issueBadge(
      {
        agentPublicKey: "GGOLD333333333333333333333333333333333333333333333333333333",
        agentName: "Senior-Risk-Auditor",
        badgeType: "risk_auditor",
        completedTasksCount: 60,
        auditScore: 88,
      },
      mockIssuerPublicKey
    );
    expect(gold.tier).toBe("gold");
  });

  it("should verify an active badge successfully", () => {
    issuer.issueBadge(
      {
        agentPublicKey: mockAgentPublicKey,
        agentName: "Verifier-Test-Bot",
        badgeType: "autonomous_agent_verified",
        completedTasksCount: 40,
        auditScore: 80,
      },
      mockIssuerPublicKey
    );

    const verification = issuer.verifyBadge(mockAgentPublicKey);
    expect(verification.valid).toBe(true);
    expect(verification.code).toBe("BADGE_VERIFIED_ACTIVE");
    expect(verification.badge?.agentName).toBe("Verifier-Test-Bot");
  });

  it("should reject verification when badge is revoked", () => {
    issuer.issueBadge(
      {
        agentPublicKey: mockAgentPublicKey,
        agentName: "Malicious-Attempt-Bot",
        badgeType: "dex_arbitrageur",
        completedTasksCount: 10,
        auditScore: 70,
      },
      mockIssuerPublicKey
    );

    const revoked = issuer.revokeBadge(mockAgentPublicKey, "Unauthorized drain pattern detected");
    expect(revoked).toBe(true);

    const check = issuer.verifyBadge(mockAgentPublicKey);
    expect(check.valid).toBe(false);
    expect(check.code).toBe("BADGE_REVOKED");
    expect(check.message).toContain("Unauthorized drain pattern detected");
  });

  it("should format valid SEP-50 standard metadata structure for Stellar wallets", () => {
    const badge = issuer.issueBadge(
      {
        agentPublicKey: mockAgentPublicKey,
        agentName: "SEP50-Standard-Agent",
        badgeType: "autonomous_agent_verified",
        completedTasksCount: 100,
        auditScore: 96,
        latestTaskCommitmentHash: "commit-hash-123",
        ipfsAuditCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
      },
      mockIssuerPublicKey
    );

    const sep50 = issuer.formatSep50Metadata(badge);
    expect(sep50.sep).toBe(50);
    expect(sep50.is_transferable).toBe(false); // Soulbound
    expect(sep50.subject).toBe(mockAgentPublicKey);
    expect(sep50.issuer).toBe(mockIssuerPublicKey);
  });

  it("should export full XOXNO marketplace listing payload with 20 BPS royalties", () => {
    const badge = issuer.issueBadge(
      {
        agentPublicKey: mockAgentPublicKey,
        agentName: "XOXNO-Featured-Agent",
        badgeType: "autonomous_agent_verified",
        completedTasksCount: 80,
        auditScore: 92,
        ipfsAuditCid: "QmdJowsxyyDjv8UxwgceawgpZN4zsDUDaKeSiqDpQX3p8a",
      },
      mockIssuerPublicKey
    );

    const listing = issuer.exportXoxnoListing(badge, mockTreasuryWallet);
    expect(listing.id).toBe(badge.badgeId);
    expect(listing.name).toContain("XOXNO-Featured-Agent");
    expect(listing.seller_fee_basis_points).toBe(20); // 20 BPS
    expect(listing.fee_recipient).toBe(mockTreasuryWallet);
    expect(listing.attributes.some((a) => a.trait_type === "Badge Standard" && a.value === "SEP-50")).toBe(true);
  });
});
