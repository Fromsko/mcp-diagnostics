# MCP Diagnostics Service

A VS Code extension that exposes diagnostics (Problems panel) as an MCP service for LLM integration.

## Features

- **MCP Server**: Start a local MCP server that LLMs can connect to
- **Get Diagnostics**: Retrieve all current errors, warnings, and hints from VS Code
- **Get File Context**: Read source files for code context
- **Built-in Fix Prompt**: Pre-configured prompt for diagnostics-driven code fixing
- **Sidebar View**: Visual status and control panel for MCP service
- **HTTP SSE Transport**: Uses HTTP Server-Sent Events for reliable communication

## Installation

### Install from VS Code Marketplace

Search for "MCP Diagnostics Service" in VS Code Extensions view and install.

### Install from VSIX Package

```bash
# Build the VSIX package
npm run package:vsix

# Install the package
code --install-extension mcp-diagnostics-*.vsix
```

## Usage

### Start the MCP Service

1. Open VS Code
2. Open the **MCP Diagnostics** sidebar panel from the Activity Bar
3. Click the **Enable MCP Diagnostics Service** button (or run `Ctrl+Shift+P` → `Enable MCP Diagnostics Service`)

### Get MCP Configuration

1. Open Command Palette (`Ctrl+Shift+P`)
2. Run `Show MCP Configuration`
3. Copy the displayed JSON configuration

### Configure Your LLM Client

Paste the configuration into your LLM client's MCP settings:

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "mcp-diagnostics": {
      "transport": {
        "type": "sse",
        "url": "http://localhost:YOUR_PORT"
      }
    }
  }
}
```

Note: Replace `YOUR_PORT` with the actual port number shown in the sidebar panel.

## MCP Configuration

Use the "Show MCP Configuration" command to obtain a ready-to-use MCP configuration JSON.

This MCP service is:
- **Diagnostics-only**: Only provides read access to VS Code diagnostics
- **Read-only**: Cannot modify your code
- **Secure**: Runs locally on your machine with configurable port

## Available Tools

### `get_diagnostics`

Get all current diagnostics (errors, warnings, hints) from the active VS Code workspace.

**Response**: JSON array of all diagnostic items with file paths, line numbers, severity, and messages.

### `get_file_context`

Retrieve the full content of a source file from the current VS Code workspace.

**Parameters**:
- `path` (string): The file path to read

**Response**: Full file contents with line numbers for context.

### `get_fix_prompt`

Get the built-in diagnostics fixing prompt optimized for LLM code assistance.

**Response**: A structured prompt template for diagnostics-driven code fixing.

## Configuration

You can configure the extension in VS Code Settings:

- **Port**: HTTP server port for MCP SSE connection (default: 0 for random port)
  - Setting: `mcpDiagnostics.port`
  - Range: 0-65535 (0 = automatically assign available port)

## Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode (auto-recompile on changes)
npm run watch

# Package for production (minified)
npm run package

# Create VSIX package
npm run package:vsix

# Package and publish to marketplace
npm run publish

# Lint code
npm run lint
```

## Project Structure

```
mcp-diagnostics/
├── src/
│   ├── extension.ts       # VS Code extension entry point
│   └── mcp/
│       ├── server.ts      # MCP server implementation
│       └── config.ts      # MCP configuration utilities
├── resources/
│   └── sidebar.svg        # Sidebar icon
├── esbuild.js             # Build configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # Extension manifest
```

## Building

This project uses `esbuild` for fast TypeScript compilation:

- `npm run compile` → Build `out/extension.js` with source maps
- `npm run package` → Production build with minification
- `npm run watch` → Watch mode for development

The extension is bundled into a single CommonJS module with `vscode` module externalized.

## Security

- All diagnostics are read from VS Code's internal API
- No code execution or modification capabilities
- File reading is limited to workspace files
- Server runs locally and does not expose to external network

## License

MIT

## Repository

https://github.com/Fromsko-work/mcp-diagnostics

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.
