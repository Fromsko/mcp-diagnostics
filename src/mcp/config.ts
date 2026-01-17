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
