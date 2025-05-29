import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  playNext,
  playPrevious,
  togglePlayback,
  play,
  pause,
  seekTo,
  skipSong,
  playSong
} from '../controllers/playbackController.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Toggle playback (play/pause)
router.post('/:roomId/toggle', togglePlayback);

// Explicitly play
router.post('/:roomId/play', play);

// Explicitly pause
router.post('/:roomId/pause', pause);

// Skip to next song
router.post('/:roomId/next', playNext);

// Go back to previous song
router.post('/:roomId/previous', playPrevious);

// Skip with voting
router.post('/:roomId/skip', skipSong);

// Seek to position
router.post('/:roomId/seek', seekTo);

// Play specific song from queue
router.post('/:roomId/songs/:songId/play', playSong);

export default router;
