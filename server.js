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

// Protected admin routes - Survey list
app.get('/admin', requireAuth, (req, res) => {
  const surveys = db.listSurveys();
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  
  const surveyRows = surveys.map(survey => `
    <tr>
      <td class="title-cell">
        <a href="/admin/surveys/${survey.id}" class="survey-title">${escapeHtml(survey.title)}</a>
        <div class="survey-meta">${escapeHtml(survey.slug)}</div>
      </td>
      <td>
        <span class="status-badge status-${survey.status}">${survey.status}</span>
      </td>
      <td class="center">${survey.response_count}</td>
      <td class="date-cell">${formatDate(survey.created_at)}</td>
      <td class="actions-cell">
        <a href="/admin/surveys/${survey.id}" class="btn btn-sm btn-primary">Edit</a>
        ${survey.status === 'published' ? 
          `<a href="${baseUrl}/s/${survey.slug}" target="_blank" class="btn btn-sm btn-secondary">View</a>` : 
          '<span class="btn btn-sm btn-disabled">Draft</span>'
        }
      </td>
    </tr>
  `).join('');
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Surveys - PollPilot Admin</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #f5f7fa;
          margin: 0;
          padding: 0;
        }
        .header {
          background: white;
          border-bottom: 1px solid #e1e4e8;
          padding: 16px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
          color: #1a1a1a;
        }
        .header-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .user-info {
          color: #666;
          font-size: 14px;
        }
        .container {
          max-width: 1200px;
          margin: 24px auto;
          padding: 0 24px;
        }
        .card {
          background: white;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .card-header {
          padding: 20px 24px;
          border-bottom: 1px solid #e1e4e8;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .card-header h2 {
          margin: 0;
          font-size: 18px;
          color: #1a1a1a;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th {
          background: #f6f8fa;
          text-align: left;
          padding: 12px 24px;
          font-weight: 600;
          font-size: 14px;
          color: #57606a;
          border-bottom: 1px solid #e1e4e8;
        }
        td {
          padding: 16px 24px;
          border-bottom: 1px solid #e1e4e8;
          font-size: 14px;
        }
        tr:last-child td {
          border-bottom: none;
        }
        tr:hover {
          background: #f6f8fa;
        }
        .title-cell {
          max-width: 400px;
        }
        .survey-title {
          color: #0969da;
          text-decoration: none;
          font-weight: 500;
          display: block;
          margin-bottom: 4px;
        }
        .survey-title:hover {
          text-decoration: underline;
        }
        .survey-meta {
          color: #666;
          font-size: 12px;
        }
        .status-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
        }
        .status-draft {
          background: #f3f4f6;
          color: #6b7280;
        }
        .status-published {
          background: #d1fae5;
          color: #065f46;
        }
        .center {
          text-align: center;
        }
        .date-cell {
          color: #666;
          white-space: nowrap;
        }
        .actions-cell {
          white-space: nowrap;
        }
        .btn {
          display: inline-block;
          padding: 6px 12px;
          border-radius: 6px;
          text-decoration: none;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
        }
        .btn-sm {
          padding: 4px 10px;
          font-size: 12px;
        }
        .btn-primary {
          background: #0969da;
          color: white;
        }
        .btn-primary:hover {
          background: #0550ae;
        }
        .btn-secondary {
          background: #f3f4f6;
          color: #57606a;
        }
        .btn-secondary:hover {
          background: #e5e7eb;
        }
        .btn-disabled {
          background: #f3f4f6;
          color: #9ca3af;
          cursor: not-allowed;
        }
        .btn-logout {
          background: transparent;
          color: #d73a49;
          border: 1px solid #d73a49;
        }
        .btn-logout:hover {
          background: #d73a49;
          color: white;
        }
        .empty-state {
          text-align: center;
          padding: 60px 24px;
          color: #666;
        }
        .empty-state h3 {
          margin: 0 0 8px 0;
          color: #1a1a1a;
        }
        .stats {
          display: inline-block;
          padding: 2px 8px;
          background: #f3f4f6;
          border-radius: 12px;
          font-size: 13px;
          color: #666;
          margin-left: 8px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📊 PollPilot</h1>
        <div class="header-actions">
          <span class="user-info">👤 ${escapeHtml(req.session.username)}</span>
          <a href="/admin/logout" class="btn btn-sm btn-logout">Logout</a>
        </div>
      </div>
      
      <div class="container">
        <div class="card">
          <div class="card-header">
            <h2>
              Surveys
              <span class="stats">${surveys.length} total</span>
            </h2>
          </div>
          
          ${surveys.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th>Survey</th>
                  <th>Status</th>
                  <th class="center">Responses</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${surveyRows}
              </tbody>
            </table>
          ` : `
            <div class="empty-state">
              <h3>No surveys yet</h3>
              <p>Create your first survey using Claude with the MCP tool.</p>
            </div>
          `}
        </div>
      </div>
    </body>
    </html>
  `);
});

// Helper function to format dates
function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Admin survey editor page
app.get('/admin/surveys/:id', requireAuth, (req, res) => {
  const surveyId = req.params.id;
  const survey = db.getSurvey(surveyId);
  
  if (!survey) {
    return res.status(404).send('Survey not found');
  }
  
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  
  // Server-side function to render a question
  function renderQuestionHTML(q, index) {
    let optionsHTML = '';
    if (q.type === 'choice') {
      const opts = q.options || [];
      const optsStr = Array.isArray(opts) ? opts.join(', ') : '';
      optionsHTML = `
        <div class="question-options">
          <label style="font-size: 13px;">Choice Options (comma-separated)</label>
          <input type="text" class="q-options" value="${escapeHtml(optsStr)}" placeholder="Option 1, Option 2, Option 3">
        </div>
      `;
    } else if (q.type === 'rating') {
      const min = q.options?.min || 1;
      const max = q.options?.max || 5;
      optionsHTML = `
        <div class="question-options">
          <label style="font-size: 13px;">Rating Range</label>
          <input type="number" class="q-min small-input" value="${min}" min="1" max="10" placeholder="Min">
          to
          <input type="number" class="q-max small-input" value="${max}" min="1" max="10" placeholder="Max">
        </div>
      `;
    }
    
    return `
      <div class="question-item" data-index="${index}">
        <div class="question-header">
          <span class="question-number">Question ${index + 1}</span>
          <button type="button" class="btn btn-danger btn-sm" onclick="removeQuestion(${index})">Delete</button>
        </div>
        
        <div class="form-group">
          <input type="text" class="q-text" value="${escapeHtml(q.text)}" placeholder="Enter question text" required>
        </div>
        
        <div class="form-group">
          <label style="font-size: 13px;">Question Type</label>
          <select class="q-type" onchange="updateQuestionType(${index}, this.value)">
            <option value="text" ${q.type === 'text' ? 'selected' : ''}>Text</option>
            <option value="choice" ${q.type === 'choice' ? 'selected' : ''}>Multiple Choice</option>
            <option value="rating" ${q.type === 'rating' ? 'selected' : ''}>Rating</option>
          </select>
        </div>
        
        <div class="options-container">${optionsHTML}</div>
      </div>
    `;
  }
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Edit Survey - PollPilot Admin</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #f5f7fa;
          margin: 0;
          padding: 0;
        }
        .header {
          background: white;
          border-bottom: 1px solid #e1e4e8;
          padding: 16px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
          color: #1a1a1a;
        }
        .header-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .container {
          max-width: 900px;
          margin: 24px auto;
          padding: 0 24px;
        }
        .breadcrumb {
          margin-bottom: 16px;
          color: #666;
          font-size: 14px;
        }
        .breadcrumb a {
          color: #0969da;
          text-decoration: none;
        }
        .breadcrumb a:hover {
          text-decoration: underline;
        }
        .card {
          background: white;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          padding: 24px;
          margin-bottom: 20px;
        }
        .card h2 {
          margin: 0 0 20px 0;
          font-size: 18px;
          color: #1a1a1a;
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
        textarea {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #d0d7de;
          border-radius: 6px;
          font-family: inherit;
          font-size: 14px;
        }
        input:focus,
        textarea:focus {
          outline: none;
          border-color: #0969da;
          box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.1);
        }
        textarea {
          resize: vertical;
        }
        .question-item {
          background: #f6f8fa;
          border: 1px solid #d0d7de;
          border-radius: 6px;
          padding: 16px;
          margin-bottom: 12px;
        }
        .question-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .question-number {
          font-weight: 600;
          color: #666;
        }
        select {
          padding: 6px 30px 6px 10px;
          border: 1px solid #d0d7de;
          border-radius: 6px;
          font-size: 14px;
          background: white;
          cursor: pointer;
        }
        .question-options {
          margin-top: 12px;
          padding: 12px;
          background: white;
          border-radius: 4px;
          border: 1px solid #d0d7de;
        }
        .option-input {
          margin-bottom: 8px;
        }
        .btn {
          display: inline-block;
          padding: 8px 16px;
          border-radius: 6px;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
        }
        .btn-primary {
          background: #2da44e;
          color: white;
        }
        .btn-primary:hover {
          background: #2c974b;
        }
        .btn-secondary {
          background: #f3f4f6;
          color: #57606a;
          border: 1px solid #d0d7de;
        }
        .btn-secondary:hover {
          background: #e5e7eb;
        }
        .btn-danger {
          background: #d73a49;
          color: white;
        }
        .btn-danger:hover {
          background: #cb2431;
        }
        .btn-sm {
          padding: 4px 10px;
          font-size: 13px;
        }
        .btn-add {
          width: 100%;
          margin-top: 12px;
          background: white;
          border: 1px dashed #d0d7de;
          color: #0969da;
        }
        .btn-add:hover {
          background: #f6f8fa;
          border-color: #0969da;
        }
        .status-toggle {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: #fff8e1;
          border: 1px solid #ffd54f;
          border-radius: 6px;
          margin-bottom: 20px;
        }
        .status-toggle.published {
          background: #d1fae5;
          border-color: #10b981;
        }
        .toggle-switch {
          position: relative;
          width: 50px;
          height: 26px;
          background: #ccc;
          border-radius: 13px;
          cursor: pointer;
          transition: background 0.3s;
        }
        .toggle-switch.active {
          background: #2da44e;
        }
        .toggle-switch::after {
          content: '';
          position: absolute;
          top: 3px;
          left: 3px;
          width: 20px;
          height: 20px;
          background: white;
          border-radius: 50%;
          transition: transform 0.3s;
        }
        .toggle-switch.active::after {
          transform: translateX(24px);
        }
        .actions {
          display: flex;
          gap: 12px;
          padding-top: 20px;
          border-top: 1px solid #e1e4e8;
        }
        .alert {
          padding: 12px 16px;
          border-radius: 6px;
          margin-bottom: 20px;
          font-size: 14px;
        }
        .alert-success {
          background: #d1fae5;
          border: 1px solid #10b981;
          color: #065f46;
        }
        .alert-error {
          background: #fee;
          border: 1px solid #d73a49;
          color: #c33;
        }
        .small-input {
          width: 80px;
          display: inline-block;
          margin: 0 4px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📊 PollPilot</h1>
        <div class="header-actions">
          <a href="/admin" class="btn btn-secondary btn-sm">Back to Surveys</a>
          <a href="/admin/logout" class="btn btn-secondary btn-sm">Logout</a>
        </div>
      </div>
      
      <div class="container">
        <div class="breadcrumb">
          <a href="/admin">← Surveys</a> / Edit Survey
        </div>
        
        <div id="alert" style="display: none;" class="alert"></div>
        
        <div class="status-toggle ${survey.status === 'published' ? 'published' : ''}">
          <div class="toggle-switch ${survey.status === 'published' ? 'active' : ''}" id="statusToggle" onclick="toggleStatus()"></div>
          <div>
            <strong id="statusText">${survey.status === 'published' ? 'Published' : 'Draft'}</strong>
            <div style="font-size: 13px; color: #666;">
              ${survey.status === 'published' 
                ? `Public link: <a href="${baseUrl}/s/${survey.slug}" target="_blank">${baseUrl}/s/${survey.slug}</a>` 
                : 'Survey is not visible to the public'}
            </div>
          </div>
        </div>
        
        <form id="surveyForm">
          <div class="card">
            <h2>Survey Details</h2>
            
            <div class="form-group">
              <label for="title">Title</label>
              <input type="text" id="title" name="title" value="${escapeHtml(survey.title)}" required>
            </div>
            
            <div class="form-group">
              <label for="description">Description (optional)</label>
              <textarea id="description" name="description" rows="3">${escapeHtml(survey.description || '')}</textarea>
            </div>
          </div>
          
          <div class="card">
            <h2>Questions</h2>
            
            <div id="questionsList">
              ${survey.questions.map((q, index) => renderQuestionHTML(q, index)).join('')}
            </div>
            
            <button type="button" class="btn btn-add" onclick="addQuestion()">+ Add Question</button>
          </div>
          
          <div class="actions">
            <button type="submit" class="btn btn-primary">Save Changes</button>
            <a href="/admin" class="btn btn-secondary">Cancel</a>
          </div>
        </form>
      </div>
      
      <script>
        const surveyId = ${survey.id};
        let currentStatus = '${survey.status}';
        let questionCounter = ${survey.questions.length};
        
        function renderQuestion(question, index) {
          const types = ['text', 'choice', 'rating'];
          const type = question.type || 'text';
          
          let optionsHtml = '';
          if (type === 'choice') {
            const opts = question.options || [];
            const optsStr = Array.isArray(opts) ? opts.join(', ') : '';
            optionsHtml = \`
              <div class="question-options">
                <label style="font-size: 13px;">Choice Options (comma-separated)</label>
                <input type="text" class="q-options" value="\${escapeHtml(optsStr)}" placeholder="Option 1, Option 2, Option 3">
              </div>
            \`;
          } else if (type === 'rating') {
            const min = question.options?.min || 1;
            const max = question.options?.max || 5;
            optionsHtml = \`
              <div class="question-options">
                <label style="font-size: 13px;">Rating Range</label>
                <input type="number" class="q-min small-input" value="\${min}" min="1" max="10" placeholder="Min">
                to
                <input type="number" class="q-max small-input" value="\${max}" min="1" max="10" placeholder="Max">
              </div>
            \`;
          }
          
          return \`
            <div class="question-item" data-index="\${index}">
              <div class="question-header">
                <span class="question-number">Question \${index + 1}</span>
                <button type="button" class="btn btn-danger btn-sm" onclick="removeQuestion(\${index})">Delete</button>
              </div>
              
              <div class="form-group">
                <input type="text" class="q-text" value="\${escapeHtml(question.text)}" placeholder="Enter question text" required>
              </div>
              
              <div class="form-group">
                <label style="font-size: 13px;">Question Type</label>
                <select class="q-type" onchange="updateQuestionType(\${index}, this.value)">
                  <option value="text" \${type === 'text' ? 'selected' : ''}>Text</option>
                  <option value="choice" \${type === 'choice' ? 'selected' : ''}>Multiple Choice</option>
                  <option value="rating" \${type === 'rating' ? 'selected' : ''}>Rating</option>
                </select>
              </div>
              
              <div class="options-container">\${optionsHtml}</div>
            </div>
          \`;
        }
        
        function escapeHtml(text) {
          const div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
        }
        
        function loadQuestions() {
          const questions = ${JSON.stringify(survey.questions)};
          const container = document.getElementById('questionsList');
          container.innerHTML = questions.map((q, i) => renderQuestion(q, i)).join('');
        }
        
        function addQuestion() {
          const container = document.getElementById('questionsList');
          const newQuestion = {
            text: '',
            type: 'text',
            options: null
          };
          container.insertAdjacentHTML('beforeend', renderQuestion(newQuestion, questionCounter));
          questionCounter++;
        }
        
        function removeQuestion(index) {
          const items = document.querySelectorAll('.question-item');
          if (items.length <= 1) {
            showAlert('error', 'Survey must have at least one question');
            return;
          }
          items[index].remove();
          renumberQuestions();
        }
        
        function renumberQuestions() {
          document.querySelectorAll('.question-item').forEach((item, index) => {
            item.dataset.index = index;
            item.querySelector('.question-number').textContent = \`Question \${index + 1}\`;
          });
        }
        
        function updateQuestionType(index, type) {
          const item = document.querySelectorAll('.question-item')[index];
          const container = item.querySelector('.options-container');
          
          if (type === 'choice') {
            container.innerHTML = \`
              <div class="question-options">
                <label style="font-size: 13px;">Choice Options (comma-separated)</label>
                <input type="text" class="q-options" placeholder="Option 1, Option 2, Option 3">
              </div>
            \`;
          } else if (type === 'rating') {
            container.innerHTML = \`
              <div class="question-options">
                <label style="font-size: 13px;">Rating Range</label>
                <input type="number" class="q-min small-input" value="1" min="1" max="10" placeholder="Min">
                to
                <input type="number" class="q-max small-input" value="5" min="1" max="10" placeholder="Max">
              </div>
            \`;
          } else {
            container.innerHTML = '';
          }
        }
        
        async function toggleStatus() {
          const newStatus = currentStatus === 'draft' ? 'published' : 'draft';
          
          try {
            const response = await fetch(\`/admin/surveys/\${surveyId}/status\`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: newStatus })
            });
            
            if (response.ok) {
              currentStatus = newStatus;
              const toggle = document.getElementById('statusToggle');
              const statusText = document.getElementById('statusText');
              const container = toggle.closest('.status-toggle');
              
              if (newStatus === 'published') {
                toggle.classList.add('active');
                container.classList.add('published');
                statusText.textContent = 'Published';
              } else {
                toggle.classList.remove('active');
                container.classList.remove('published');
                statusText.textContent = 'Draft';
              }
              
              showAlert('success', \`Survey \${newStatus === 'published' ? 'published' : 'unpublished'} successfully\`);
              setTimeout(() => location.reload(), 1000);
            } else {
              showAlert('error', 'Failed to update status');
            }
          } catch (error) {
            showAlert('error', 'Network error');
          }
        }
        
        document.getElementById('surveyForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const title = document.getElementById('title').value.trim();
          const description = document.getElementById('description').value.trim();
          
          const questions = [];
          document.querySelectorAll('.question-item').forEach((item) => {
            const text = item.querySelector('.q-text').value.trim();
            const type = item.querySelector('.q-type').value;
            
            let options = null;
            if (type === 'choice') {
              const optInput = item.querySelector('.q-options');
              if (optInput && optInput.value) {
                options = optInput.value.split(',').map(s => s.trim()).filter(s => s);
              }
            } else if (type === 'rating') {
              const minInput = item.querySelector('.q-min');
              const maxInput = item.querySelector('.q-max');
              if (minInput && maxInput) {
                options = {
                  min: parseInt(minInput.value) || 1,
                  max: parseInt(maxInput.value) || 5
                };
              }
            }
            
            questions.push({ text, type, options });
          });
          
          if (questions.some(q => !q.text)) {
            showAlert('error', 'Please fill in all question texts');
            return;
          }
          
          try {
            const response = await fetch(\`/admin/surveys/\${surveyId}\`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title, description, questions })
            });
            
            const result = await response.json();
            
            if (response.ok) {
              showAlert('success', 'Survey updated successfully');
              setTimeout(() => window.location.href = '/admin', 1500);
            } else {
              showAlert('error', result.error || 'Failed to update survey');
            }
          } catch (error) {
            showAlert('error', 'Network error');
          }
        });
        
        function showAlert(type, message) {
          const alert = document.getElementById('alert');
          alert.className = \`alert alert-\${type}\`;
          alert.textContent = message;
          alert.style.display = 'block';
          setTimeout(() => alert.style.display = 'none', 5000);
        }
      </script>
    </body>
    </html>
  `);
});

// Update survey endpoint
app.post('/admin/surveys/:id', requireAuth, (req, res) => {
  const surveyId = req.params.id;
  const { title, description, questions } = req.body;
  
  try {
    db.updateSurvey(surveyId, { title, description, questions });
    res.json({ success: true, message: 'Survey updated successfully' });
  } catch (error) {
    console.error('Error updating survey:', error);
    res.status(500).json({ error: 'Failed to update survey' });
  }
});

// Toggle survey status endpoint
app.post('/admin/surveys/:id/status', requireAuth, (req, res) => {
  const surveyId = req.params.id;
  const { status } = req.body;
  
  if (!['draft', 'published'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  
  try {
    db.updateSurvey(surveyId, { status });
    res.json({ success: true, message: 'Status updated successfully' });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
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
