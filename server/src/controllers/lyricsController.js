import lyricsService from '../services/lyricsService.js';

/**
 * Get lyrics for a song
 */
export const getLyrics = async (req, res) => {
  try {
    const { artist_name, track_name } = req.query;
    
    // Require basic information for lyrics search
    if (!artist_name || !track_name) {
      return res.status(400).json({ error: 'Missing required parameters: artist_name and track_name' });
    }
    
    const lyrics = await lyricsService.getLyrics({ artist: artist_name, title: track_name });
    
    if (!lyrics) {
      return res.status(404).json({ error: 'Lyrics not found' });
    }
    
    return res.json({
      success: true,
      lyrics
    });
  } catch (error) {
    console.error('Error getting lyrics:', error);
    return res.status(500).json({ error: 'Server error while fetching lyrics' });
  }
};
