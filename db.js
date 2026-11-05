const Database = require('better-sqlite3');
const path = require('path');

// Initialize database
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'pollpilot.db');
const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize schema
function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS surveys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      survey_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      text TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('text', 'choice', 'rating')),
      options_json TEXT,
      FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      survey_id INTEGER NOT NULL,
      answers_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_questions_survey ON questions(survey_id);
    CREATE INDEX IF NOT EXISTS idx_responses_survey ON responses(survey_id);
  `);
}

// Helper: Generate unique slug
function generateSlug(title) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
  
  const timestamp = Date.now().toString(36);
  return `${base}-${timestamp}`;
}

// Create a new survey with questions
function createSurvey({ title, description = '', questions = [] }) {
  const slug = generateSlug(title);
  
  const insertSurvey = db.prepare(`
    INSERT INTO surveys (slug, title, description, status)
    VALUES (?, ?, ?, 'draft')
  `);
  
  const insertQuestion = db.prepare(`
    INSERT INTO questions (survey_id, position, text, type, options_json)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  const transaction = db.transaction(() => {
    const result = insertSurvey.run(slug, title, description);
    const surveyId = result.lastInsertRowid;
    
    questions.forEach((q, index) => {
      const optionsJson = q.options ? JSON.stringify(q.options) : null;
      insertQuestion.run(surveyId, index, q.text, q.type, optionsJson);
    });
    
    return surveyId;
  });
  
  const surveyId = transaction();
  
  return {
    id: surveyId,
    slug,
    title,
    description,
    status: 'draft'
  };
}

// Get a survey by ID or slug
function getSurvey(idOrSlug) {
  const survey = db.prepare(`
    SELECT * FROM surveys 
    WHERE id = ? OR slug = ?
  `).get(idOrSlug, idOrSlug);
  
  if (!survey) return null;
  
  const questions = db.prepare(`
    SELECT id, position, text, type, options_json
    FROM questions
    WHERE survey_id = ?
    ORDER BY position
  `).all(survey.id);
  
  // Parse options_json for each question
  survey.questions = questions.map(q => ({
    id: q.id,
    position: q.position,
    text: q.text,
    type: q.type,
    options: q.options_json ? JSON.parse(q.options_json) : null
  }));
  
  return survey;
}

// List all surveys with response counts
function listSurveys() {
  return db.prepare(`
    SELECT 
      s.id,
      s.slug,
      s.title,
      s.status,
      s.created_at,
      COUNT(r.id) as response_count
    FROM surveys s
    LEFT JOIN responses r ON s.id = r.survey_id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `).all();
}

// Update a survey
function updateSurvey(surveyId, { title, description, status, questions }) {
  const transaction = db.transaction(() => {
    // Update survey basics
    if (title !== undefined || description !== undefined || status !== undefined) {
      const updates = [];
      const values = [];
      
      if (title !== undefined) {
        updates.push('title = ?');
        values.push(title);
      }
      if (description !== undefined) {
        updates.push('description = ?');
        values.push(description);
      }
      if (status !== undefined) {
        updates.push('status = ?');
        values.push(status);
      }
      
      values.push(surveyId);
      
      db.prepare(`
        UPDATE surveys 
        SET ${updates.join(', ')}
        WHERE id = ?
      `).run(...values);
    }
    
    // Update questions if provided
    if (questions !== undefined) {
      // Delete existing questions
      db.prepare('DELETE FROM questions WHERE survey_id = ?').run(surveyId);
      
      // Insert new questions
      const insertQuestion = db.prepare(`
        INSERT INTO questions (survey_id, position, text, type, options_json)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      questions.forEach((q, index) => {
        const optionsJson = q.options ? JSON.stringify(q.options) : null;
        insertQuestion.run(surveyId, index, q.text, q.type, optionsJson);
      });
    }
  });
  
  transaction();
  return getSurvey(surveyId);
}

// Add a response to a survey
function addResponse(surveyId, answers) {
  const result = db.prepare(`
    INSERT INTO responses (survey_id, answers_json)
    VALUES (?, ?)
  `).run(surveyId, JSON.stringify(answers));
  
  return {
    id: result.lastInsertRowid,
    survey_id: surveyId,
    answers,
    created_at: new Date().toISOString()
  };
}

// List all responses for a survey
function listResponses(surveyId) {
  const responses = db.prepare(`
    SELECT id, survey_id, answers_json, created_at
    FROM responses
    WHERE survey_id = ?
    ORDER BY created_at DESC
  `).all(surveyId);
  
  return responses.map(r => ({
    id: r.id,
    survey_id: r.survey_id,
    answers: JSON.parse(r.answers_json),
    created_at: r.created_at
  }));
}

// Initialize schema on module load
initializeSchema();

module.exports = {
  db,
  createSurvey,
  getSurvey,
  listSurveys,
  updateSurvey,
  addResponse,
  listResponses
};
