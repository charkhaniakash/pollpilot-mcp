const db = require('./db');

console.log('Testing database layer...\n');

// Test 1: Create a survey
console.log('1. Creating a test survey...');
const survey = db.createSurvey({
  title: 'Coffee Shop Feedback',
  description: 'Help us improve your experience',
  questions: [
    {
      text: 'How would you rate our coffee?',
      type: 'rating',
      options: { min: 1, max: 5 }
    },
    {
      text: 'What is your favorite drink?',
      type: 'choice',
      options: ['Espresso', 'Latte', 'Cappuccino', 'Americano']
    },
    {
      text: 'Any additional comments?',
      type: 'text',
      options: null
    }
  ]
});

console.log('Created:', survey);
console.log('');

// Test 2: Get the survey
console.log('2. Retrieving survey by ID...');
const retrieved = db.getSurvey(survey.id);
console.log('Retrieved:', {
  id: retrieved.id,
  slug: retrieved.slug,
  title: retrieved.title,
  question_count: retrieved.questions.length
});
console.log('');

// Test 3: List surveys
console.log('3. Listing all surveys...');
const surveys = db.listSurveys();
console.log('Total surveys:', surveys.length);
console.log('First survey:', surveys[0]);
console.log('');

// Test 4: Add a response
console.log('4. Adding a test response...');
const response = db.addResponse(survey.id, {
  [retrieved.questions[0].id]: 5,
  [retrieved.questions[1].id]: 'Latte',
  [retrieved.questions[2].id]: 'Great coffee!'
});
console.log('Response added:', { id: response.id });
console.log('');

// Test 5: List responses
console.log('5. Listing responses...');
const responses = db.listResponses(survey.id);
console.log('Total responses:', responses.length);
console.log('First response:', responses[0]);
console.log('');

// Test 6: Update survey
console.log('6. Updating survey status to published...');
const updated = db.updateSurvey(survey.id, { status: 'published' });
console.log('Updated status:', updated.status);
console.log('');

console.log('✅ All database tests passed!');
