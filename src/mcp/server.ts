import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export type DiagnosticItem = {
  file: string;
  line: number;
  character: number;
  severity: "error" | "warning" | "info" | "hint";
  source?: string;
  message: string;
};

export type DiagnosticsProvider = () => DiagnosticItem[];
export type FileProvider = (path: string) => string;

const FIX_PROMPT = `You are a diagnostics-driven code fixer.

You must only act based on diagnostics explicitly provided
by the get_diagnostics tool.

Rules:
- Do not guess missing context.
- Do not refactor or redesign.
- Do not change public APIs unless diagnostics require it.
- Do not suppress errors by disabling checks or using unsafe shortcuts.
- The goal is to make the diagnostics disappear.

Workflow:
1. Call get_diagnostics.
2. Select which diagnostics to fix.
3. If needed, call get_file_context.
4. Produce a fix.

Output:
- Output git unified diff only.
- No explanations unless explicitly requested.
`;

export function createMcpServer(
  getDiagnostics: DiagnosticsProvider,
  getFileContent: FileProvider
): Server {
  const server = new Server(
    { name: "vscode-mcp-diagnostics", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  // Register listTools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "get_diagnostics",
          description: `Get all current diagnostics (errors, warnings, hints)
from the active VS Code workspace.

The diagnostics are directly provided by language servers
and reflect the exact content shown in VS Code's Problems panel.

No filtering or interpretation is applied.
The caller must decide which diagnostics to act on.`,
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "get_file_context",
          description: `Retrieve the full content of a source file
from the current VS Code workspace.

This tool should be used only when diagnostics
reference a file and code context is required.`,
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string" },
            },
            required: ["path"],
          },
        },
        {
          name: "get_fix_prompt",
          description: "Get the built-in diagnostics fixing prompt.",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    };
  });

  // Register callTool handler
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;

    switch (name) {
      case "get_diagnostics":
        return {
          content: [{ type: "text", text: JSON.stringify(getDiagnostics(), null, 2) }],
        };

      case "get_file_context":
        return {
          content: [
            {
              type: "text",
              text: getFileContent((args as { path: string }).path),
            },
          ],
        };

      case "get_fix_prompt":
        return {
          content: [{ type: "text", text: FIX_PROMPT }],
        };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  return server;
}
