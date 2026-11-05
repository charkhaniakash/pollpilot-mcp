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

  // Register the list_surveys tool
  server.registerTool(
    'list_surveys',
    {
      description: 'List all surveys with their id, title, status, and response count.',
      inputSchema: {},
    },
    async () => {
      try {
        const surveys = db.listSurveys();
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                surveys: surveys.map(s => ({
                  id: s.id,
                  slug: s.slug,
                  title: s.title,
                  status: s.status,
                  response_count: s.response_count,
                  created_at: s.created_at
                })),
                total: surveys.length
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
                error: 'Failed to list surveys',
                message: error.message
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Register the get_survey tool
  server.registerTool(
    'get_survey',
    {
      description: 'Get full details of a survey including all questions. Provide either survey ID or slug.',
      inputSchema: {
        survey_id: z.union([z.string(), z.number()]).describe('Survey ID or slug')
      },
    },
    async ({ survey_id }) => {
      try {
        const survey = db.getSurvey(survey_id);
        
        if (!survey) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Survey not found',
                  message: `No survey found with ID or slug: ${survey_id}`
                }, null, 2),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                id: survey.id,
                slug: survey.slug,
                title: survey.title,
                description: survey.description,
                status: survey.status,
                created_at: survey.created_at,
                questions: survey.questions
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
                error: 'Failed to get survey',
                message: error.message
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Register the get_responses tool
  server.registerTool(
    'get_responses',
    {
      description: 'Get all responses for a survey. Returns response data with answers that Claude can analyze.',
      inputSchema: {
        survey_id: z.union([z.string(), z.number()]).describe('Survey ID or slug')
      },
    },
    async ({ survey_id }) => {
      try {
        // Get survey first to validate and get question context
        const survey = db.getSurvey(survey_id);
        
        if (!survey) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Survey not found',
                  message: `No survey found with ID or slug: ${survey_id}`
                }, null, 2),
              },
            ],
            isError: true,
          };
        }

        const responses = db.listResponses(survey.id);
        
        // Format responses with question context for better analysis
        const formattedResponses = responses.map(r => {
          const answersWithContext = {};
          survey.questions.forEach(q => {
            answersWithContext[q.text] = r.answers[q.id] || null;
          });
          
          return {
            response_id: r.id,
            submitted_at: r.created_at,
            answers: answersWithContext
          };
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                survey: {
                  id: survey.id,
                  title: survey.title,
                  description: survey.description
                },
                total_responses: responses.length,
                responses: formattedResponses
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
                error: 'Failed to get responses',
                message: error.message
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Register the update_survey tool
  server.registerTool(
    'update_survey',
    {
      description: 'Update a survey\'s title, description, questions, or status. Can be used to revise questions or publish/unpublish a survey.',
      inputSchema: {
        survey_id: z.union([z.string(), z.number()]).describe('Survey ID or slug'),
        title: z.string().optional().describe('New survey title'),
        description: z.string().optional().describe('New survey description'),
        status: z.enum(['draft', 'published']).optional().describe('Survey status: draft or published'),
        questions: z.array(
          z.object({
            text: z.string().describe('Question text'),
            type: z.enum(['text', 'choice', 'rating']).describe('Question type'),
            options: z.any().optional().describe('Options for choice (array) or rating (object with min/max)')
          })
        ).optional().describe('Array of questions to replace existing questions')
      },
    },
    async ({ survey_id, title, description, status, questions }) => {
      try {
        // Get survey first to validate and get current ID
        const survey = db.getSurvey(survey_id);
        
        if (!survey) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Survey not found',
                  message: `No survey found with ID or slug: ${survey_id}`
                }, null, 2),
              },
            ],
            isError: true,
          };
        }

        // Build update object with only provided fields
        const updates = {};
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (status !== undefined) updates.status = status;
        if (questions !== undefined) updates.questions = questions;

        // Perform update
        const updated = db.updateSurvey(survey.id, updates);
        
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Survey updated successfully',
                survey: {
                  id: updated.id,
                  slug: updated.slug,
                  title: updated.title,
                  description: updated.description,
                  status: updated.status,
                  admin_url: `${baseUrl}/admin/surveys/${updated.id}`,
                  public_url: updated.status === 'published' ? `${baseUrl}/s/${updated.slug}` : null
                }
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
                error: 'Failed to update survey',
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
