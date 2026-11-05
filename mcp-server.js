const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const db = require('./db');

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

  // Register the create_survey tool
  server.registerTool(
    'create_survey',
    {
      description: 'Create a new survey with questions. Returns the survey ID, slug, and admin edit URL.',
      inputSchema: {
        title: z.string().describe('Survey title'),
        description: z.string().optional().describe('Survey description'),
        questions: z.array(
          z.object({
            text: z.string().describe('Question text'),
            type: z.enum(['text', 'choice', 'rating']).describe('Question type: text, choice, or rating'),
            options: z.any().optional().describe('Options for choice (array of strings) or rating (object with min/max)')
          })
        ).describe('Array of questions')
      },
    },
    async ({ title, description, questions }) => {
      try {
        // Create the survey in the database
        const survey = db.createSurvey({
          title,
          description: description || '',
          questions
        });

        // Get base URL from environment or use default
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const adminUrl = `${baseUrl}/admin/surveys/${survey.id}`;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                id: survey.id,
                slug: survey.slug,
                title: survey.title,
                status: survey.status,
                admin_url: adminUrl,
                public_url: `${baseUrl}/s/${survey.slug}`,
                message: 'Survey created successfully. It is in draft mode. Use the admin URL to edit and publish it.'
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Failed to create survey',
                message: error.message
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

module.exports = { createMCPServer };
