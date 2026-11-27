import { describe, it, expect, beforeEach } from "vitest";
import { AgentRailMcpServer } from "../src/lib/mcp-server.js";
import { AgentRegistry } from "../src/lib/agent-registry.js";
import { X402Gateway } from "../src/lib/x402-gateway.js";
import { ScopedAllowance } from "../src/types.js";

describe("AgentRailMcpServer - LLM Tool Integration", () => {
  let mcp: AgentRailMcpServer;
  let registry: AgentRegistry;
  let gateway: X402Gateway;

  const agentWallet = "GBHM5SCH2R5W5S63HVMQCXOFGCEXPSE2KL4GYRJY7GRTL4MYDB6M2CKY";
  const merchantWallet = "GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT";

  beforeEach(() => {
    registry = new AgentRegistry();
    gateway = new X402Gateway(merchantWallet, 500000n, "stellar:pubnet");
    mcp = new AgentRailMcpServer(registry, gateway);
  });

  it("should register core tools on initialization", () => {
    const tools = mcp.getTools();
    expect(tools.length).toBeGreaterThanOrEqual(4);
    const names = tools.map(t => t.name);
    expect(names).toContain("agentrail_discover_services");
    expect(names).toContain("agentrail_register_service");
    expect(names).toContain("agentrail_evaluate_spend");
    expect(names).toContain("agentrail_settle_x402_challenge");
  });

  it("should execute agentrail_register_service and agentrail_discover_services through MCP", async () => {
    const regResult = await mcp.executeTool("agentrail_register_service", {
      agentPublicKey: agentWallet,
      serviceId: "agent-researcher",
      name: "Autonomous Arxiv Researcher",
      description: "Summarizes crypto and ML papers",
      tags: ["research", "academic"],
      endpointUrl: "https://api.agentrail.org/research",
      costStroops: "300000",
    });

    expect(regResult.success).toBe(true);
    expect(regResult.registrationHash).toBeDefined();

    const discoveryResult = await mcp.executeTool("agentrail_discover_services", {
      tag: "research",
    });

    expect(discoveryResult.count).toBe(1);
    expect(discoveryResult.services[0].serviceId).toBe("agent-researcher");
    expect(discoveryResult.services[0].costUSDC).toBe("0.0300");
  });

  it("should enforce allowance spend evaluation through MCP", async () => {
    const mockAllowance: ScopedAllowance = {
      id: "agent-session-1",
      ownerPublicKey: merchantWallet,
      agentPublicKey: agentWallet,
      maxStroops: 5000000n,
      spentStroops: 0n,
      validFrom: Math.floor(Date.now() / 1000) - 100,
      validUntil: Math.floor(Date.now() / 1000) + 3600,
      allowedDestinations: [merchantWallet],
      active: true,
      protocolFeeBps: 20,
    };

    mcp.registerAllowance(mockAllowance);

    const spendResult = await mcp.executeTool("agentrail_evaluate_spend", {
      allowanceId: "agent-session-1",
      agentPublicKey: agentWallet,
      destinationAddress: merchantWallet,
      spendStroops: "500000",
    });

    expect(spendResult.authorized).toBe(true);
    expect(spendResult.remainingBudgetStroops).toBe("4500000"); // 5,000,000 - 500,000
  });
});
