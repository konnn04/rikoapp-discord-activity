import express from 'express';
import { 
  searchMusic, 
  getSongDetails, 
  getStreamURL, 
  getRecommendations,
  getPlaylist
} from '../controllers/musicController.js';

const router = express.Router();

// Search for music
router.get('/search', searchMusic);

// Get song details
router.get('/song/:id', getSongDetails);

// Get song stream URL
router.get('/stream/:id', getStreamURL);

// Get song recommendations
router.get('/recommendations/:id', getRecommendations);

// Get playlist contents
router.get('/playlist/:id', getPlaylist);

// Add to queue 
// Note: This endpoint is not implemented in the original code, but you can add it if needed

export default router;