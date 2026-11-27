/**
 * AgentRail - Decentralized Agent Registry & Service Discovery
 * 
 * Provides an on-chain/cryptographic registry protocol where autonomous AI agents
 * publish service capabilities, endpoint schemas, pricing (USDC stroops), and public keys,
 * enabling dynamic multi-agent peer discovery and negotiation on Stellar Soroban.
 */

import { createHash } from "node:crypto";
import { z } from "zod";

export const AgentServiceSchema = z.object({
  serviceId: z.string().min(3),
  name: z.string().min(2),
  description: z.string(),
  tags: z.array(z.string()),
  endpointUrl: z.string().url(),
  costStroops: z.bigint(),
  settlementAsset: z.string().default("USDC"),
  slaLatencyMs: z.number().int().positive().default(2000),
});

export const AgentRegistrationRecordSchema = z.object({
  agentPublicKey: z.string().regex(/^G[A-Z2-7]{55}$/),
  service: AgentServiceSchema,
  registeredAt: z.number().int(),
  ttlEpochSeconds: z.number().int(),
  reputationScore: z.number().min(0).max(100).default(100),
  active: z.boolean().default(true),
  registrationHash: z.string(),
});

export type AgentService = z.infer<typeof AgentServiceSchema>;
export type AgentRegistrationRecord = z.infer<typeof AgentRegistrationRecordSchema>;

export class AgentRegistry {
  private records: Map<string, AgentRegistrationRecord> = new Map();

  /**
   * Register a new agent service on the registry.
   */
  public registerService(
    agentPublicKey: string,
    service: AgentService,
    ttlSeconds = 86400 * 30 // 30 days default
  ): AgentRegistrationRecord {
    const parsedService = AgentServiceSchema.parse(service);
    const now = Math.floor(Date.now() / 1000);

    const rawPayload = `${agentPublicKey}:${parsedService.serviceId}:${parsedService.costStroops.toString()}:${now}`;
    const registrationHash = createHash("sha256").update(rawPayload).digest("hex");

    const record: AgentRegistrationRecord = {
      agentPublicKey,
      service: parsedService,
      registeredAt: now,
      ttlEpochSeconds: now + ttlSeconds,
      reputationScore: 100,
      active: true,
      registrationHash,
    };

    AgentRegistrationRecordSchema.parse(record);
    const key = `${agentPublicKey}:${parsedService.serviceId}`;
    this.records.set(key, record);
    return record;
  }

  /**
   * Discover agents by tags or keywords with budget filtering.
   */
  public discover(query: {
    tag?: string;
    keyword?: string;
    maxCostStroops?: bigint;
    activeOnly?: boolean;
  }): AgentRegistrationRecord[] {
    const now = Math.floor(Date.now() / 1000);
    const results: AgentRegistrationRecord[] = [];

    for (const record of this.records.values()) {
      if (query.activeOnly !== false && (!record.active || record.ttlEpochSeconds <= now)) {
        continue;
      }

      if (query.tag && !record.service.tags.some(t => t.toLowerCase() === query.tag?.toLowerCase())) {
        continue;
      }

      if (query.keyword) {
        const kw = query.keyword.toLowerCase();
        const matchName = record.service.name.toLowerCase().includes(kw);
        const matchDesc = record.service.description.toLowerCase().includes(kw);
        if (!matchName && !matchDesc) continue;
      }

      if (query.maxCostStroops !== undefined && record.service.costStroops > query.maxCostStroops) {
        continue;
      }

      results.push(record);
    }

    // Sort by reputation score descending, then cost ascending
    return results.sort((a, b) => {
      if (b.reputationScore !== a.reputationScore) {
        return b.reputationScore - a.reputationScore;
      }
      return a.service.costStroops < b.service.costStroops ? -1 : 1;
    });
  }

  /**
   * Lookup a specific service by agent key and serviceId.
   */
  public getService(agentPublicKey: string, serviceId: string): AgentRegistrationRecord | null {
    const key = `${agentPublicKey}:${serviceId}`;
    return this.records.get(key) || null;
  }

  /**
   * Deactivate an agent service.
   */
  public deactivateService(agentPublicKey: string, serviceId: string): boolean {
    const key = `${agentPublicKey}:${serviceId}`;
    const rec = this.records.get(key);
    if (!rec) return false;
    rec.active = false;
    return true;
  }

  /**
   * Export all active registry state for on-chain anchoring / IPFS synchronization.
   */
  public exportCanonicalState(): string {
    const sorted = Array.from(this.records.values())
      .filter(r => r.active)
      .sort((a, b) => a.registrationHash.localeCompare(b.registrationHash))
      .map(r => ({
        agent: r.agentPublicKey,
        serviceId: r.service.serviceId,
        costStroops: r.service.costStroops.toString(),
        hash: r.registrationHash,
      }));
    return JSON.stringify(sorted);
  }
}
