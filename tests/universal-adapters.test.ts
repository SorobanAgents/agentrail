import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import {
  UniversalAgentAdapters,
  GeminiType,
  zodToGeminiSchema,
} from "../src/lib/universal-adapters.js";
import { AgentRailMcpServer, McpToolDefinition } from "../src/lib/mcp-server.js";
import { AgentRegistry } from "../src/lib/agent-registry.js";

describe("UniversalAgentAdapters - OpenAI, DeepSeek, ElizaOS & Google Gemini", () => {
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

  describe("Google Gemini FunctionDeclaration Exporter (Issue #84)", () => {
    it("should export Gemini FunctionDeclarations from AgentRailMcpServer instance", () => {
      const declarations = UniversalAgentAdapters.toGeminiDeclarations(mcpServer);
      expect(declarations.length).toBeGreaterThanOrEqual(4);

      for (const decl of declarations) {
        expect(decl.name).toBeDefined();
        expect(typeof decl.name).toBe("string");
        expect(decl.description).toBeDefined();
        expect(typeof decl.description).toBe("string");

        // Verify root parameter schema
        expect(decl.parameters).toBeDefined();
        expect(decl.parameters?.type).toBe(GeminiType.OBJECT);
        expect(decl.parameters?.properties).toBeDefined();
        expect(typeof decl.parameters?.properties).toBe("object");
      }
    });

    it("should export Gemini FunctionDeclarations from raw McpToolDefinition array", () => {
      const customTool: McpToolDefinition = {
        name: "test_custom_tool",
        description: "A test tool for Gemini declaration",
        inputSchema: z.object({
          message: z.string().describe("User message to process"),
          retryCount: z.number().int().describe("Number of retries"),
          isActive: z.boolean().describe("Whether tool is active"),
        }),
        handler: () => ({ success: true }),
      };

      const declarations = UniversalAgentAdapters.toGeminiDeclarations([customTool]);
      expect(declarations.length).toBe(1);

      const decl = declarations[0];
      expect(decl.name).toBe("test_custom_tool");
      expect(decl.description).toBe("A test tool for Gemini declaration");
      expect(decl.parameters?.type).toBe(GeminiType.OBJECT);

      const props = decl.parameters?.properties || {};
      expect(props.message.type).toBe(GeminiType.STRING);
      expect(props.message.description).toBe("User message to process");

      expect(props.retryCount.type).toBe(GeminiType.INTEGER);
      expect(props.retryCount.description).toBe("Number of retries");

      expect(props.isActive.type).toBe(GeminiType.BOOLEAN);
      expect(props.isActive.description).toBe("Whether tool is active");

      expect(decl.parameters?.required).toEqual(["message", "retryCount", "isActive"]);
    });

    it("should accurately translate complex Zod schemas (arrays, enums, optionals, defaults)", () => {
      const complexSchema = z.object({
        symbol: z.enum(["XLM", "BTC", "ETH"]).describe("Trading pair symbol"),
        tags: z.array(z.string()).describe("List of category tags"),
        optionalNote: z.string().optional().describe("Optional note"),
        feeRate: z.number().describe("Floating point fee rate"),
        defaultLimit: z.number().int().default(100).describe("Default limit"),
      });

      const geminiSchema = zodToGeminiSchema(complexSchema);
      expect(geminiSchema.type).toBe(GeminiType.OBJECT);

      const props = geminiSchema.properties || {};

      // Enum test
      expect(props.symbol.type).toBe(GeminiType.STRING);
      expect(props.symbol.enum).toEqual(["XLM", "BTC", "ETH"]);
      expect(props.symbol.description).toBe("Trading pair symbol");

      // Array test
      expect(props.tags.type).toBe(GeminiType.ARRAY);
      expect(props.tags.items?.type).toBe(GeminiType.STRING);
      expect(props.tags.description).toBe("List of category tags");

      // Optional test
      expect(props.optionalNote.type).toBe(GeminiType.STRING);
      expect(props.optionalNote.description).toBe("Optional note");

      // Number test (float vs int)
      expect(props.feeRate.type).toBe(GeminiType.NUMBER);
      expect(props.defaultLimit.type).toBe(GeminiType.INTEGER);

      // Required fields should include symbol, tags, feeRate (not optionalNote or defaultLimit)
      expect(geminiSchema.required).toContain("symbol");
      expect(geminiSchema.required).toContain("tags");
      expect(geminiSchema.required).toContain("feeRate");
      expect(geminiSchema.required).not.toContain("optionalNote");
      expect(geminiSchema.required).not.toContain("defaultLimit");
    });

    it("should map core AgentRail MCP tools with full description fidelity", () => {
      const declarations = UniversalAgentAdapters.toGeminiDeclarations(mcpServer);
      const discoverTool = declarations.find((d) => d.name === "agentrail_discover_services");

      expect(discoverTool).toBeDefined();
      expect(discoverTool?.description).toContain("Discover peer AI agents");

      const props = discoverTool?.parameters?.properties || {};
      expect(props.tag?.description).toContain("Category tag");
      expect(props.keyword?.description).toContain("Search term");
      expect(props.maxCostStroops?.description).toContain("Maximum cost in Stroops");
    });
  });
});
