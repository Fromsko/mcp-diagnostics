import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as vscode from "vscode";
import { getMcpConfig } from "./mcp/config";
import { createMcpServer, DiagnosticItem } from "./mcp/server";

let mcpServer: Server | null = null;

/**
 * Collect all diagnostics from VS Code workspace
 */
function collectDiagnostics(): DiagnosticItem[] {
  const entries = vscode.languages.getDiagnostics();
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";

  const result: DiagnosticItem[] = [];

  for (const [uri, diagnostics] of entries) {
    for (const d of diagnostics) {
      result.push({
        file: uri.fsPath.replace(workspace + "/", "").replace(workspace + "\\", ""),
        line: d.range.start.line,
        character: d.range.start.character,
        severity:
          d.severity === vscode.DiagnosticSeverity.Error
            ? "error"
            : d.severity === vscode.DiagnosticSeverity.Warning
              ? "warning"
              : d.severity === vscode.DiagnosticSeverity.Information
                ? "info"
                : "hint",
        source: d.source,
        message: d.message,
      });
    }
  }

  return result;
}

/**
 * Read file content from workspace
 */
function readFileContent(path: string): string {
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspace) {
    throw new Error("No workspace");
  }

  const fullPath = vscode.Uri.joinPath(vscode.Uri.file(workspace), path);

  // Use synchronous file read via fs
  const fs = require("fs");
  const data = fs.readFileSync(fullPath.fsPath, "utf8");
  return data;
}

/**
 * Start the MCP Server
 */
function startMcpServer(): Server {
  const server = createMcpServer(collectDiagnostics, readFileContent);

  const transport = new StdioServerTransport();
  server.connect(transport);

  vscode.window.showInformationMessage("MCP Diagnostics Service started");

  return server;
}

/**
 * Stop the MCP Server
 */
function stopMcpServer(server: Server | null): void {
  if (server) {
    server.close();
    vscode.window.showInformationMessage("MCP Diagnostics Service stopped");
  }
}

/**
 * Show MCP Configuration in Webview
 */
function showMcpConfig(): void {
  const panel = vscode.window.createWebviewPanel(
    "mcpConfig",
    "MCP Configuration",
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
    }
  );

  const json = JSON.stringify(getMcpConfig(), null, 2);

  panel.webview.html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    h3 {
      margin-bottom: 10px;
    }
    p {
      margin-bottom: 15px;
      color: var(--vscode-descriptionForeground);
    }
    textarea {
      width: 100%;
      height: 300px;
      font-family: monospace;
      font-size: 14px;
      padding: 10px;
      border: 1px solid var(--vscode-input-border);
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      resize: vertical;
    }
    button {
      margin-top: 10px;
      padding: 8px 16px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      cursor: pointer;
    }
    button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    .success {
      color: var(--vscode-charts-green);
      margin-left: 10px;
      display: none;
    }
  </style>
</head>
<body>
  <h3>MCP Configuration</h3>
  <p>Copy this JSON into your LLM MCP settings (e.g. Claude Desktop).</p>
  <textarea id="config" readonly>${json}</textarea>
  <br/>
  <button onclick="copy()">Copy to Clipboard</button>
  <span class="success" id="success">Copied!</span>

  <script>
    function copy() {
      const textarea = document.getElementById("config");
      textarea.select();
      document.execCommand("copy");

      const success = document.getElementById("success");
      success.style.display = "inline";
      setTimeout(() => {
        success.style.display = "none";
      }, 2000);
    }
  </script>
</body>
</html>
`;
}

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext): void {
  // Register toggle command
  context.subscriptions.push(
    vscode.commands.registerCommand("mcpDiagnostics.toggle", () => {
      if (mcpServer) {
        stopMcpServer(mcpServer);
        mcpServer = null;
      } else {
        mcpServer = startMcpServer();
      }
    })
  );

  // Register show config command
  context.subscriptions.push(
    vscode.commands.registerCommand("mcpDiagnostics.showConfig", () => {
      showMcpConfig();
    })
  );

  console.log("MCP Diagnostics extension is now active");
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
  if (mcpServer) {
    stopMcpServer(mcpServer);
    mcpServer = null;
  }
}
