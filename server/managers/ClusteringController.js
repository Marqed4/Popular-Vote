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