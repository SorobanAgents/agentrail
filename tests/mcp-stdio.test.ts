import { describe, it, expect } from "vitest";
import { AgentRegistry } from "../src/lib/agent-registry.js";
import { AgentRailMcpServer } from "../src/lib/mcp-server.js";
import { ReflectorOracleAdapter, DEFAULT_REFLECTOR_CONTRACT } from "../src/lib/reflector-oracle-adapter.js";
import { AgentBadgeIssuer } from "../src/lib/agent-badge-issuer.js";
import { z } from "zod";

describe("AgentRail MCP Tools Suite", () => {
  it("registers core tools and extended oracle/badge tools", async () => {
    const registry = new AgentRegistry();
    const server = new AgentRailMcpServer(registry);

    const oracle = new ReflectorOracleAdapter({
      reflectorContractId: DEFAULT_REFLECTOR_CONTRACT,
    });

    server.registerTool({
      name: "agentrail_get_oracle_price",
      description: "Get real-time decentralized oracle prices on Soroban",
      inputSchema: z.object({
        symbol: z.string(),
      }),
      handler: async (args) => {
        return oracle.getPrice(args.symbol);
      },
    });

    const badgeIssuer = new AgentBadgeIssuer();
    const ISSUER_PUBKEY = "GBHM5SCH2R5W5S63HVMQCXOFGCEXPSE2KL4GYRJY7GRTL4MYDB6M2CKY";

    server.registerTool({
      name: "agentrail_issue_agent_badge",
      description: "Issue a SEP-50 Soulbound verification badge",
      inputSchema: z.object({
        agentPublicKey: z.string(),
      }),
      handler: (args) => {
        return badgeIssuer.issueBadge(
          {
            agentPublicKey: args.agentPublicKey,
            badgeType: "AutonomousSettlementVerifier",
            auditScore: 98,
            completedTasksCount: 20,
          },
          ISSUER_PUBKEY
        );
      },
    });

    const tools = server.getTools();
    expect(tools.length).toBeGreaterThanOrEqual(5);

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("agentrail_discover_services");
    expect(toolNames).toContain("agentrail_register_service");
    expect(toolNames).toContain("agentrail_evaluate_spend");
    expect(toolNames).toContain("agentrail_get_oracle_price");
    expect(toolNames).toContain("agentrail_issue_agent_badge");
  });

  it("executes agentrail_get_oracle_price tool successfully", async () => {
    const registry = new AgentRegistry();
    const server = new AgentRailMcpServer(registry);
    const oracle = new ReflectorOracleAdapter({
      reflectorContractId: DEFAULT_REFLECTOR_CONTRACT,
    });

    server.registerTool({
      name: "agentrail_get_oracle_price",
      description: "Get oracle price",
      inputSchema: z.object({
        symbol: z.string(),
      }),
      handler: async (args) => {
        return oracle.getPrice(args.symbol);
      },
    });

    const res = await server.executeTool("agentrail_get_oracle_price", {
      symbol: "XLM",
    });

    expect(res).toBeDefined();
    expect(res.priceUsd).toBe(0.52);
    expect(res.decimals).toBe(7);
    expect(res.status).toBe("live");
  });
});
