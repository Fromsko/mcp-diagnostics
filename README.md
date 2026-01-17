# MCP Diagnostics Service

A VS Code extension that exposes diagnostics (Problems panel) as an MCP service for LLM integration.

## Features

- **MCP Server**: Start a local MCP server that LLMs can connect to
- **Get Diagnostics**: Retrieve all current errors, warnings, and hints from VS Code
- **Get File Context**: Read source files for code context
- **Built-in Fix Prompt**: Pre-configured prompt for diagnostics-driven code fixing

## Usage

### 1. Start the MCP Service

Open Command Palette (`Ctrl+Shift+P`) and run:

```
Enable MCP Diagnostics Service
```

### 2. Get MCP Configuration

Run the command:

```
Show MCP Configuration
```

This will display a ready-to-use MCP configuration JSON.

### 3. Configure Your LLM

Copy the JSON and paste it into your LLM client's MCP settings (e.g., Claude Desktop).

## MCP Configuration

Use the "Show MCP Configuration" command to obtain a ready-to-use
MCP configuration JSON.

Paste it into your LLM client (e.g. Claude Desktop MCP settings).
No modification is required.

This MCP service is diagnostics-only and read-only.

## Available Tools

### `get_diagnostics`

Get all current diagnostics (errors, warnings, hints) from the active VS Code workspace.

### `get_file_context`

Retrieve the full content of a source file from the current VS Code workspace.

### `get_fix_prompt`

Get the built-in diagnostics fixing prompt.

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode
npm run watch
```

## License

MIT
