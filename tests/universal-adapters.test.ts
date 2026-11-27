import { describe, it, expect, beforeEach } from "vitest";
import { UniversalAgentAdapters } from "../src/lib/universal-adapters.js";
import { AgentRailMcpServer } from "../src/lib/mcp-server.js";
import { AgentRegistry } from "../src/lib/agent-registry.js";

describe("UniversalAgentAdapters - OpenAI, DeepSeek, & ElizaOS compatibility", () => {
  let mcpServer: AgentRailMcpServer;

  beforeEach(() => {
    const registry = new AgentRegistry();
    mcpServer = new AgentRailMcpServer(registry);
  });

  it("should export OpenAI & DeepSeek compatible function tools", () => {
    const openAiTools = UniversalAgentAdapters.toOpenAiTools(mcpServer);
    expect(openAiTools.length).toBeGreaterThanOrEqual(3);

    for (const tool of openAiTools) {
      expect(tool.type).toBe("function");
      expect(tool.function.name).toBeDefined();
      expect(tool.function.description).toBeDefined();
      expect(tool.function.parameters).toBeDefined();
    }
  });

  it("should export ElizaOS (ai16z) Action Plugin format", async () => {
    const elizaPlugin = UniversalAgentAdapters.toElizaPlugin(mcpServer);
    expect(elizaPlugin.name).toBe("AgentRail-Stellar-Plugin");
    expect(elizaPlugin.actions.length).toBeGreaterThanOrEqual(3);

    const firstAction = elizaPlugin.actions[0];
    expect(firstAction.name).toBeDefined();
    expect(firstAction.similes.length).toBeGreaterThanOrEqual(1);
    expect(firstAction.examples.length).toBeGreaterThanOrEqual(1);

    const isValid = await firstAction.validate({}, {});
    expect(isValid).toBe(true);
  });
});
