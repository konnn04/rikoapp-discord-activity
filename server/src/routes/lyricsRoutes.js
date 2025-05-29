import express from 'express';
import { getLyrics } from '../controllers/lyricsController.js';

const router = express.Router();

// Get lyrics for a song
router.get('/', getLyrics);

export default router;
