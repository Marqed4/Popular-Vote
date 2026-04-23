import express from 'express';
import { ClusteringController } from '../managers/ClusteringController.js';

const router = express.Router();
const clusteringEngine = new ClusteringController();

router.post('/sessions', async (req, res) => {
  try {
    const { tags = [] } = req.body;
    const sessionManager = req.app.locals.sessionManager;
    const session = await sessionManager.createSession(tags);
    res.json({ code: session.code, phase: session.phase, tags: session.tags });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

router.post('/sessions/:code/join', async (req, res) => {
  try {
    const sessionManager = req.app.locals.sessionManager;
    // async — falls back to Supabase if not in memory after server restart
    const session = await sessionManager.getSessionAsync(req.params.code);

    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.phase !== 'OPEN') return res.status(400).json({ error: 'Session is no longer accepting submissions' });

    const count = sessionManager.incrementParticipants(req.params.code);
    res.json({ code: session.code, phase: session.phase, participantCount: count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to join session' });
  }
});

router.post('/sessions/:code/close', async (req, res) => {
  try {
    const sessionManager = req.app.locals.sessionManager;
    const wsManager = req.app.locals.wsManager;
    // async — falls back to Supabase if not in memory after server restart
    const session = await sessionManager.getSessionAsync(req.params.code);

    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.phase !== 'OPEN') return res.status(400).json({ error: 'Session is not open' });

    await sessionManager.transitionPhase(req.params.code, 'CLOSED');

    // notify all clients the submission window is closed
    wsManager.toSession(req.params.code, 'session:closed');

    res.json({ code: req.params.code, phase: 'CLOSED' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to close session' });
  }
});

router.post('/sessions/:code/cluster', async (req, res) => {
  try {
    const { code } = req.params;
    const sessionManager = req.app.locals.sessionManager;
    const wsManager = req.app.locals.wsManager;
    const session = sessionManager.getSession(code);

    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.submissions.length === 0) return res.status(400).json({ error: 'No submissions to cluster' });
    if (session.phase !== 'OPEN' && session.phase !== 'CLOSED') return res.status(400).json({ error: 'Session is not in a clusterable state' });

    // transition to clustering phase and notify all
    await sessionManager.transitionPhase(code, 'CLUSTERING');
    wsManager.toSession(code, 'session:clustering');

    const clusters = await clusteringEngine.cluster(session.submissions, session.tags);

    // save and transition to results
    const saved = await sessionManager.saveClusters(code, clusters);
    await sessionManager.transitionPhase(code, 'RESULTS');

    // broadcast results
    wsManager.toSession(code, 'session:results', { clusters: saved });

    res.json({ clusters: saved });

  } catch (err) {
    console.error(err);
    // back to OPEN so host can retry
    const sessionManager = req.app.locals.sessionManager;
    await sessionManager.transitionPhase(req.params.code, 'OPEN');
    res.status(500).json({ error: 'Clustering failed. You can retry.' });
  }
});

// host triggers expansion — generates ai previewed questions and contextual facts
router.post('/sessions/:code/expand', async (req, res) => {
  try {
    const { code } = req.params;
    const sessionManager = req.app.locals.sessionManager;
    const wsManager = req.app.locals.wsManager;
    const session = sessionManager.getSession(code);

    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.phase !== 'RESULTS') return res.status(400).json({ error: 'Can only expand from RESULTS phase' });
    if (session.clusters.length === 0) return res.status(400).json({ error: 'No clusters to expand' });

    // transition to expanding and notify all
    await sessionManager.triggerExpansion(code);
    wsManager.toSession(code, 'session:expanding', { expansionRound: session.expansionRound });

    // generate previewed questions and contextual facts from current cluster state
    const preview = await clusteringEngine.generateExpansionPreview(
      session.clusters,
      session.tags,
      session.contextualFacts
    );

    // save previews to clusters and contextual facts to session
    await sessionManager.saveExpansionPreview(code, preview.clusterPreviews, preview.contextualFacts);

    // broadcast previews to all clients so everyone can select
    wsManager.toSession(code, 'expansion:preview', {
      clusterPreviews: preview.clusterPreviews,
      contextualFacts: preview.contextualFacts,
      expansionRound: session.expansionRound
    });

    res.json({
      clusterPreviews: preview.clusterPreviews,
      contextualFacts: preview.contextualFacts,
      expansionRound: session.expansionRound
    });

  } catch (err) {
    console.error(err);
    // back to RESULTS so host can retry
    const sessionManager = req.app.locals.sessionManager;
    await sessionManager.transitionPhase(req.params.code, 'RESULTS');
    res.status(500).json({ error: 'Expansion failed. You can retry.' });
  }
});

// host or participant toggles a previewed question as selected
router.post('/sessions/:code/clusters/:clusterId/select', async (req, res) => {
  try {
    const { code, clusterId } = req.params;
    const { question } = req.body;
    const sessionManager = req.app.locals.sessionManager;
    const wsManager = req.app.locals.wsManager;

    const cluster = await sessionManager.toggleSelectedQuestion(code, clusterId, question);

    // broadcast updated selected questions to all clients
    wsManager.toSession(code, 'question:selected', {
      clusterId,
      selectedQuestions: cluster.selected_questions
    });

    res.json({ clusterId, selectedQuestions: cluster.selected_questions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to toggle selected question' });
  }
});

// host or participant adds a participant answer to a cluster
router.post('/sessions/:code/clusters/:clusterId/answer', async (req, res) => {
  try {
    const { code, clusterId } = req.params;
    const { answer } = req.body;
    const sessionManager = req.app.locals.sessionManager;
    const wsManager = req.app.locals.wsManager;

    const cluster = await sessionManager.addParticipantAnswerToCluster(code, clusterId, answer);

    // broadcast new participant answer to all clients
    wsManager.toSession(code, 'cluster:answered', { clusterId, answer });

    res.json(cluster);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save answer' });
  }
});

// host promotes or demotes a participant to curator by socket id
router.post('/sessions/:code/curators', async (req, res) => {
  try {
    const { code } = req.params;
    const { socketId } = req.body;
    const sessionManager = req.app.locals.sessionManager;
    const wsManager = req.app.locals.wsManager;

    const curators = await sessionManager.promoteCurator(code, socketId);

    // broadcast updated curator list to all clients
    wsManager.toSession(code, 'curator:promoted', { curators, socketId });

    res.json({ curators });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update curator' });
  }
});

router.get('/sessions/:code', async (req, res) => {
  try {
    const sessionManager = req.app.locals.sessionManager;
    // async — falls back to Supabase if not in memory after server restart
    const session = await sessionManager.getSessionAsync(req.params.code);

    if (!session) return res.status(404).json({ error: 'Session not found, buddy' });

    res.json({
      code: session.code,
      phase: session.phase,
      tags: session.tags,
      clusters: session.clusters ?? [],
      participantCount: session.participantCount ?? 0,
      expansionRound: session.expansionRound ?? 0,
      curators: session.curators ?? [],
      contextualFacts: session.contextualFacts ?? []
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load the session, my guy' });
  }
});

router.post('/sessions/:code/end', async (req, res) => {
  try {
    const sessionManager = req.app.locals.sessionManager;
    const wsManager = req.app.locals.wsManager;
    const session = sessionManager.getSession(req.params.code);

    if (!session) return res.status(404).json({ error: 'Session not found' });

    const summary = session.clusters.map(c => ({
      representativeQuery: c.representative_query,
      submissionCount: c.submission_count,
      answer: c.answer ?? null,
      participantAnswers: c.participant_answers ?? [],
      selectedQuestions: c.selected_questions ?? [],
      contextualFacts: c.contextual_facts ?? []
    }));

    // notify all clients session has ended with summary
    wsManager.toSession(req.params.code, 'session:ended', { summary });

    await sessionManager.endSession(req.params.code);
    res.json({ message: 'Session ended', summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

router.delete('/sessions/:code/clusters/:clusterId', async (req, res) => {
  try {
    const { code, clusterId } = req.params;
    const sessionManager = req.app.locals.sessionManager;
    const wsManager = req.app.locals.wsManager;

    await sessionManager.deleteCluster(code, clusterId);

    // notify all clients a cluster was deleted
    wsManager.toSession(code, 'cluster:deleted', { clusterId });

    res.json({ message: 'Cluster deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete cluster' });
  }
});

export default router;