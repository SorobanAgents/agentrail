import { describe, it, expect, beforeEach } from "vitest";
import { AgentRegistry, AgentService } from "../src/lib/agent-registry.js";

describe("AgentRegistry - Service Discovery & Capabilities", () => {
  let registry: AgentRegistry;
  const mockAgent = "GBHM5SCH2R5W5S63HVMQCXOFGCEXPSE2KL4GYRJY7GRTL4MYDB6M2CKY";

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  it("should register a valid agent service and compute deterministic hash", () => {
    const service: AgentService = {
      serviceId: "sec-filing-ocr",
      name: "SEC Edgar Filing OCR Scanner",
      description: "Extracts balance sheet items from 10-K PDFs autonomously",
      tags: ["ocr", "finance", "sec"],
      endpointUrl: "https://api.agentrail.org/services/sec-ocr",
      costStroops: 500000n, // 0.05 USDC
      settlementAsset: "USDC",
      slaLatencyMs: 1500,
    };

    const record = registry.registerService(mockAgent, service);
    expect(record.agentPublicKey).toBe(mockAgent);
    expect(record.active).toBe(true);
    expect(record.registrationHash).toHaveLength(64);
    expect(record.reputationScore).toBe(100);
  });

  it("should discover agents by tag and keyword correctly", () => {
    registry.registerService(mockAgent, {
      serviceId: "sec-ocr",
      name: "SEC Edgar Scanner",
      description: "Finance parser",
      tags: ["finance", "ocr"],
      endpointUrl: "https://api.agentrail.org/ocr",
      costStroops: 1000000n,
      settlementAsset: "USDC",
      slaLatencyMs: 1000,
    });

    registry.registerService("GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT", {
      serviceId: "crypto-sentiment",
      name: "Crypto Sentiment Engine",
      description: "Scans Twitter & Discord for Soroban mentions",
      tags: ["crypto", "nlp", "sentiment"],
      endpointUrl: "https://api.agentrail.org/sentiment",
      costStroops: 2000000n,
      settlementAsset: "USDC",
      slaLatencyMs: 800,
    });

    const ocrMatches = registry.discover({ tag: "ocr" });
    expect(ocrMatches).toHaveLength(1);
    expect(ocrMatches[0].service.serviceId).toBe("sec-ocr");

    const keywordMatches = registry.discover({ keyword: "sentiment" });
    expect(keywordMatches).toHaveLength(1);
    expect(keywordMatches[0].service.serviceId).toBe("crypto-sentiment");
  });

  it("should filter agents by max cost", () => {
    registry.registerService(mockAgent, {
      serviceId: "cheap-task",
      name: "Cheap Micro Service",
      description: "Lightweight tool",
      tags: ["general"],
      endpointUrl: "https://api.agentrail.org/cheap",
      costStroops: 100000n, // 0.01 USDC
      settlementAsset: "USDC",
      slaLatencyMs: 500,
    });

    registry.registerService(mockAgent, {
      serviceId: "expensive-task",
      name: "Expensive Heavy Compute",
      description: "Heavy GPU training",
      tags: ["general"],
      endpointUrl: "https://api.agentrail.org/expensive",
      costStroops: 50000000n, // 5 USDC
      settlementAsset: "USDC",
      slaLatencyMs: 5000,
    });

    const budgetMatches = registry.discover({ maxCostStroops: 500000n });
    expect(budgetMatches).toHaveLength(1);
    expect(budgetMatches[0].service.serviceId).toBe("cheap-task");
  });

  it("should deactivate service successfully", () => {
    registry.registerService(mockAgent, {
      serviceId: "retiring-service",
      name: "Old Tool",
      description: "Will retire",
      tags: ["temp"],
      endpointUrl: "https://api.agentrail.org/retiring",
      costStroops: 10000n,
      settlementAsset: "USDC",
      slaLatencyMs: 500,
    });

    expect(registry.discover({ tag: "temp" })).toHaveLength(1);
    const deactivated = registry.deactivateService(mockAgent, "retiring-service");
    expect(deactivated).toBe(true);
    expect(registry.discover({ tag: "temp" })).toHaveLength(0);
  });
});
