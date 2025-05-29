import express from 'express';
import { proxyRequest } from '../controllers/proxyController.js';

const router = express.Router();

// GET /api/proxy?url=https://example.com
router.get('/', proxyRequest);

// Add a specific route for media (optimized for streaming)
router.get('/media', proxyRequest);

// Add a specific route for images (optimized for image loading)
router.get('/img', proxyRequest);

export default router;
