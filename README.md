# PollPilot MCP

**Live Survey Hosting with Model Context Protocol Integration**

A full-stack survey application that allows Claude AI to create, manage, and analyze surveys through MCP tools - while keeping AI completely out of the application code.

## 🌐 Live Demo

- **Admin Panel:** https://pollpilot-mcp.onrender.com/admin/login
  - Username: `admin`
  - Password: `admin`
- **Health Check:** https://pollpilot-mcp.onrender.com/health

## ✨ Features

### For Users
- 📝 **Public Survey Forms** - Clean, mobile-friendly survey pages at `/s/:slug`
- 📊 **Multiple Question Types** - Text, multiple choice, and rating scales
- ✅ **Real-time Submissions** - Instant response collection

### For Admins
- 🎛️ **Survey Management** - Create, edit, publish/unpublish surveys
- 📈 **Response Viewing** - See all submissions with timestamps
- 📥 **CSV Export** - Download responses for analysis
- 🔒 **Session-based Auth** - Secure admin access

### For AI (via MCP)
- 🤖 **6 MCP Tools** - Full survey lifecycle control
- 🔐 **Token Authentication** - Secure API access
- 📡 **SSE Transport** - Real-time streaming support

## 🛠️ Tech Stack

- **Backend:** Node.js, Express
- **Database:** SQLite (better-sqlite3)
- **MCP:** @modelcontextprotocol/sdk
- **Frontend:** Plain HTML/CSS/JS (no frameworks)
- **Auth:** express-session
- **Validation:** Zod

**✅ No AI packages in application code** - The app is AI-free; Claude connects via MCP.

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/charkhaniakash/pollpilot-mcp.git
cd pollpilot-mcp
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and set your values:

```bash
cp .env.example .env
```

Required variables:
```env
PORT=3000
NODE_ENV=development
ADMIN_USER=admin
ADMIN_PASS=admin
SESSION_SECRET=your-session-secret-here
MCP_TOKEN=your-mcp-token-here
DB_PATH=./pollpilot.db
BASE_URL=http://localhost:3000
```

### 3. Run the Server

```bash
npm start
```

Visit http://localhost:3000/health to verify it's running.

## 🔌 Connect to Claude (Browser or Desktop)

### Option 1: Claude.ai (Browser) - Easiest

1. Go to https://claude.ai
2. Click your profile icon → **Settings** → **Connectors** tab
3. Click **"Add custom connector"**
4. Fill in:
   - **Name:** `PollPilot`
   - **Server URL / MCP link:** `https://pollpilot-mcp.onrender.com/mcp/change-this-to-a-random-mcp-token`
5. Click **Save**

**Note:** Free plan allows only 1 custom connector.

### Option 2: Claude Desktop

1. Edit config file:
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

2. Add this section:
   ```json
   "mcpServers": {
     "pollpilot": {
       "url": "https://pollpilot-mcp.onrender.com/mcp/change-this-to-a-random-mcp-token",
       "transport": "sse"
     }
   }
   ```

3. Restart Claude Desktop completely

### Test the Connection

Try these prompts in Claude:

```
"Create a survey about favorite programming languages using pollpilot"
```

```
"List all surveys using pollpilot"
```

```
"Get responses for survey 1 using pollpilot"
```

## 🎯 MCP Tools Available

Claude can use these 6 tools:

| Tool | Description | Example |
|------|-------------|---------|
| `ping` | Test MCP connection | "Ping pollpilot" |
| `create_survey` | Create new survey with questions | "Create a survey about..." |
| `list_surveys` | Get all surveys | "List all surveys" |
| `get_survey` | Get survey details by ID | "Get survey 1" |
| `get_responses` | Get all responses for a survey | "Get responses for survey 1" |
| `update_survey` | Update survey title/description/status | "Publish survey 1" |

## 📚 Sample Prompts for Claude

Try these in Claude after connecting:

1. **Create a Survey:**
   ```
   "Using pollpilot, create a customer satisfaction survey with:
   - A text question about what they like most
   - A rating question from 1-5 for overall satisfaction
   - A choice question asking how they heard about us with options: Google, Friend, Social Media, Other"
   ```

2. **Check What Surveys Exist:**
   ```
   "Show me all surveys in pollpilot and their status"
   ```

3. **Analyze Responses:**
   ```
   "Get all responses for the customer satisfaction survey and summarize the feedback"
   ```

4. **Publish a Survey:**
   ```
   "Update survey 1 to published status so people can access it"
   ```

## 🗂️ Database Schema

### surveys
- `id` - Auto-increment primary key
- `slug` - URL-friendly identifier
- `title` - Survey title
- `description` - Survey description
- `status` - 'draft' or 'published'
- `created_at` - ISO timestamp

### questions
- `id` - Auto-increment primary key
- `survey_id` - Foreign key to surveys
- `position` - Display order (0-based)
- `text` - Question text
- `type` - 'text', 'choice', or 'rating'
- `options_json` - JSON array for choices/rating scale

### responses
- `id` - Auto-increment primary key
- `survey_id` - Foreign key to surveys
- `answers_json` - JSON object with question_id: answer pairs
- `created_at` - ISO timestamp


## 📦 Deployment

Deployed on [Render.com](https://render.com) with:
- **Auto-deploy** from GitHub
- **Environment variables** set in dashboard
- **Persistent disk** for SQLite database
- **Free tier** with auto-sleep after inactivity

See `DEPLOYMENT.md` for detailed deployment guides (VPS, Hostinger hPanel, Render).


---

**Built with ❤️ for the MCP ecosystem**
