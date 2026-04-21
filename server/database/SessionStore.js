import supabase from '../database/SupabaseClient.js';

export const SessionStore = {

  async createSession(code, tags = []) {
    const { error } = await supabase
      .from('sessions')
      .insert({ code, phase: 'OPEN', tags });
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
      .insert({ session_code: sessionCode, content })
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
      upvote_count: c.upvoteCount ?? 0
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
      .neq('phase', 'ENDED');
    if (error) throw error;
    return data;
  }
};