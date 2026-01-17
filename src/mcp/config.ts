export function getMcpConfig(port?: number | null) {
  if (port) {
    return {
      mcpServers: {
        "vscode-diagnostics": {
          url: `http://127.0.0.1:${port}/sse`,
          transport: {
            type: "sse"
          },
          description: "Expose VS Code Problems as diagnostics-only MCP service"
        }
      }
    };
  }

  return {
    mcpServers: {
      "vscode-diagnostics": {
        url: "http://127.0.0.1:<PORT>/sse",
        transport: {
          type: "sse"
        },
        description: "Expose VS Code Problems as diagnostics-only MCP service (start service first)"
      }
    }
  };
}
