import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getUserInfo } from '../controllers/userController.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Get current user information
router.get('/me', getUserInfo);

export default router;
