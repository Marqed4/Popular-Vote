import { SessionStore } from '../database/SessionStore.js';

export const PHASES = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  CLUSTERING: 'CLUSTERING',
  RESULTS: 'RESULTS',
  ENDED: 'ENDED'
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

  async createSession(tags = []) {
    const code = this.generateUniqueCode();
    const session = {
      code,
      phase: PHASES.OPEN,
      tags,
      submissions: [],
      clusters: [],
      participantCount: 0
    };
    this.sessions.set(code, session);
    await SessionStore.createSession(code, tags);
    return session;
  }

  getSession(code) {
    return this.sessions.get(code) || null;
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
    if (session.phase !== PHASES.OPEN) throw new Error('Submission window is closed');

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

    const cluster = session.clusters.find(c => c.id === clusterId);
    if (!cluster) throw new Error('Cluster not found');
    cluster.answer = answer;
    await SessionStore.updateClusterAnswer(clusterId, answer);
    return cluster;
  }

  async endSession(code) {
    const session = this.getSession(code);
    if (!session) throw new Error('Session not found');

    await SessionStore.deleteSession(code);
    this.sessions.delete(code);
  }

  restoreSession(code, phase, tags, submissions, clusters) {
    this.sessions.set(code, {
      code,
      phase,
      tags,
      submissions,
      clusters,
      participantCount: 0
    });
  }
}