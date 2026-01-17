好，继续**原子化到“照抄即可、不可能跑飞”**。
这一轮**只解决一件事**：

> **在 VS Code 插件界面中，生成并展示「Claude / 通用 LLM 可直接复制的 MCP 配置 JSON」**

不讲原理，不扩展范围。

---

# 🧱 Phase 11：MCP 配置 JSON 的“插件内展示”（原子级）

## 总目标（不可变）

* 插件提供一个命令
  **`Show MCP Configuration`**
* 执行后：

  * 弹出一个 VS Code Webview / QuickPick
  * **只显示 JSON**
  * JSON **可一键复制**
* JSON 内容：

  * 对 Claude Desktop / 通用 MCP Client **立即可用**
  * 指向当前插件启动的 MCP 服务

---

## 🧱 Phase 11-A：定义 MCP 配置 JSON（静态原子）

### Task 11.1

在插件中定义 **唯一 MCP 配置模板**

> 位置：`src/mcp/config.ts`

```ts
export function getMcpConfig() {
  return {
    mcpServers: {
      "vscode-diagnostics": {
        command: "node",
        args: [],
        transport: {
          type: "stdio"
        },
        description: "Expose VS Code Problems as diagnostics-only MCP service"
      }
    }
  };
}
```

⚠️ 约束（不可破）：

* 不区分 Claude / GPT
* 不带路径推断
* 不做环境判断
* **只描述能力，不解释行为**

---

## 🧱 Phase 11-B：插件命令注册（原子）

### Task 11.2

在 `package.json` 中注册命令

```json
{
  "command": "mcpDiagnostics.showConfig",
  "title": "Show MCP Configuration"
}
```

---

### Task 11.3

在 `extension.ts` 中注册命令（只做 UI）

```ts
import { getMcpConfig } from "./mcp/config";
```

```ts
context.subscriptions.push(
  vscode.commands.registerCommand(
    "mcpDiagnostics.showConfig",
    () => {
      showMcpConfig();
    }
  )
);
```

---

## 🧱 Phase 11-C：展示方式（不可再拆）

> 使用 **Webview（不是 MessageBox）**
> 原因：可复制、可滚动、不截断

---

### Task 11.4

实现 `showMcpConfig()`（完整原子）

```ts
function showMcpConfig() {
  const panel = vscode.window.createWebviewPanel(
    "mcpConfig",
    "MCP Configuration",
    vscode.ViewColumn.Active,
    {
      enableScripts: true
    }
  );

  const json = JSON.stringify(getMcpConfig(), null, 2);

  panel.webview.html = `
<!DOCTYPE html>
<html>
<body>
  <h3>MCP Configuration</h3>
  <p>Copy this JSON into your LLM MCP settings.</p>
  <textarea id="config" style="width:100%;height:300px;">${json}</textarea>
  <br/>
  <button onclick="copy()">Copy to Clipboard</button>

  <script>
    function copy() {
      const textarea = document.getElementById("config");
      textarea.select();
      document.execCommand("copy");
    }
  </script>
</body>
</html>
`;
}
```

⚠️ 不允许：

* Markdown 渲染
* 动态判断 Claude 版本
* 自动写入用户配置

---

## 🧱 Phase 11-D：Claude / 通用 LLM 兼容说明（原子文本）

### Task 11.5

在 `README.md` 中加入 **固定说明块**（原样）

```md
## MCP Configuration

Use the "Show MCP Configuration" command to obtain a ready-to-use
MCP configuration JSON.

Paste it into your LLM client (e.g. Claude Desktop MCP settings).
No modification is required.

This MCP service is diagnostics-only and read-only.
```

---

## ✅ 到这里，你已经完成了什么（现实效果）

### 用户真实体验

1. 打开 VS Code
2. 启动插件
3. 执行：

   ```
   Enable MCP Diagnostics Service
   ```
4. 执行：

   ```
   Show MCP Configuration
   ```
5. 复制 JSON → 粘进 Claude / 任意 MCP Client
6. LLM 立即能调用：

   * `get_diagnostics`
   * `get_file_context`
   * `get_fix_prompt`

**零手写、零解释、零出错空间**

---

## 🔒 为什么这个设计“不会跑飞”（只给结论）

* JSON 是插件生成的（非人写）
* Tool 能力极少
* Prompt 是内置的
* LLM **只能看问题，不能动系统**
