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

router.post('/sessions/:code/join', (req, res) => {
  try {
    const sessionManager = req.app.locals.sessionManager;
    const session = sessionManager.getSession(req.params.code);

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
    const session = sessionManager.getSession(req.params.code);

    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.phase !== 'OPEN') return res.status(400).json({ error: 'Session is not open' });

    await sessionManager.transitionPhase(req.params.code, 'CLOSED');

    // notify all clients the submission window is closed
    const wsManager = req.app.locals.wsManager;
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
    if (session.phase !== 'CLOSED') return res.status(400).json({ error: 'Submission window must be closed before clustering' });

    // transition to clustering phase and notify all
    await sessionManager.transitionPhase(code, 'CLUSTERING');
    wsManager.toSession(code, 'session:clustering');

    // run clustering http://localhost:6967/GenClustering
    const clusters = await clusteringEngine.cluster(session.submissions, session.tags);

    // save and transition to results
    const saved = await sessionManager.saveClusters(code, clusters);
    await sessionManager.transitionPhase(code, 'RESULTS');

    // broadcast results
    wsManager.toSession(code, 'session:results', { clusters: saved });

    res.json({ clusters: saved });

  } catch (err) {
    console.error(err);
    // CLOSED so host can retry
    const sessionManager = req.app.locals.sessionManager;
    await sessionManager.transitionPhase(req.params.code, 'CLOSED');
    res.status(500).json({ error: 'Clustering failed. You can retry.' });
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
      answer: c.answer ?? null
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

router.post('/sessions/:code/clusters/:clusterId/answer', async (req, res) => {
  try {
    const { code, clusterId } = req.params;
    const { answer } = req.body;
    const sessionManager = req.app.locals.sessionManager;
    const wsManager = req.app.locals.wsManager;

    const cluster = await sessionManager.updateClusterAnswer(code, clusterId, answer);

    // broadcast answer to all clients
    wsManager.toSession(code, 'cluster:answered', { clusterId, answer });

    res.json(cluster);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save answer' });
  }
});

export default router;