import { SessionStore } from '../database/SessionStore.js';

export const PHASES = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  CLUSTERING: 'CLUSTERING',
  RESULTS: 'RESULTS',
  EXPANDING: 'EXPANDING',
  ENDED: 'ENDED',
  DELETED: 'DELETED'
};

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  generateUniqueCode() {
    let code;
    do {
      code = generateCode();
    } while (this.sessions.has(code));
    return code;
  }

  async hydrate() {
    try {
      const sessions = await SessionStore.getUnclosedSessions();
      for (const s of sessions) {
        const submissions = await SessionStore.getSubmissions(s.code);
        const clusters = await SessionStore.getClusters(s.code);
        this.sessions.set(s.code, {
          code: s.code,
          phase: s.phase,
          tags: s.tags ?? [],
          title: s.title ?? '',
          description: s.description ?? '',
          hostNotes: s.host_notes ?? null,
          submissions: submissions ?? [],
          clusters: clusters ?? [],
          participantCount: 0,
          expansionRound: s.expansion_round ?? 0,
          curators: s.curators ?? [],
          contextualFacts: clusters.flatMap(c => c.contextual_facts ?? []),
          submissionsAtLastCluster: clusters.length > 0 ? submissions.length : 0,
        });
      }
      console.log(`[SessionManager] hydrated ${sessions.length} session(s) from Supabase`);
    } catch (err) {
      console.error('[SessionManager] hydration failed:', err);
    }
  }

  async createSession(tags = [], title = '', description = '') {
    const code = this.generateUniqueCode();
    const session = {
      code,
      phase: PHASES.OPEN,
      tags,
      title,
      description,
      hostNotes: null,
      submissions: [],
      clusters: [],
      participantCount: 0,
      expansionRound: 0,
      curators: [],
      contextualFacts: [],
      submissionsAtLastCluster: 0,
    };
    this.sessions.set(code, session);
    SessionStore.createSession(code, tags, title, description).catch(err =>
      console.error('[SessionManager] failed to persist session:', err)
    );
    return session;
  }

  getSession(code) {
    return this.sessions.get(code) || null;
  }

  async getSessionAsync(code) {
    if (this.sessions.has(code)) return this.sessions.get(code);

    try {
      const s = await SessionStore.getSession(code);
      if (!s) return null;
      const submissions = await SessionStore.getSubmissions(code);
      const clusters = await SessionStore.getClusters(code);
      const session = {
        code: s.code,
        phase: s.phase,
        tags: s.tags ?? [],
        title: s.title ?? '',
        description: s.description ?? '',
        hostNotes: s.host_notes ?? null,
        submissions: submissions ?? [],
        clusters: clusters ?? [],
        participantCount: 0,
        expansionRound: s.expansion_round ?? 0,
        curators: s.curators ?? [],
        contextualFacts: clusters.flatMap(c => c.contextual_facts ?? [])
      };
      this.sessions.set(code, session);
      return session;
    } catch {
      return null;
    }
  }

  async transitionPhase(code, newPhase) {
    const session = this.getSession(code);
    if (!session) throw new Error('Session not found');
    session.phase = newPhase;
    await SessionStore.updatePhase(code, newPhase);
    return session;
  }

  incrementParticipants(code) {
    const session = this.getSession(code);
    if (!session) throw new Error('Session not found');
    session.participantCount++;
    return session.participantCount;
  }

  decrementParticipants(code) {
    const session = this.getSession(code);
    if (!session) return;
    session.participantCount = Math.max(0, session.participantCount - 1);
    return session.participantCount;
  }

  async addSubmission(code, content) {
    const session = this.getSession(code);
    if (!session) throw new Error('Session not found');
    const submittablePhases = [PHASES.OPEN, PHASES.RESULTS, PHASES.EXPANDING];
    if (!submittablePhases.includes(session.phase)) throw new Error('Submission window is closed');

    const saved = await SessionStore.addSubmission(code, content);
    session.submissions.push(saved);
    return saved;
  }

  async deleteSubmission(code, submissionId) {
    const session = this.getSession(code);
    if (!session) throw new Error('Session not found');

    session.submissions = session.submissions.filter(s => s.id !== submissionId);
    await SessionStore.deleteSubmission(submissionId);
  }

  async deleteSession(code) {
    const session = this.getSession(code);
    if (!session) throw new Error('Session not found');

    await this.transitionPhase(code, PHASES.DELETED);
    this.sessions.delete(code);
  }

  async answerSubmission(code, submissionId, answer) {
    const session = this.getSession(code);
    if (!session) throw new Error('Session not found');

    const submission = session.submissions.find(s => s.id === submissionId);
    if (!submission) throw new Error('Submission not found');

    submission.participant_answer = answer;
    await SessionStore.updateSubmissionAnswer(submissionId, answer);
    return submission;
  }

  async saveClusters(code, clusters) {
    const session = this.getSession(code);
    if (!session) throw new Error('Session not found');

    const saved = await SessionStore.saveClusters(code, clusters);
    session.clusters = saved;
    return saved;
  }

  async deleteCluster(code, clusterId) {
    const session = this.getSession(code);
    if (!session) throw new Error('Session not found');

    session.clusters = session.clusters.filter(c => c.id !== clusterId);
    await SessionStore.deleteCluster(clusterId);
  }

  async updateClusterAnswer(code, clusterId, answer) {
    const session = this.getSession(code);
    if (!session) throw new Error('Session not found');

    const cluster = session.clusters.find(c => String(c.id) === String(clusterId));
    if (!cluster) throw new Error('Cluster not found');
    cluster.answer = answer;
    await SessionStore.updateClusterAnswer(clusterId, answer);
    return cluster;
  }

  async addParticipantAnswerToCluster(code, clusterId, answer) {
    const session = this.getSession(code);
    if (!session) throw new Error('Session not found');

    const cluster = session.clusters.find(c => String(c.id) === String(clusterId));
    if (!cluster) throw new Error('Cluster not found');

    cluster.participant_answers = [...(cluster.participant_answers ?? []), answer];
    await SessionStore.addParticipantAnswerToCluster(clusterId, answer);
    return cluster;
  }

  async saveExpansionPreview(code, clusterPreviews, contextualFacts) {
    const session = this.getSession(code);
    if (!session) throw new Error('Session not found');

    session.contextualFacts = [...(session.contextualFacts ?? []), ...contextualFacts];

    for (const preview of clusterPreviews) {
      const cluster = session.clusters.find(c => c.id === preview.clusterId);
      if (!cluster) {
        console.warn(`[saveExpansionPreview] no cluster found for id: ${preview.clusterId}`);
        continue;
      }

      cluster.previewed_questions = preview.previewedQuestions;
      await SessionStore.updateClusterPreviewedQuestions(cluster.id, preview.previewedQuestions);
      await SessionStore.updateClusterContextualFacts(cluster.id, contextualFacts);
    }

    return session;
  }

  async toggleSelectedQuestion(code, clusterId, question) {
    const session = this.getSession(code);
    if (!session) throw new Error('Session not found');

    const cluster = session.clusters.find(c => String(c.id) === String(clusterId));
    if (!cluster) throw new Error('Cluster not found');

    const current = cluster.selected_questions ?? [];
    const alreadySelected = current.includes(question);

    cluster.selected_questions = alreadySelected
      ? current.filter(q => q !== question)
      : [...current, question];

    await SessionStore.updateClusterSelectedQuestions(clusterId, cluster.selected_questions);
    return cluster;
  }

  async promoteCurator(code, socketId) {
    const session = this.getSession(code);
    if (!session) throw new Error('Session not found');

    const already = session.curators.includes(socketId);
    session.curators = already
      ? session.curators.filter(id => id !== socketId)
      : [...session.curators, socketId];

    await SessionStore.updateCurators(code, session.curators);
    return session.curators;
  }

  async triggerExpansion(code) {
    const session = this.getSession(code);
    if (!session) throw new Error('Session not found');

    session.expansionRound = (session.expansionRound ?? 0) + 1;
    await SessionStore.incrementExpansionRound(code);
    await this.transitionPhase(code, PHASES.EXPANDING);
    return session;
  }

  async endSession(code) {
    const session = this.getSession(code);
    if (!session) throw new Error('Session not found');
    await this.transitionPhase(code, PHASES.ENDED);
  }

  async upvoteQuestion(code, questionText, undo = false) {
    const session = this.getSession(code);
    if (!session) throw new Error('Session not found');

    let updatedCluster = null;
    let newCount = 0;

    for (const cluster of session.clusters) {
      const question = (cluster.questions ?? []).find(q => q.text === questionText);
      if (question) {
        question.upvoteCount = Math.max(0, (question.upvoteCount ?? 0) + (undo ? -1 : 1));
        newCount = question.upvoteCount;
        updatedCluster = cluster;
        break;
      }
    }

    if (!updatedCluster) throw new Error('Question not found');

    await SessionStore.updateClusterQuestions(updatedCluster.id, updatedCluster.questions);

    return { questionText, upvoteCount: newCount };
  }

  restoreSession(code, phase, tags, submissions, clusters) {
    this.sessions.set(code, {
      code,
      phase,
      tags,
      submissions,
      clusters,
      participantCount: 0,
      expansionRound: 0,
      curators: [],
      contextualFacts: []
    });
  }
}