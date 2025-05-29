import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  togglePlayback,
  playNext,
  seekTo,
} from '../controllers/playbackController.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Toggle playback (play/pause)
router.post('/:roomId/toggle', togglePlayback);

// Skip to next song
router.post('/:roomId/next', playNext);

// Seek to position
router.post('/:roomId/seek', seekTo);

export default router;
