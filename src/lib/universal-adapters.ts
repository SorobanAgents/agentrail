/**
 * AgentRail - Universal AI Framework Adapters
 * 
 * Exports native adapters and tool schemas for:
 * 1. OpenAI (GPT-4o / Assistants / Swarm)
 * 2. DeepSeek (V3 / R1)
 * 3. ElizaOS (ai16z) Action & Plugin standard
 * 4. LangChain / CrewAI Dynamic Structured Tools
 * 5. Google Gemini (1.5 / 2.0 / @google/genai) FunctionDeclaration standard
 */

import { z } from "zod";
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

/**
 * Standard data types supported by Google Gemini FunctionCalling Schema.
 */
export enum GeminiType {
  TYPE_UNSPECIFIED = "TYPE_UNSPECIFIED",
  STRING = "STRING",
  NUMBER = "NUMBER",
  INTEGER = "INTEGER",
  BOOLEAN = "BOOLEAN",
  ARRAY = "ARRAY",
  OBJECT = "OBJECT",
}

/**
 * Schema definition matching official Google Gemini / @google/genai format.
 */
export interface GeminiSchema {
  type: GeminiType | string;
  format?: string;
  description?: string;
  nullable?: boolean;
  enum?: string[];
  items?: GeminiSchema;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
}

/**
 * Function declaration structure for Google Gemini 1.5/2.0 Tool Calling.
 */
export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: GeminiSchema;
}

/**
 * Converts a Zod schema tree into a compliant GeminiSchema object.
 */
export function zodToGeminiSchema(schema: z.ZodTypeAny): GeminiSchema {
  let current: any = schema;
  let description: string | undefined = current.description;
  let isNullable = false;

  // Unwrap modifiers while preserving descriptions and nullability
  while (
    current instanceof z.ZodOptional ||
    current instanceof z.ZodNullable ||
    current instanceof z.ZodDefault ||
    current instanceof z.ZodEffects
  ) {
    if (current instanceof z.ZodNullable) {
      isNullable = true;
    }
    if (!description && current.description) {
      description = current.description;
    }
    const def = current._def as any;
    current = def.innerType || def.schema;
  }
  if (!description && current.description) {
    description = current.description;
  }

  // String
  if (current instanceof z.ZodString) {
    const res: GeminiSchema = { type: GeminiType.STRING };
    if (description) res.description = description;
    if (isNullable) res.nullable = true;
    return res;
  }

  // Number / Integer
  if (current instanceof z.ZodNumber) {
    const isInt = current._def.checks?.some((c: any) => c.kind === "int");
    const res: GeminiSchema = { type: isInt ? GeminiType.INTEGER : GeminiType.NUMBER };
    if (description) res.description = description;
    if (isNullable) res.nullable = true;
    return res;
  }

  // Boolean
  if (current instanceof z.ZodBoolean) {
    const res: GeminiSchema = { type: GeminiType.BOOLEAN };
    if (description) res.description = description;
    if (isNullable) res.nullable = true;
    return res;
  }

  // Enum
  if (current instanceof z.ZodEnum) {
    const res: GeminiSchema = {
      type: GeminiType.STRING,
      enum: current._def.values,
    };
    if (description) res.description = description;
    if (isNullable) res.nullable = true;
    return res;
  }

  // Array
  if (current instanceof z.ZodArray) {
    const itemSchema = zodToGeminiSchema(current.element || current._def.type);
    const res: GeminiSchema = {
      type: GeminiType.ARRAY,
      items: itemSchema,
    };
    if (description) res.description = description;
    if (isNullable) res.nullable = true;
    return res;
  }

  // Object
  if (current instanceof z.ZodObject) {
    const shape = current.shape;
    const properties: Record<string, GeminiSchema> = {};
    const required: string[] = [];

    for (const [key, propSchema] of Object.entries(shape)) {
      const prop = propSchema as z.ZodTypeAny;
      properties[key] = zodToGeminiSchema(prop);

      // Check whether property is required (not optional and not defaulted)
      const isOptional =
        prop instanceof z.ZodOptional ||
        (typeof (prop as any).isOptional === "function" && (prop as any).isOptional()) ||
        prop instanceof z.ZodDefault;

      if (!isOptional) {
        required.push(key);
      }
    }

    const res: GeminiSchema = {
      type: GeminiType.OBJECT,
      properties,
    };
    if (required.length > 0) res.required = required;
    if (description) res.description = description;
    if (isNullable) res.nullable = true;
    return res;
  }

  // Default Fallback
  const fallback: GeminiSchema = { type: GeminiType.STRING };
  if (description) fallback.description = description;
  if (isNullable) fallback.nullable = true;
  return fallback;
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

  /**
   * Convert AgentRail MCP tools into Google Gemini 1.5/2.0 FunctionDeclaration schema format.
   * Compatible with @google/genai and Vertex AI SDK tool definitions.
   *
   * @param target AgentRailMcpServer instance or list of McpToolDefinition objects
   * @returns Array of GeminiFunctionDeclaration objects
   */
  public static toGeminiDeclarations(
    target: AgentRailMcpServer | McpToolDefinition[]
  ): GeminiFunctionDeclaration[] {
    const tools = Array.isArray(target) ? target : target.getTools();
    return tools.map((t: McpToolDefinition) => {
      let parameters: GeminiSchema | undefined;
      if (t.inputSchema) {
        parameters = zodToGeminiSchema(t.inputSchema);
      }
      return {
        name: t.name,
        description: t.description,
        ...(parameters ? { parameters } : {}),
      };
    });
  }
}
