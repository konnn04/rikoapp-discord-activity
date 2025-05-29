import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getQueue,
  addToQueue,
  removeFromQueue,
  clearQueue
} from '../controllers/queueController.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Get queue for a room
router.get('/:roomId/', getQueue);

// Add song to queue
router.post('/:roomId/add', addToQueue);

// Remove song from queue
router.delete('/:roomId/queue/:songId', removeFromQueue);

// Clear queue
router.delete('/:roomId/queue', clearQueue);

export default router;
