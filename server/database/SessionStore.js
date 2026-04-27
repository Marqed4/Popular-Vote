import supabase from '../database/SupabaseClient.js';

export const SessionStore = {

  async createSession(code, tags = []) {
    const { error } = await supabase
      .from('sessions')
      .insert({ code, phase: 'OPEN', tags, expansion_round: 0, curators: [] });
    if (error) throw error;
  },

  async getSession(code) {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('code', code)
      .single();
    if (error) throw error;
    return data;
  },

  async updatePhase(code, phase) {
    const { error } = await supabase
      .from('sessions')
      .update({ phase })
      .eq('code', code);
    if (error) throw error;
  },

  async updateTags(code, tags) {
    const { error } = await supabase
      .from('sessions')
      .update({ tags })
      .eq('code', code);
    if (error) throw error;
  },

  async deleteSession(code) {
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('code', code);
    if (error) throw error;
  },

  async addSubmission(sessionCode, content) {
    const { data, error } = await supabase
      .from('submissions')
      .insert({ session_code: sessionCode, content, participant_answer: null, is_curator: false })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteSubmission(id) {
    const { error } = await supabase
      .from('submissions')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

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

  async saveClusters(sessionCode, clusters) {
    const { error: deleteError } = await supabase
      .from('clusters')
      .delete()
      .eq('session_code', sessionCode);
    if (deleteError) throw deleteError;

    const rows = clusters.map(c => ({
      session_code: sessionCode,
      representative_query: c.representativeQuery,
      submission_count: c.submissionCount,
      questions: c.questions,
      answer: c.answer ?? null,
      upvote_count: c.upvoteCount ?? 0,
      // expansion fields
      previewed_questions: c.previewedQuestions ?? [],
      selected_questions: c.selectedQuestions ?? [],
      contextual_facts: c.contextualFacts ?? [],
      participant_answers: c.participantAnswers ?? []
    }));

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

  async deleteCluster(id) {
    const { error } = await supabase
      .from('clusters')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async updateClusterAnswer(id, answer) {
    const { error } = await supabase
      .from('clusters')
      .update({ answer })
      .eq('id', id);
    if (error) throw error;
  },

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

  async getClusters(sessionCode) {
    const { data, error } = await supabase
      .from('clusters')
      .select('*')
      .eq('session_code', sessionCode)
      .order('created_at');
    if (error) throw error;
    return data;
  },

    async getUnclosedSessions() {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      
      /*
      Use a new DELETED phase instead of ENDED.
      I want to keep the session around long enough
      for it be viewable by people who aren't actively
      participating in the session.
      */

      .neq('phase', 'DELETED');
    if (error) throw error;
    return data;
  },

  // promote a participant to curator by socket id
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
  }
};