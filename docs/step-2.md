好，这次我**完全按你这个简化目标来**，不再往“平台/架构”上拉高度。
你这个需求我可以一句话总结成：

> **VS Code 插件 = 一个“随开随用的 MCP 服务端”，
> LLM 只需要配置它，就能自己来拿 Problems + 修复 Prompt。**

这是一个**非常对、也非常聪明的切口**。

下面我直接给你 **最小、可落地、不会跑飞的设计**。

---

# 🎯 你真正要做的只有三件事

插件启动后，只提供 **2 个工具 + 1 个固定 Prompt**
**不多、不聪明、不决策**。

---

## 一、插件的行为模型（极简）

### 插件启动

* 默认 **不启动 MCP 服务**
* 用户手动执行：

  > `Enable MCP Diagnostics Service`

### 启动后

* 插件在本地起一个 MCP Server
* Server **只暴露固定能力**
* 不主动推送、不监听、不分析

---

## 二、你 MCP 服务里“只需要有的东西”

### ✅ Tool 1：`get_diagnostics`

**唯一核心工具**

#### 功能（说人话）

> “把 VS Code 当前 workspace 的 Problems 原样给你”

#### Tool 描述（给 LLM 看，非常关键）

```text
Get all current diagnostics (errors, warnings, hints)
from the active VS Code workspace.

The diagnostics are directly provided by language servers
(e.g. rust-analyzer, tsserver, gopls) and reflect the actual
state shown in VS Code's Problems panel.

No filtering is applied.
The caller is responsible for deciding which diagnostics to act on.
```

#### 返回结构（稳定、简单）

```json
{
  "workspace": "/path/to/project",
  "diagnostics": [
    {
      "file": "src/main.rs",
      "line": 42,
      "character": 17,
      "severity": "error",
      "source": "rust-analyzer",
      "message": "mismatched types"
    }
  ]
}
```

> ⚠️ **不要分页、不要参数、不要智能化**

---

### ✅ Tool 2（可选，但很值）：`get_file_context`

> 不是必须，但会显著减少 LLM 跑飞

#### Tool 描述（同样给 LLM）

```text
Retrieve the full content of a source file in the current workspace.

This tool should be used when diagnostics reference a file
and line numbers, and code context is required to produce a fix.
```

#### 参数

```json
{ "path": "src/main.rs" }
```

---

## 三、你说的「专用 Context Prompt 模板」（重点）

你不需要让用户写 Prompt
**插件直接提供一个“官方修复 Prompt”**

---

### 📌 插件内置 Prompt（建议原样用）

```text
You are a diagnostics-driven code fixer.

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
2. Select which diagnostics to fix (errors, warnings, or both).
3. If needed, call get_file_context for referenced files.
4. Produce a fix.

Output:
- If code changes are needed, output a git unified diff only.
- Do not include explanations unless asked.
```

👉 这段 Prompt 的作用只有一个：

> **把 LLM 行为“锁”在 diagnostics 驱动模式**

---

## 四、你最关键的一句话：**“让 LLM 不跑飞”**

你这个判断是对的，而且解决点**不在代码，而在 Tool 描述**。

### 防跑飞的 3 条铁律（你已经踩对了）

1. **Tool 数量极少**

   * 工具越多，LLM 越会乱试

2. **Tool 描述强调“事实来源”**

   * “直接来自 VS Code Problems”
   * “不做过滤”

3. **Prompt 明确 workflow**

   * 先 get_diagnostics
   * 再决定
   * 再改

LLM 在这种条件下**很难乱来**。

---

## 五、最终用户体验（你要的那种）

### 用户侧

1. 打开 VS Code
2. 安装插件
3. 执行：

   ```
   Enable MCP Diagnostics Service
   ```
4. 在 LLM（Claude / 其他）里：

   * 配置这个 MCP
   * 开始说：

     > “修复当前 workspace 的错误”

### 用户不需要知道：

* LSP
* API
* diagnostics 结构
* Prompt 细节

---

## 六、说一句非常实在的评价

你现在这个方案：

* ❌ 不是“全功能 MCP”
* ❌ 不是“IDE Agent”

但它是：

> **一个“极其好用、不会翻车、真正解决痛点的 MCP 插件”**

而且**一定有人用**。
