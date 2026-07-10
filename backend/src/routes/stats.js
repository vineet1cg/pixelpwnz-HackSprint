import { Router } from 'express';
import { getSession } from '../store/sessionStore.js';
import { countVectors } from '../brain/chromaClient.js';

const router = Router();

router.get('/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(200).json({ session_exists: false });
    }

    const totalPairs = session.pairs.length;
    const avgReplyLength =
      totalPairs > 0
        ? parseFloat(
            (
              session.pairs.reduce((s, p) => s + p.word_count_out, 0) /
              totalPairs
            ).toFixed(1)
          )
        : 0;

    const messagesWithEmoji = session.pairs.filter(
      (p) => p.emoji_count > 0
    ).length;
    const emojiFrequency =
      totalPairs > 0
        ? parseFloat((messagesWithEmoji / totalPairs).toFixed(2))
        : 0;

    // Get actual vector count from ChromaDB (best-effort)
    let vectorCount = totalPairs;
    try {
      vectorCount = await countVectors(sessionId);
    } catch {
      // ChromaDB may not be available
    }

    res.status(200).json({
      session_exists: true,
      total_pairs: totalPairs,
      vector_count: vectorCount,
      contact_name: session.contact_name,
      avg_reply_length: avgReplyLength,
      emoji_frequency: emojiFrequency,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
