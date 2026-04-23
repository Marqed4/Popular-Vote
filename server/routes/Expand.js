import express from 'express';
import { ClusteringController } from '../managers/ClusteringController.js';

const router = express.Router();
const clusteringEngine = new ClusteringController();

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


    // generate previewed questions and contextual facts from current cluster state
    const preview = await clusteringEngine.generateExpansionPreview(
      session.clusters,
      session.tags,
      session.contextualFacts
    );

    // increment expansion round and save previews to clusters and contextual facts to session
    await sessionManager.triggerExpansion(code);
    await sessionManager.saveExpansionPreview(code, preview.clusterPreviews, preview.contextualFacts);

    // return to RESULTS so host can review and select questions
    await sessionManager.transitionPhase(code, 'RESULTS');

    // broadcast previews to all clients so everyone can select
    wsManager.toSession(code, 'expansion:preview', {
      clusterPreviews: preview.clusterPreviews,
      contextualFacts: preview.contextualFacts,
      expansionRound: session.expansionRound
    });

    // return all clients to results view
    wsManager.toSession(code, 'session:results', { clusters: session.clusters });

    res.json({
      clusterPreviews: preview.clusterPreviews,
      contextualFacts: preview.contextualFacts,
      expansionRound: session.expansionRound
    });

  } catch (err) {
    console.error(err);
    // back to RESULTS so host can retry
    const sessionManager = req.app.locals.sessionManager;
    await sessionManager.transitionPhase(req.params.code, 'RESULTS').catch(() => {});
    res.status(500).json({ error: 'Expansion failed. You can retry.' });
  }
});

export default router;