import supabase from '../database/SupabaseClient.js';

export const SessionStore = {

// Insert only the base columns that are guaranteed in the schema cache.
// title / description / host_notes are updated separately once the cache refreshes.
async createSession(code, tags = [], title = '', description = '') {
const { error } = await supabase
.from('sessions')
.insert({ code, phase: 'OPEN', tags, expansion_round: 0, curators: [] });
if (error) throw error;

// Best-effort: write the new columns, silently skip if schema cache is stale
if (title || description) {
supabase.from('sessions')
.update({ title, description })
.eq('code', code)
.then(({ error: e }) => { if (e) console.warn('[createSession] context write skipped:', e.message); });
}
},

// Retrieve a single session by code
async getSession(code) {
const { data, error } = await supabase
.from('sessions')
.select('*')
.eq('code', code)
.single();
if (error) throw error;
return data;
},

// Update the session phase (OPEN, CLOSED, DELETED, etc.)
async updatePhase(code, phase) {
const { error } = await supabase
.from('sessions')
.update({ phase })
.eq('code', code);
if (error) throw error;
},

// Replace the tags array for a session
async updateTags(code, tags) {
const { error } = await supabase
.from('sessions')
.update({ tags })
.eq('code', code);
if (error) throw error;
},

// Update title and description together as session context
async updateSessionContext(code, { title, description }) {
const { error } = await supabase
.from('sessions')
.update({ title, description })
.eq('code', code);
if (error) throw error;
},

// Update host notes field
async updateHostNotes(code, hostNotes) {
const { error } = await supabase
.from('sessions')
.update({ host_notes: hostNotes })
.eq('code', code);
if (error) throw error;
},

// Delete a session and cascade to related rows (DB FK handles cascade)
async deleteSession(code) {
const { error } = await supabase
.from('sessions')
.delete()
.eq('code', code);
if (error) throw error;
},

// Add a new submission to a session
async addSubmission(sessionCode, content) {
const { data, error } = await supabase
.from('submissions')
.insert({ session_code: sessionCode, content, participant_answer: null, is_curator: false })
.select()
.single();
if (error) throw error;
return data;
},

// Delete a submission by id
async deleteSubmission(id) {
const { error } = await supabase
.from('submissions')
.delete()
.eq('id', id);
if (error) throw error;
},

// Get all submissions for a session
async getSubmissions(sessionCode) {
const { data, error } = await supabase
.from('submissions')
.select('*')
.eq('session_code', sessionCode);
if (error) throw error;
return data;
},

// save participant answer to a specific submission
async updateSubmissionAnswer(id, participantAnswer) {
const { error } = await supabase
.from('submissions')
.update({ participant_answer: participantAnswer })
.eq('id', id);
if (error) throw error;
},

// saveClusters replaces existing clusters for a session while preserving answers when possible
async saveClusters(sessionCode, clusters) {
// fetch existing clusters so we can preserve their answers
const { data: existing } = await supabase
.from('clusters')
.select('*')
.eq('session_code', sessionCode);

// build a lookup: representative_query -> existing cluster
const existingByQuery = {};
for (const c of (existing ?? [])) {
existingByQuery[c.representative_query] = c;
}

// delete existing clusters for this session (we will re-insert)
const { error: deleteError } = await supabase
.from('clusters')
.delete()
.eq('session_code', sessionCode);
if (deleteError) throw deleteError;

// prepare rows, carrying over answers and arrays from previous clusters when queries match
const rows = clusters.map(c => {
const prev = existingByQuery[c.representativeQuery];
return {
session_code: sessionCode,
representative_query: c.representativeQuery,
submission_count: c.submissionCount,
questions: c.questions,
// carry over answer, participant_answers, contextual_facts if query matches
answer: c.answer ?? prev?.answer ?? null,
upvote_count: c.upvoteCount ?? prev?.upvote_count ?? 0,
previewed_questions: c.previewedQuestions ?? prev?.previewed_questions ?? [],
selected_questions: c.selectedQuestions ?? prev?.selected_questions ?? [],
contextual_facts: c.contextualFacts ?? prev?.contextual_facts ?? [],
participant_answers: c.participantAnswers ?? prev?.participant_answers ?? [],
};
});

const { data, error } = await supabase
.from('clusters')
.insert(rows)
.select();
if (error) throw error;
return data;
},

// insert new clusters without deleting existing ones (used for incremental re-clustering)
async saveNewClusters(sessionCode, clusters) {
if (!clusters.length) return [];

const rows = clusters.map(c => ({
session_code: sessionCode,
representative_query: c.representativeQuery,
submission_count: c.submissionCount,
questions: c.questions,
answer: null,
upvote_count: 0,
previewed_questions: [],
selected_questions: [],
contextual_facts: [],
participant_answers: []
}));

const { data, error } = await supabase
.from('clusters')
.insert(rows)
.select();
if (error) throw error;
return data;
},

// Delete a single cluster by id
async deleteCluster(id) {
const { error } = await supabase
.from('clusters')
.delete()
.eq('id', id);
if (error) throw error;
},

// Update the answer text for a cluster
async updateClusterAnswer(id, answer) {
const { error } = await supabase
.from('clusters')
.update({ answer })
.eq('id', id);
if (error) throw error;
},

// Update only the questions array for a cluster
async updateClusterQuestions(id, questions) {
const { error } = await supabase
.from('clusters')
.update({ questions })
.eq('id', id);
if (error) throw error;
},

// Update representative query, submission count, and questions together
async updateClusterQuery(id, representativeQuery, submissionCount, questions) {
const { error } = await supabase
.from('clusters')
.update({ representative_query: representativeQuery, submission_count: submissionCount, questions })
.eq('id', id);
if (error) throw error;
},

// save ai-previewed follow-up questions to a cluster
async updateClusterPreviewedQuestions(id, previewedQuestions) {
const { error } = await supabase
.from('clusters')
.update({ previewed_questions: previewedQuestions })
.eq('id', id);
if (error) throw error;
},

// save host/participant selected questions from the previewed list
async updateClusterSelectedQuestions(id, selectedQuestions) {
const { error } = await supabase
.from('clusters')
.update({ selected_questions: selectedQuestions })
.eq('id', id);
if (error) throw error;
},

// save contextual facts extracted by ai during expansion
async updateClusterContextualFacts(id, contextualFacts) {
const { error } = await supabase
.from('clusters')
.update({ contextual_facts: contextualFacts })
.eq('id', id);
if (error) throw error;
},

// append a participant answer to a cluster's participant_answers array
async addParticipantAnswerToCluster(id, answer) {
const { data: cluster, error: fetchError } = await supabase
.from('clusters')
.select('participant_answers')
.eq('id', id)
.single();
if (fetchError) throw fetchError;

const updated = [...(cluster.participant_answers ?? []), answer];
const { error } = await supabase
.from('clusters')
.update({ participant_answers: updated })
.eq('id', id);
if (error) throw error;
},

// Get clusters for a session ordered by creation time
async getClusters(sessionCode) {
const { data, error } = await supabase
.from('clusters')
.select('*')
.eq('session_code', sessionCode)
.order('created_at');
if (error) throw error;
return data;
},

// Return sessions that are not marked DELETED
async getUnclosedSessions() {
const { data, error } = await supabase
.from('sessions')
.select('*')
.neq('phase', 'DELETED');
if (error) throw error;
return data;
},

// promote a participant to curator by socket id (or update curator list)
async updateCurators(code, curators) {
const { error } = await supabase
.from('sessions')
.update({ curators })
.eq('code', code);
if (error) throw error;
},

// increment expansion round counter
async incrementExpansionRound(code) {
const { data, error } = await supabase
.from('sessions')
.select('expansion_round')
.eq('code', code)
.single();
if (error) throw error;

const { error: updateError } = await supabase
.from('sessions')
.update({ expansion_round: (data.expansion_round ?? 0) + 1 })
.eq('code', code);
if (updateError) throw updateError;
},
};