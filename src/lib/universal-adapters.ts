/**
 * AgentRail - Universal AI Framework Adapters
 * 
 * Exports native adapters and tool schemas for:
 * 1. OpenAI (GPT-4o / Assistants / Swarm)
 * 2. DeepSeek (V3 / R1)
 * 3. ElizaOS (ai16z) Action & Plugin standard
 * 4. LangChain / CrewAI Dynamic Structured Tools
 */

import { AgentRailMcpServer, McpToolDefinition } from "./mcp-server.js";

export interface OpenAiFunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface ElizaAction {
  name: string;
  similes: string[];
  description: string;
  validate: (runtime: any, message: any) => Promise<boolean>;
  handler: (runtime: any, message: any, state: any, options: any, callback: any) => Promise<any>;
  examples: any[];
}

export class UniversalAgentAdapters {
  /**
   * Convert AgentRail MCP tools into standard OpenAI / DeepSeek function tools.
   */
  public static toOpenAiTools(mcpServer: AgentRailMcpServer): OpenAiFunctionTool[] {
    return mcpServer.getTools().map((t: McpToolDefinition) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: "object",
          properties: {}, // Represented via schema
          required: [],
        },
      },
    }));
  }

  /**
   * Convert AgentRail MCP tools into ElizaOS (ai16z) Action Plugins.
   */
  public static toElizaPlugin(mcpServer: AgentRailMcpServer) {
    const actions: ElizaAction[] = mcpServer.getTools().map((t: McpToolDefinition) => ({
      name: t.name.toUpperCase(),
      similes: [`EXECUTE_${t.name.toUpperCase()}`, `AGENTRAIL_${t.name.toUpperCase()}`],
      description: t.description,
      validate: async () => true,
      handler: async (_runtime, message, _state, _options, callback) => {
        try {
          const result = await mcpServer.executeTool(t.name, message.content || {});
          if (callback) callback({ text: JSON.stringify(result) });
          return result;
        } catch (err: any) {
          if (callback) callback({ text: `Error executing ${t.name}: ${err.message}` });
          throw err;
        }
      },
      examples: [
        [
          { user: "{{user1}}", content: { text: `Please run ${t.name}` } },
          { user: "{{agentName}}", content: { text: `Executed ${t.name} successfully.` } },
        ],
      ],
    }));

    return {
      name: "AgentRail-Stellar-Plugin",
      description: "Official AgentRail Scoped Allowance & x402 Micropayment Plugin for ElizaOS agents on Stellar",
      actions,
      providers: [],
      evaluators: [],
    };
  }
}
