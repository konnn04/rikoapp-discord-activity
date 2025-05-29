import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getRoomInfo,
  joinRoom,
  leaveRoom,
  getParticipants
} from '../controllers/roomController.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Get room information
router.get('/:roomId', getRoomInfo);

// Join a room
router.post('/:roomId/join', joinRoom);

// Leave a room
router.post('/:roomId/leave', leaveRoom);

// Get room participants
router.get('/:roomId/participants', getParticipants);


export default router;
