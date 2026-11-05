const express = require('express');
const { createMCPServer } = require('./mcp-server');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// MCP endpoint using Streamable HTTP
app.post('/mcp', async (req, res) => {
  const server = createMCPServer();
  
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });
    
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    
    res.on('close', () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        },
        id: null
      });
    }
  }
});

app.get('/mcp', (req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method not allowed. Use POST for MCP requests.'
    },
    id: null
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
