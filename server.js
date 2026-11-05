const express = require('express');
const session = require('express-session');
const { createMCPServer } = require('./mcp-server');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const db = require('./db');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.isAuthenticated) {
    return next();
  }
  
  // If it's an API request, return JSON
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Otherwise redirect to login
  res.redirect('/admin/login');
}

// Admin login page
app.get('/admin/login', (req, res) => {
  // If already logged in, redirect to admin
  if (req.session && req.session.isAuthenticated) {
    return res.redirect('/admin');
  }
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin Login - PollPilot</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          margin: 0;
          padding: 20px;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .login-container {
          background: white;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          padding: 40px;
          width: 100%;
          max-width: 400px;
        }
        h1 {
          margin: 0 0 10px 0;
          color: #1a1a1a;
          font-size: 28px;
        }
        .subtitle {
          color: #666;
          margin-bottom: 30px;
          font-size: 14px;
        }
        .form-group {
          margin-bottom: 20px;
        }
        label {
          display: block;
          font-weight: 600;
          margin-bottom: 8px;
          color: #333;
          font-size: 14px;
        }
        input[type="text"],
        input[type="password"] {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-family: inherit;
          font-size: 14px;
        }
        input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        button {
          width: 100%;
          padding: 14px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }
        button:hover {
          background: #5568d3;
        }
        button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .error-message {
          background: #fee;
          border: 1px solid #c33;
          color: #c33;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 20px;
          display: none;
          font-size: 14px;
        }
        .logo {
          text-align: center;
          margin-bottom: 20px;
          font-size: 48px;
        }
      </style>
    </head>
    <body>
      <div class="login-container">
        <div class="logo">📊</div>
        <h1>PollPilot Admin</h1>
        <p class="subtitle">Sign in to manage your surveys</p>
        
        <div id="error" class="error-message"></div>
        
        <form id="loginForm" method="POST" action="/admin/login">
          <div class="form-group">
            <label for="username">Username</label>
            <input type="text" id="username" name="username" required autofocus>
          </div>
          
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required>
          </div>
          
          <button type="submit">Sign In</button>
        </form>
      </div>
      
      <script>
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('error') === 'invalid') {
          document.getElementById('error').textContent = 'Invalid username or password';
          document.getElementById('error').style.display = 'block';
        }
      </script>
    </body>
    </html>
  `);
});

// Admin login handler
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'admin';
  
  if (username === adminUser && password === adminPass) {
    req.session.isAuthenticated = true;
    req.session.username = username;
    res.redirect('/admin');
  } else {
    res.redirect('/admin/login?error=invalid');
  }
});

// Admin logout
app.get('/admin/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/admin/login');
  });
});

// Protected admin routes (placeholder for F8)
app.get('/admin', requireAuth, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Admin - PollPilot</title>
      <style>
        body { font-family: sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        h1 { color: #333; }
        a { color: #667eea; text-decoration: none; }
      </style>
    </head>
    <body>
      <h1>Welcome, ${req.session.username}!</h1>
      <p>This is the admin dashboard. Survey list will be implemented in F8.</p>
      <a href="/admin/logout">Logout</a>
    </body>
    </html>
  `);
});

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

// Public survey page
app.get('/s/:slug', (req, res) => {
  const { slug } = req.params;
  const survey = db.getSurvey(slug);
  
  if (!survey) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Survey Not Found</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          .error { background: #fee; border: 1px solid #c33; border-radius: 8px; padding: 20px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="error">
          <h1>Survey Not Found</h1>
          <p>The survey you're looking for doesn't exist.</p>
        </div>
      </body>
      </html>
    `);
  }
  
  if (survey.status !== 'published') {
    return res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Survey Not Available</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          .warning { background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 20px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="warning">
          <h1>Survey Not Published</h1>
          <p>This survey is not currently accepting responses.</p>
        </div>
      </body>
      </html>
    `);
  }
  
  // Render the survey form
  const questionsHTML = survey.questions.map((q, index) => {
    let inputHTML = '';
    
    if (q.type === 'text') {
      inputHTML = `<textarea name="q_${q.id}" id="q_${q.id}" rows="4" required></textarea>`;
    } else if (q.type === 'choice') {
      const options = q.options || [];
      inputHTML = options.map(opt => `
        <label class="choice-option">
          <input type="radio" name="q_${q.id}" value="${escapeHtml(opt)}" required>
          <span>${escapeHtml(opt)}</span>
        </label>
      `).join('');
    } else if (q.type === 'rating') {
      const min = q.options?.min || 1;
      const max = q.options?.max || 5;
      const ratings = [];
      for (let i = min; i <= max; i++) {
        ratings.push(`
          <label class="rating-option">
            <input type="radio" name="q_${q.id}" value="${i}" required>
            <span>${i}</span>
          </label>
        `);
      }
      inputHTML = `<div class="rating-group">${ratings.join('')}</div>`;
    }
    
    return `
      <div class="question">
        <label class="question-label">
          ${index + 1}. ${escapeHtml(q.text)}
          ${q.type === 'rating' && q.options ? `<span class="hint">(${q.options.min} - ${q.options.max})</span>` : ''}
        </label>
        ${inputHTML}
      </div>
    `;
  }).join('');
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(survey.title)}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #f5f5f5;
          margin: 0;
          padding: 20px;
        }
        .container {
          max-width: 700px;
          margin: 0 auto;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          padding: 40px;
        }
        h1 {
          margin: 0 0 10px 0;
          color: #1a1a1a;
          font-size: 28px;
        }
        .description {
          color: #666;
          margin-bottom: 30px;
          line-height: 1.5;
        }
        .question {
          margin-bottom: 30px;
        }
        .question-label {
          display: block;
          font-weight: 600;
          margin-bottom: 12px;
          color: #333;
          font-size: 16px;
        }
        .hint {
          font-weight: normal;
          color: #888;
          font-size: 14px;
        }
        textarea {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-family: inherit;
          font-size: 14px;
          resize: vertical;
        }
        textarea:focus {
          outline: none;
          border-color: #4CAF50;
        }
        .choice-option {
          display: block;
          padding: 12px 16px;
          margin-bottom: 8px;
          border: 1px solid #ddd;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .choice-option:hover {
          background: #f9f9f9;
          border-color: #4CAF50;
        }
        .choice-option input {
          margin-right: 10px;
        }
        .rating-group {
          display: flex;
          gap: 8px;
        }
        .rating-option {
          flex: 1;
          text-align: center;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .rating-option:hover {
          background: #f9f9f9;
          border-color: #4CAF50;
        }
        .rating-option input {
          display: none;
        }
        .rating-option input:checked + span {
          font-weight: bold;
        }
        .rating-option:has(input:checked) {
          background: #4CAF50;
          border-color: #4CAF50;
          color: white;
        }
        button {
          width: 100%;
          padding: 14px;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }
        button:hover {
          background: #45a049;
        }
        button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .error-message {
          background: #fee;
          border: 1px solid #c33;
          color: #c33;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 20px;
          display: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${escapeHtml(survey.title)}</h1>
        ${survey.description ? `<p class="description">${escapeHtml(survey.description)}</p>` : ''}
        
        <div id="error" class="error-message"></div>
        
        <form id="surveyForm" action="/s/${slug}/submit" method="POST">
          ${questionsHTML}
          <button type="submit">Submit Response</button>
        </form>
      </div>
      
      <script>
        document.getElementById('surveyForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const formData = new FormData(e.target);
          const answers = {};
          
          for (let [key, value] of formData.entries()) {
            const questionId = key.replace('q_', '');
            answers[questionId] = value;
          }
          
          const button = e.target.querySelector('button');
          const errorDiv = document.getElementById('error');
          
          button.disabled = true;
          button.textContent = 'Submitting...';
          errorDiv.style.display = 'none';
          
          try {
            const response = await fetch('/s/${slug}/submit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ answers })
            });
            
            const result = await response.json();
            
            if (response.ok) {
              document.querySelector('.container').innerHTML = \`
                <div style="text-align: center; padding: 40px 0;">
                  <h1 style="color: #4CAF50; margin-bottom: 10px;">✓ Thank You!</h1>
                  <p style="color: #666;">Your response has been submitted successfully.</p>
                </div>
              \`;
            } else {
              errorDiv.textContent = result.error || 'Failed to submit response';
              errorDiv.style.display = 'block';
              button.disabled = false;
              button.textContent = 'Submit Response';
            }
          } catch (error) {
            errorDiv.textContent = 'Network error. Please try again.';
            errorDiv.style.display = 'block';
            button.disabled = false;
            button.textContent = 'Submit Response';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Submit survey response
app.post('/s/:slug/submit', (req, res) => {
  const { slug } = req.params;
  const { answers } = req.body;
  
  const survey = db.getSurvey(slug);
  
  if (!survey) {
    return res.status(404).json({ error: 'Survey not found' });
  }
  
  if (survey.status !== 'published') {
    return res.status(403).json({ error: 'Survey is not accepting responses' });
  }
  
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'Invalid answers format' });
  }
  
  // Validate that all required questions are answered
  const questionIds = survey.questions.map(q => q.id.toString());
  const answeredIds = Object.keys(answers);
  
  const missingAnswers = questionIds.filter(id => !answeredIds.includes(id));
  if (missingAnswers.length > 0) {
    return res.status(400).json({ error: 'Please answer all questions' });
  }
  
  try {
    const response = db.addResponse(survey.id, answers);
    res.json({ 
      success: true, 
      message: 'Response submitted successfully',
      response_id: response.id
    });
  } catch (error) {
    console.error('Error saving response:', error);
    res.status(500).json({ error: 'Failed to save response' });
  }
});

// HTML escape helper
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
