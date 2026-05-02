import express from 'express';
import { ClusteringController } from '../managers/ClusteringController.js';
import { SessionStore } from '../database/SessionStore.js';

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
    if (session.phase === 'ENDED') return res.status(400).json({ error: 'Session has ended' });

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
    if (session.phase !== 'OPEN' && session.phase !== 'EXPANDING') return res.status(400).json({ error: 'Session is not accepting submissions' });

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
    const clusterablePhases = ['OPEN', 'CLOSED', 'RESULTS'];
    if (!clusterablePhases.includes(session.phase)) return res.status(400).json({ error: 'Session is not in a clusterable state' });

    // transition to clustering phase and notify all
    await sessionManager.transitionPhase(code, 'CLUSTERING');
    wsManager.toSession(code, 'session:clustering');

    // --- incremental mode: answered clusters exist + new submissions since last cluster ---
    const answeredClusters = (session.clusters ?? []).filter(c => c.answer);
    const lastClusterIdx = session.submissionsAtLastCluster ?? 0;
    const newSubs = session.submissions.slice(lastClusterIdx);

    if (answeredClusters.length > 0 && newSubs.length > 0) {
      // ask Gemini to assign new submissions to existing clusters OR form new ones
      const { updatedClusters, newClusters } = await clusteringEngine.incrementalCluster(
        newSubs, answeredClusters, session.tags
      );

      // update existing clusters that received new questions
      for (const { clusterId, addedQuestions } of updatedClusters) {
        const cluster = session.clusters.find(c => String(c.id) === String(clusterId));
        if (!cluster) continue;
        cluster.questions = [...(cluster.questions ?? []), ...addedQuestions];
        cluster.submission_count = (cluster.submission_count ?? 0) + addedQuestions.length;
        // persist to Supabase (fire-and-forget — don't block the response)
        SessionStore.updateClusterQuery(clusterId, cluster.representative_query, cluster.submission_count, cluster.questions)
          .catch(err => console.error('[incremental] failed to update cluster', clusterId, err));
      }

      // insert brand-new clusters (no answer yet)
      let savedNew = [];
      if (newClusters.length > 0) {
        savedNew = await SessionStore.saveNewClusters(code, newClusters);
        session.clusters.push(...savedNew);
      }

      session.submissionsAtLastCluster = session.submissions.length;
      await sessionManager.transitionPhase(code, 'RESULTS');
      wsManager.toSession(code, 'session:results', { clusters: session.clusters, submissionsAtLastCluster: session.submissions.length });
      return res.json({ clusters: session.clusters });
    }

    // --- full cluster mode (first time, or no answered clusters yet) ---
    const clusters = await clusteringEngine.cluster(session.submissions, session.tags);

    // save and transition to results
    const saved = await sessionManager.saveClusters(code, clusters);
    session.submissionsAtLastCluster = session.submissions.length;
    await sessionManager.transitionPhase(code, 'RESULTS');

    // broadcast results
    wsManager.toSession(code, 'session:results', { clusters: saved, submissionsAtLastCluster: session.submissions.length });

    res.json({ clusters: saved });

  } catch (err) {
    console.error(err);
    // roll back phase and notify everyone so participants don't stay stuck
    const sessionManager = req.app.locals.sessionManager;
    const wsManager = req.app.locals.wsManager;
    await sessionManager.transitionPhase(req.params.code, 'CLOSED');
    wsManager.toSession(req.params.code, 'session:closed');
    res.status(500).json({ error: 'Clustering failed. You can retry.' });
  }
});

// host opens a second round — participants submit new follow-up questions
router.post('/sessions/:code/expand', async (req, res) => {
  try {
    const { code } = req.params;
    const sessionManager = req.app.locals.sessionManager;
    const wsManager = req.app.locals.wsManager;
    const session = sessionManager.getSession(code);

    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.phase !== 'RESULTS') return res.status(400).json({ error: 'Can only open a second round from RESULTS phase' });

    // transition to EXPANDING (submissions reopen) and notify everyone immediately
    await sessionManager.triggerExpansion(code);
    wsManager.toSession(code, 'session:expanding', { expansionRound: session.expansionRound });
    res.json({ phase: 'EXPANDING', expansionRound: session.expansionRound });

    // generate AI prompt suggestions async — push to participants when ready
    clusteringEngine.generateExpansionPreview(session.clusters, session.tags, session.contextualFacts)
      .then(preview => {
        wsManager.toSession(code, 'expansion:prompts', {
          prompts: preview.clusterPreviews.map(cp => ({
            clusterId: cp.clusterId,
            questions: cp.previewedQuestions,
          }))
        });
      })
      .catch(err => console.error('[expand] AI prompt generation failed:', err));

  } catch (err) {
    console.error(err);
    const sessionManager = req.app.locals.sessionManager;
    if (!res.headersSent) {
      await sessionManager.transitionPhase(req.params.code, 'RESULTS');
      res.status(500).json({ error: 'Failed to open second round. You can retry.' });
    }
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

// participant submits a question targeted at a specific cluster (during RESULTS phase)
router.post('/sessions/:code/clusters/:clusterId/submit', async (req, res) => {
  try {
    const { code, clusterId } = req.params;
    const { content } = req.body;
    const sessionManager = req.app.locals.sessionManager;
    const io = req.app.locals.io;
    const session = sessionManager.getSession(code);

    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (!content || !content.trim()) return res.status(400).json({ error: 'Question is required' });
    if (content.length > 500) return res.status(400).json({ error: 'Question exceeds 500 character limit' });

    const saved = await SessionStore.addSubmission(code, content.trim());
    session.submissions.push(saved);

    // add question to cluster's questions array
    const cluster = session.clusters.find(c => String(c.id) === String(clusterId));
    if (cluster) {
      cluster.questions = [...(cluster.questions ?? []), { text: content.trim(), upvoteCount: 0 }];
      cluster.submission_count = (cluster.submission_count ?? 0) + 1;
      await SessionStore.updateClusterQuery(clusterId, cluster.representative_query, cluster.submission_count, cluster.questions);
    }

    // emit to all clients with the new question
    io.to(code).emit('submission:count', { count: session.submissions.length });
    io.to(code).emit('cluster:submission:added', {
      clusterId,
      question: { text: content.trim(), upvoteCount: 0 },
      submissionCount: cluster?.submission_count ?? 0
    });

    res.json({ id: saved.id, content: saved.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit to cluster' });
  }
});

// host sets the main answer for a cluster
router.post('/sessions/:code/clusters/:clusterId/answer', async (req, res) => {
  try {
    const { code, clusterId } = req.params;
    const { answer } = req.body;
    const { question } = req.query;
    const sessionManager = req.app.locals.sessionManager;
    const wsManager = req.app.locals.wsManager;

    // follow-up answer — appends to participant_answers, never touches main answer
    if (question) {
      const cluster = await sessionManager.addParticipantAnswerToCluster(code, clusterId, answer);
      wsManager.toSession(code, 'cluster:followup:answered', { clusterId, answer });
      return res.json(cluster);
    }

    // main answer
    const cluster = await sessionManager.updateClusterAnswer(code, clusterId, answer);
    wsManager.toSession(code, 'cluster:answered', { clusterId, answer });
    res.json(cluster);

    clusteringEngine.generateFollowupSuggestions(cluster.representative_query, answer, cluster.questions ?? [])
      .then(suggestions => {
        if (suggestions.length) {
          wsManager.toSession(code, 'cluster:followups', { clusterId, suggestions });
        }
      })
      .catch(err => console.error('[followups] generation failed:', err));
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

// participant upvotes or un-upvotes a question within a cluster
router.post('/sessions/:code/upvote', async (req, res) => {
  try {
    const { code } = req.params;
    const { questionText, undo } = req.body;
    const sessionManager = req.app.locals.sessionManager;
    const wsManager = req.app.locals.wsManager;
    const session = sessionManager.getSession(code);

    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (!questionText) return res.status(400).json({ error: 'questionText is required' });

    let updatedCount = 0;
    for (const cluster of session.clusters) {
      const question = (cluster.questions ?? []).find(q => q.text === questionText);
      if (question) {
        question.upvoteCount = Math.max(0, (question.upvoteCount ?? 0) + (undo ? -1 : 1));
        updatedCount = question.upvoteCount;
        break;
      }
    }

    wsManager.toSession(code, 'cluster:upvote', { questionText, upvoteCount: updatedCount });
    res.json({ questionText, upvoteCount: updatedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record upvote' });
  }
});

router.patch('/sessions/:code/tags', async (req, res) => {
  try {
    const sessionManager = req.app.locals.sessionManager;
    const { code } = req.params;
    const { tags } = req.body;

    if (!Array.isArray(tags)) return res.status(400).json({ error: 'tags must be an array' });

    const session = await sessionManager.getSessionAsync(code);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const editableTagPhases = ['OPEN', 'RESULTS', 'ENDED'];
    if (!editableTagPhases.includes(session.phase)) return res.status(400).json({ error: 'Tags can only be updated in OPEN, RESULTS, or ENDED phase' });

    session.tags = tags;
    await SessionStore.updateTags(code, tags);

    res.json({ tags: session.tags });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update tags' });
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
      submissionCount: session.submissions?.length ?? 0,
      submissionsAtLastCluster: session.submissionsAtLastCluster ?? 0,
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