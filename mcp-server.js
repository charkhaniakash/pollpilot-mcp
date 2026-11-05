const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');

/**
 * Create and configure the MCP server
 */
function createMCPServer() {
  const server = new McpServer(
    {
      name: 'pollpilot-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register the ping tool
  server.registerTool(
    'ping',
    {
      description: 'Test tool that returns pong',
      inputSchema: {},
    },
    async () => {
      return {
        content: [
          {
            type: 'text',
            text: 'pong',
          },
        ],
      };
    }
  );

  return server;
}

module.exports = { createMCPServer };
