import lyricsService from '../services/lyricsService.js';

/**
 * Get lyrics for a song
 */
export const getLyrics = async (req, res) => {
  try {
    const { artist_name, track_name } = req.query;
    
    // Require basic information for lyrics search
    if (!artist_name || !track_name) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required parameters: artist_name and track_name' 
      });
    }
    
    console.log(`[LyricsController] Getting lyrics for "${artist_name} - ${track_name}"`);
    const lyrics = await lyricsService.getLyrics({ artist: artist_name, title: track_name });
    
    if (!lyrics) {
      console.log(`[LyricsController] No lyrics found for "${artist_name} - ${track_name}"`);
      return res.status(404).json({ 
        success: false,
        error: 'Lyrics not found',
        code: 'ERR_LYRICS_NOT_FOUND'
      });
    }
    
    return res.json({
      success: true,
      lyrics
    });
  } catch (error) {
    console.error('[LyricsController] Error getting lyrics:', error);
    return res.status(error.status || 500).json({ 
      success: false,
      error: error.message || 'Server error while fetching lyrics',
      code: error.code || 'ERR_SERVER_ERROR'
    });
  }
};
