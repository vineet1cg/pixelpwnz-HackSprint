import { Router } from 'express';
import { deleteSession } from '../store/sessionStore.js';
import { deleteCollection } from '../brain/chromaClient.js';

const router = Router();

router.delete('/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    await deleteSession(sessionId);

    try {
      await deleteCollection(sessionId);
    } catch {
      // Collection may not exist — safe to ignore
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
