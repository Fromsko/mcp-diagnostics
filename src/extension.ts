import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import * as http from "http";
import * as vscode from "vscode";
import { getMcpConfig } from "./mcp/config";
import { createMcpServer, DiagnosticItem, FIX_PROMPT } from "./mcp/server";

let mcpServer: Server | null = null;
let httpServer: http.Server | null = null;
let currentPort: number | null = null;
let sidebarProvider: McpSidebarProvider;
let activeTransports: Map<string, SSEServerTransport> = new Map();

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

  const fs = require("fs");
  const data = fs.readFileSync(fullPath.fsPath, "utf8");
  return data;
}

/**
 * Start the MCP Server with HTTP transport
 */
async function startMcpServer(port?: number): Promise<{ server: Server; port: number }> {
  const mcpSrv = createMcpServer(collectDiagnostics, readFileContent);

  return new Promise((resolve, reject) => {
    const srv = http.createServer(async (req, res) => {
      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || "/", `http://localhost`);

      // SSE endpoint - establish connection
      if (req.method === "GET" && url.pathname === "/sse") {
        const transport = new SSEServerTransport("/message", res);
        activeTransports.set(transport.sessionId, transport);

        transport.onclose = () => {
          activeTransports.delete(transport.sessionId);
        };

        await mcpSrv.connect(transport);
        await transport.start();
        return;
      }

      // Message endpoint - receive messages
      if (req.method === "POST" && url.pathname === "/message") {
        const sessionId = url.searchParams.get("sessionId");
        if (!sessionId) {
          res.writeHead(400);
          res.end("Missing sessionId");
          return;
        }

        const transport = activeTransports.get(sessionId);
        if (!transport) {
          res.writeHead(404);
          res.end("Session not found");
          return;
        }

        await transport.handlePostMessage(req, res);
        return;
      }

      // Health check
      if (req.method === "GET" && url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", sessions: activeTransports.size }));
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    const targetPort = port || 0; // 0 = random port
    srv.listen(targetPort, "127.0.0.1", () => {
      const addr = srv.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : targetPort;
      httpServer = srv;
      currentPort = actualPort;
      vscode.window.showInformationMessage(`MCP Diagnostics Service started on port ${actualPort}`);
      resolve({ server: mcpSrv, port: actualPort });
    });

    srv.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Stop the MCP Server
 */
function stopMcpServer(server: Server | null): void {
  // Close all active transports
  for (const transport of activeTransports.values()) {
    transport.close();
  }
  activeTransports.clear();

  // Close HTTP server
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }

  if (server) {
    server.close();
  }

  currentPort = null;
  vscode.window.showInformationMessage("MCP Diagnostics Service stopped");
}

/**
 * Sidebar Webview Provider
 */
class McpSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "mcpDiagnostics.panel";
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) { }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    this._updateWebview();

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "toggle":
          vscode.commands.executeCommand("mcpDiagnostics.toggle");
          break;
        case "showConfig":
          vscode.commands.executeCommand("mcpDiagnostics.showConfig");
          break;
        case "copyConfig":
          const config = JSON.stringify(getMcpConfig(currentPort), null, 2);
          vscode.env.clipboard.writeText(config);
          break;
        case "copyPrompt":
          vscode.env.clipboard.writeText(FIX_PROMPT);
          break;
        case "setPort":
          const port = message.port;
          const vsConfig = vscode.workspace.getConfiguration("mcpDiagnostics");
          await vsConfig.update("port", port, vscode.ConfigurationTarget.Global);
          break;
      }
    });
  }

  public refresh() {
    if (this._view) {
      this._updateWebview();
    }
  }

  private _updateWebview() {
    if (!this._view) return;

    const diagnostics = collectDiagnostics();
    const isRunning = mcpServer !== null;
    const config = JSON.stringify(getMcpConfig(currentPort), null, 2);
    const vsConfig = vscode.workspace.getConfiguration("mcpDiagnostics");
    const configuredPort = vsConfig.get<number>("port") || 0;

    const errorCount = diagnostics.filter((d) => d.severity === "error").length;
    const warningCount = diagnostics.filter((d) => d.severity === "warning").length;

    this._view.webview.html = this._getHtmlContent(
      isRunning,
      errorCount,
      warningCount,
      diagnostics.length,
      config,
      currentPort,
      configuredPort
    );
  }

  private _getHtmlContent(
    isRunning: boolean,
    errorCount: number,
    warningCount: number,
    totalCount: number,
    config: string,
    port: number | null,
    configuredPort: number
  ): string {
    const portDisplay = port ? `Port: ${port}` : "Not started";
    const escapedConfig = config.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 10px;
      margin: 0;
    }
    .section {
      margin-bottom: 16px;
    }
    .section-title {
      font-weight: bold;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      border-radius: 4px;
      background: var(--vscode-editor-inactiveSelectionBackground);
    }
    .status-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .status-port {
      font-size: 11px;
      opacity: 0.8;
      font-family: monospace;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .status-dot.running {
      background: #4caf50;
      box-shadow: 0 0 6px #4caf50;
    }
    .status-dot.stopped {
      background: #f44336;
    }
    .port-input-group {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    .port-input {
      flex: 1;
      padding: 6px 8px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-size: 12px;
    }
    .port-input::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }
    .port-btn {
      padding: 6px 12px;
      width: auto;
      margin: 0;
    }
    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .stat-card {
      padding: 10px;
      border-radius: 4px;
      text-align: center;
      background: var(--vscode-editor-inactiveSelectionBackground);
    }
    .stat-value {
      font-size: 24px;
      font-weight: bold;
    }
    .stat-value.error { color: #f44336; }
    .stat-value.warning { color: #ff9800; }
    .stat-label {
      font-size: 11px;
      opacity: 0.8;
    }
    button {
      width: 100%;
      padding: 8px 12px;
      margin-top: 8px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    /* Mac-style code block */
    .code-window {
      border-radius: 8px;
      overflow: hidden;
      background: #1e1e1e;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .code-header {
      background: #323232;
      padding: 8px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .code-dots {
      display: flex;
      gap: 6px;
    }
    .code-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
    .code-dot.red { background: #ff5f56; }
    .code-dot.yellow { background: #ffbd2e; }
    .code-dot.green { background: #27ca40; }
    .code-title {
      font-size: 12px;
      color: #999;
      font-family: monospace;
    }
    .code-copy {
      background: transparent;
      border: none;
      color: #999;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      width: auto;
      margin: 0;
    }
    .code-copy:hover {
      background: rgba(255,255,255,0.1);
      color: #fff;
    }
    .code-content {
      padding: 12px;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      font-size: 11px;
      line-height: 1.5;
      color: #d4d4d4;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .tools-list {
      font-size: 12px;
    }
    .tool-item {
      padding: 4px 0;
      border-bottom: 1px solid var(--vscode-widget-border);
    }
    .tool-name {
      font-weight: bold;
      color: var(--vscode-textLink-foreground);
    }
    .btn-row {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    .btn-row button {
      flex: 1;
      margin: 0;
    }
    .toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
    }
    .toast {
      padding: 12px 16px;
      border-radius: 4px;
      margin-bottom: 8px;
      color: white;
      background: #4caf50;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      animation: slideIn 0.3s, fadeOut 0.5s ease-in 2.5s forwards;
      max-width: 300px;
      word-wrap: break-word;
    }
    .toast.error {
      background: #f44336;
    }
    .toast.info {
      background: #2196f3;
    }
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
  </style>
</head>
<body>
  <div class="toast-container" id="toastContainer"></div>
  <div class="section">
    <div class="section-title">⚡ Service Status</div>
    <div class="status">
      <span class="status-dot ${isRunning ? "running" : "stopped"}"></span>
      <div class="status-info">
        <span>${isRunning ? "Running" : "Stopped"}</span>
        <span class="status-port">${portDisplay}</span>
      </div>
    </div>
    <div class="port-input-group">
      <input type="number" class="port-input" id="portInput" placeholder="Port (0=random)" value="${configuredPort || ''}" min="0" max="65535">
      <button class="port-btn" onclick="savePort()">Save</button>
    </div>
    <button onclick="toggle()">
      ${isRunning ? "⏹ Stop Service" : "▶ Start Service"}
    </button>
  </div>

  <div class="section">
    <div class="section-title">📊 Diagnostics</div>
    <div class="stats">
      <div class="stat-card">
        <div class="stat-value error">${errorCount}</div>
        <div class="stat-label">Errors</div>
      </div>
      <div class="stat-card">
        <div class="stat-value warning">${warningCount}</div>
        <div class="stat-label">Warnings</div>
      </div>
    </div>
    <div style="text-align: center; margin-top: 8px; opacity: 0.7; font-size: 12px;">
      Total: ${totalCount} issues
    </div>
  </div>

  <div class="section">
    <div class="section-title">🔧 MCP Tools</div>
    <div class="tools-list">
      <div class="tool-item">
        <span class="tool-name">get_diagnostics</span>
        <div>Get all VS Code problems</div>
      </div>
      <div class="tool-item">
        <span class="tool-name">get_file_context</span>
        <div>Read source file content</div>
      </div>
      <div class="tool-item">
        <span class="tool-name">get_fix_prompt</span>
        <div>Get fixing prompt template</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">📋 MCP Config</div>
    <div class="code-window">
      <div class="code-header">
        <div class="code-dots">
          <span class="code-dot red"></span>
          <span class="code-dot yellow"></span>
          <span class="code-dot green"></span>
        </div>
        <span class="code-title">mcp-config.json</span>
        <button class="code-copy" onclick="copyConfig()">Copy</button>
      </div>
      <div class="code-content">${escapedConfig}</div>
    </div>
    <div class="btn-row">
      <button class="secondary" onclick="copyConfig()">📋 Config</button>
      <button class="secondary" onclick="copyPrompt()">💡 Fix Prompt</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function showToast(message, type = 'info') {
      const container = document.getElementById('toastContainer');
      const toast = document.createElement('div');
      toast.className = 'toast ' + type;
      toast.textContent = message;
      container.appendChild(toast);

      setTimeout(() => {
        toast.remove();
      }, 3000);
    }

    function toggle() {
      vscode.postMessage({ command: 'toggle' });
      setTimeout(() => location.reload(), 500);
    }
    function showConfig() {
      vscode.postMessage({ command: 'showConfig' });
    }
    function copyConfig() {
      vscode.postMessage({ command: 'copyConfig' });
      showToast('Config copied!');
    }
    function copyPrompt() {
      vscode.postMessage({ command: 'copyPrompt' });
      showToast('Fix prompt copied!');
    }
    function savePort() {
      const port = parseInt(document.getElementById('portInput').value) || 0;
      vscode.postMessage({ command: 'setPort', port: port });
      showToast('Port saved: ' + (port || 'random'));
    }
  </script>
</body>
</html>`;
  }
}

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext): void {
  // Register sidebar provider
  sidebarProvider = new McpSidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      McpSidebarProvider.viewType,
      sidebarProvider
    )
  );

  // Register toggle command
  context.subscriptions.push(
    vscode.commands.registerCommand("mcpDiagnostics.toggle", async () => {
      if (mcpServer) {
        stopMcpServer(mcpServer);
        mcpServer = null;
      } else {
        try {
          // Read port from configuration
          const config = vscode.workspace.getConfiguration("mcpDiagnostics");
          const configuredPort = config.get<number>("port") || 0;
          const result = await startMcpServer(configuredPort || undefined);
          mcpServer = result.server;
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to start MCP server: ${err}`);
        }
      }
      sidebarProvider.refresh();
    })
  );

  // Register show config command
  context.subscriptions.push(
    vscode.commands.registerCommand("mcpDiagnostics.showConfig", () => {
      const panel = vscode.window.createWebviewPanel(
        "mcpConfig",
        "MCP Configuration",
        vscode.ViewColumn.Active,
        { enableScripts: true }
      );

      const json = JSON.stringify(getMcpConfig(currentPort), null, 2);

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
    h3 { margin-bottom: 10px; }
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
</html>`;
    })
  );

  // Register refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand("mcpDiagnostics.refresh", () => {
      sidebarProvider.refresh();
    })
  );

  // Listen to diagnostics changes
  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics(() => {
      sidebarProvider.refresh();
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
