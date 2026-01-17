好，继续。
下面我**只做一件事**：
👉 **把你上一步 Phase 3–7 中“还没落到代码的部分”，进一步原子化到“复制即写、写完即完”级别**。
**不解释、不扩展、不合并任务。**

---

# 🧱 Phase 8：MCP Server 代码骨架（不可再拆）

> 目标：
> `src/mcp/server.ts` 能被插件启动
> MCP tools 能被 LLM 正确识别
> **不依赖 VS Code API**

---

## Task 8.1

创建目录与文件（一次性）

```bash
mkdir -p src/mcp
touch src/mcp/server.ts
```

---

## Task 8.2

在 `src/mcp/server.ts` 写入 **最小 MCP Server 结构**

> ⚠️ 不允许引入 VS Code
> ⚠️ 不允许实现业务逻辑

```ts
import { Server } from "@modelcontextprotocol/sdk/server";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types";

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

export function createMcpServer(
  getDiagnostics: DiagnosticsProvider,
  getFileContent: FileProvider
): Server {
  const server = new Server(
    { name: "vscode-mcp-diagnostics", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  return server;
}
```

> ✅ 结束条件：文件能被 TypeScript 编译
> ❌ 不注册 tool

---

## Task 8.3

注册 `listTools`（**必须先于 callTool**）

在 `createMcpServer` 内部追加：

```ts
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
```

---

## Task 8.4

注册 `callTool`（严格 switch，不兜底）

继续在 `createMcpServer` 内追加：

```ts
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

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  switch (name) {
    case "get_diagnostics":
      return {
        content: [{ type: "json", value: getDiagnostics() }],
      };

    case "get_file_context":
      return {
        content: [
          {
            type: "text",
            text: getFileContent((args as any).path),
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
```

---

## Task 8.5

在函数末尾返回 server

```ts
return server;
```

---

# 🧱 Phase 9：VS Code 插件侧 Diagnostics 注入（原子）

> 目标：
> 插件负责 **唯一事实来源**
> MCP Server 完全被动

---

## Task 9.1

在 `extension.ts` 顶部引入依赖

```ts
import * as vscode from "vscode";
import { createMcpServer, DiagnosticItem } from "./mcp/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
```

---

## Task 9.2

实现 diagnostics 收集函数（不可拆）

```ts
function collectDiagnostics(): DiagnosticItem[] {
  const entries = vscode.languages.getDiagnostics();
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";

  const result: DiagnosticItem[] = [];

  for (const [uri, diagnostics] of entries) {
    for (const d of diagnostics) {
      result.push({
        file: uri.fsPath.replace(workspace + "/", ""),
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
```

---

## Task 9.3

实现文件读取函数（严格限制）

```ts
function readFileContent(path: string): string {
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspace) throw new Error("No workspace");

  const fullPath = vscode.Uri.joinPath(
    vscode.Uri.file(workspace),
    path
  );

  const data = vscode.workspace.fs.readFile(fullPath);
  return Buffer.from(data as any).toString("utf8");
}
```

> ❌ 不做 glob
> ❌ 不 try/catch
> ❌ 不容错

---

# 🧱 Phase 10：MCP Server 启停绑定（最终闭环）

---

## Task 10.1

在 `extension.ts` 中实现 `startMcpServer`

```ts
function startMcpServer() {
  const server = createMcpServer(
    collectDiagnostics,
    readFileContent
  );

  const transport = new StdioServerTransport();
  server.connect(transport);

  vscode.window.showInformationMessage(
    "MCP Diagnostics Service started"
  );

  return server;
}
```

---

## Task 10.2

实现 `stopMcpServer`

```ts
function stopMcpServer(server: any) {
  server?.close();
  vscode.window.showInformationMessage(
    "MCP Diagnostics Service stopped"
  );
}
```

---

## Task 10.3

在命令中做 toggle（无逻辑扩展）

```ts
let mcpServer: any = null;

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
```

---

# ✅ 到这里你已经“完成了什么”

* 一个 **真正能被 LLM 配置的 MCP 服务**
* VS Code = Context Provider
* MCP = 只读事实桥
* Prompt = 内置、稳定、不可篡改
* **LLM 只会：**

  * 先拿 diagnostics
  * 再决定修什么
  * 不可能乱跑 shell
