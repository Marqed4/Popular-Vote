import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export class ClusteringController {

  async cluster(submissions, tags = []) {
    if (!submissions || submissions.length === 0) {
      throw new Error('No submissions to cluster');
    }

    // treat multi-question submissions as separate questions
    const questions = submissions.map((s, i) => `${i + 1}. ${s.content}`).join('\n');
    const tagContext = tags.length ? `The session topic is: ${tags.join(', ')}.` : '';

    const prompt = `You are helping organize anonymous questions submitted during a group session.
${tagContext}

Here are all the submitted questions:
${questions}

Your task:
- Group semantically similar questions together into clusters
- For each cluster, write a single clear representative query that captures the theme
- Count approximately how many submissions contributed to each cluster
- List the original questions that belong to each cluster
- If a submission contains multiple questions, treat each as a separate question
- Aim for 3-7 clusters depending on how many questions there are

Respond ONLY with a valid JSON array, no markdown, no explanation, just the array:
[
  {
    "representativeQuery": "clear question representing this cluster",
    "submissionCount": 3,
    "questions": ["original question 1", "original question 2", "original question 3"]
  }
]`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      const raw = response.text.trim();

      // strip markdown code as gemini returns a json
      const cleaned = raw.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/```$/, '').trim();

      const clusters = JSON.parse(cleaned);

      if (!Array.isArray(clusters)) {
        throw new Error('Gemini did not return anything');
      }

      // normalize questions to objects so all downstream code works consistently
      return clusters.map(c => ({
        ...c,
        questions: (c.questions ?? []).map(q =>
          typeof q === 'string' ? { text: q, upvoteCount: 0 } : q
        ),
      }));

    } catch (err) {
      console.error('ClusteringEngine error:', err);
      throw new Error('Clustering failed ' + err.message);
    }
  }

  async regenerateRepresentativeQuery(cluster) {
    const questions = cluster.questions.join('\n');

    const prompt = `Given these questions from a group session:
${questions}

Write a single clear representative query that captures the main theme of these questions.
Respond with ONLY the query string, nothing else.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      return response.text.trim();

    } catch (err) {
      console.error('regenerateRepresentativeQuery error:', err);
      throw new Error('Failed to regenerate query ' + err.message);
    }
  }

  // generates previewed follow-up questions and contextual facts per cluster
  // takes current clusters with answers, participant answers, and any facts already in session
  async generateFollowupSuggestions(clusterQuery, answer, questions = []) {
    const questionList = questions.slice(0, 10).map(q => `- ${q.text ?? q}`).join('\n');

    const prompt = `A group Q&A session just produced this answer from the host.

Topic/question cluster: "${clusterQuery}"
Host's answer: "${answer}"
${questionList ? `\nSome of the questions that were asked:\n${questionList}` : ''}

Generate exactly 3 short, natural follow-up questions a participant might want to ask after reading this answer. They should:
- Build directly on what was answered, not repeat it
- Be specific and concrete, not vague
- Sound like something a real person would ask
- Be under 15 words each

Respond ONLY with a valid JSON array of 3 strings, no markdown, no explanation:
["follow-up 1", "follow-up 2", "follow-up 3"]`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });
      const raw = response.text.trim()
        .replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/```$/, '').trim();
      const result = JSON.parse(raw);
      if (!Array.isArray(result)) throw new Error('Expected array');
      return result.slice(0, 3);
    } catch (err) {
      console.error('generateFollowupSuggestions error:', err);
      return [];
    }
  }

  // RAG: generate a suggested answer for a cluster grounded in the host's private notes
  async generateSuggestedAnswer(cluster, hostNotes, sessionTitle = '', sessionDescription = '') {
    const questionList = (cluster.questions ?? []).slice(0, 10).map(q => `- ${q.text ?? q}`).join('\n');

    const prompt = `You are assisting a session host in drafting a response to a group of questions.

<session_context>
${sessionTitle ? `Title: ${sessionTitle}` : ''}
${sessionDescription ? `Description: ${sessionDescription}` : ''}
</session_context>

<host_notes>
${hostNotes}
</host_notes>

<participant_questions>
Cluster theme: "${cluster.representative_query}"
${questionList}
</participant_questions>

Using ONLY information from the host notes above, draft a clear and concise response to this cluster of questions.
- Stay grounded in the notes — do not invent facts
- Be direct and helpful, 2-4 sentences
- If the notes don't contain relevant information, say so honestly
- IMPORTANT: Do NOT mention the host notes, say "based on the notes", or reveal that you used any source material. Just give the answer directly as if the host is speaking.

Respond with plain text only, no markdown, no preamble.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });
      return response.text.trim();
    } catch (err) {
      console.error('[generateSuggestedAnswer] error:', err);
      return null;
    }
  }

  // incremental clustering: assign new submissions to existing answered clusters OR create new ones
  // returns { updatedClusters: [{ clusterId, addedQuestions }], newClusters: [{ representativeQuery, submissionCount, questions }] }
  async incrementalCluster(newSubmissions, existingClusters, tags = []) {
    const tagContext = tags.length ? `The session topic is: ${tags.join(', ')}.` : '';

    const existingList = existingClusters
      .map(c => `- Cluster ID "${c.id}": "${c.representative_query}"`)
      .join('\n');

    const submissionList = newSubmissions
      .map((s, i) => `${i}: "${s.content}"`)
      .join('\n');

    const prompt = `You are helping organize new questions submitted during a live Q&A session.
${tagContext}

These clusters already exist and have been answered by the host. Do NOT change them — only add new questions to them if they fit:
${existingList}

These are NEW submissions that just came in (indexed 0 to ${newSubmissions.length - 1}):
${submissionList}

Your task:
- For each new submission, either assign it to an existing cluster (if it fits semantically) OR group it with other unassigned submissions into a new cluster
- If assigning to an existing cluster, use the exact Cluster ID string shown above
- New clusters should only be created for questions that don't fit any existing cluster
- For new clusters, write a clear representative query capturing the theme

Respond ONLY with a valid JSON object, no markdown, no explanation:
{
  "assignments": [
    { "submissionIndex": 0, "clusterId": "exact-uuid-from-above" }
  ],
  "newClusters": [
    { "representativeQuery": "theme of new questions", "submissionIndices": [1, 2] }
  ]
}`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      const raw = response.text.trim()
        .replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/```$/, '').trim();
      const result = JSON.parse(raw);

      if (!result.assignments || !result.newClusters) {
        throw new Error('Gemini returned unexpected shape');
      }

      // build updatedClusters: map clusterId → questions to add
      const addedMap = {}; // clusterId → submission[]
      for (const { submissionIndex, clusterId } of result.assignments) {
        const sub = newSubmissions[submissionIndex];
        if (!sub) continue;
        if (!addedMap[clusterId]) addedMap[clusterId] = [];
        addedMap[clusterId].push({ text: sub.content, upvoteCount: 0 });
      }

      const updatedClusters = Object.entries(addedMap).map(([clusterId, addedQuestions]) => ({
        clusterId,
        addedQuestions,
      }));

      // build newClusters: format same as regular cluster() output
      const newClusters = result.newClusters.map(nc => {
        const questions = nc.submissionIndices
          .map(i => newSubmissions[i])
          .filter(Boolean)
          .map(s => ({ text: s.content, upvoteCount: 0 }));
        return {
          representativeQuery: nc.representativeQuery,
          submissionCount: questions.length,
          questions,
        };
      });

      return { updatedClusters, newClusters };

    } catch (err) {
      console.error('incrementalCluster error:', err);
      throw new Error('Incremental clustering failed: ' + err.message);
    }
  }

  async generateExpansionPreview(clusters, tags = [], existingFacts = []) {
    const clusterSummary = clusters.map((c) => {
      const participantAnswers = (c.participant_answers ?? []).length
        ? `Participant answers:\n${c.participant_answers.map(a => `- ${a}`).join('\n')}`
        : '';
      const hostAnswer = c.answer ? `Host answer: ${c.answer}` : '';
      const selectedQuestions = (c.selected_questions ?? []).length
        ? `Previously selected follow-ups:\n${c.selected_questions.map(q => `- ${q}`).join('\n')}`
        : '';

      return `Cluster ID "${c.id}": "${c.representative_query}"
${hostAnswer}
${participantAnswers}
${selectedQuestions}`.trim();
    }).join('\n\n');

    const tagContext = tags.length ? `The session topic is: ${tags.join(', ')}.` : '';
    const factsContext = existingFacts.length
      ? `Known contextual facts from this session:\n${existingFacts.map(f => `- ${f}`).join('\n')}`
      : '';

    const prompt = `You are helping a host expand a group Q&A session into a deeper discussion.
${tagContext}

Here are the current clusters with their answers:
${clusterSummary}

${factsContext}

Your task:
- For each cluster, generate 3-5 follow-up questions that would deepen understanding
- Extract 2-4 contextual facts that are implied or stated in the answers and would be useful context going forward
- Follow-up questions should build on what was already answered, not repeat it
- Contextual facts should be concise, neutral statements of information surfaced in this session

IMPORTANT: Each cluster above has a "Cluster ID" shown in quotes. You MUST use that exact ID string as the clusterId in your response.

Respond ONLY with a valid JSON object, no markdown, no explanation:
{
  "clusterPreviews": [
    {
      "clusterId": "the exact cluster ID string from above",
      "previewedQuestions": ["follow-up question 1", "follow-up question 2", "follow-up question 3"]
    }
  ],
  "contextualFacts": ["fact 1", "fact 2", "fact 3"]
}`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      const raw = response.text.trim();

      // strip markdown code as gemini returns a json
      const cleaned = raw.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/```$/, '').trim();

      const result = JSON.parse(cleaned);

      if (!result.clusterPreviews || !Array.isArray(result.clusterPreviews)) {
        throw new Error('Gemini did not return valid expansion preview');
      }

      // remap clusterId from index to real cluster UUID — Gemini returns index strings like "0", "1"
      result.clusterPreviews = result.clusterPreviews.map(preview => ({
        ...preview,
        clusterId: clusters[parseInt(preview.clusterId)]?.id ?? preview.clusterId
      }));

      return result;

    } catch (err) {
      console.error('generateExpansionPreview error:', err);
      throw new Error('Expansion preview failed ' + err.message);
    }
  }
}