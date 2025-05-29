import { getYouTubeAPI } from '../services/youtubeijsService.js';

/**
 * Search for music using the YouTube API
 */
export const searchMusic = async (req, res) => {
  try {
    const { query, type } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const youtubeAPI = await getYouTubeAPI();
    const results = await youtubeAPI.search(query, type);

    res.json({ results });
  } catch (error) {
    console.error('Music search error:', error);
    res.status(500).json({ error: 'Failed to search for music' });
  }
};

/**
 * Get song details by ID
 */
export const getSongDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: 'Song ID is required' });
    }
    
    const youtubeAPI = await getYouTubeAPI();
    const songDetails = await youtubeAPI.getSongDetails(id);
    
    res.json(songDetails);
  } catch (error) {
    console.error('Get song details error:', error);
    res.status(500).json({ error: 'Failed to get song details' });
  }
};

/**
 * Get song stream URL
 */
export const getStreamURL = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: 'Song ID is required' });
    }
    
    // Try multiple methods in parallel with a race
    const [ytdlpPromise, youtubeijsPromise] = await Promise.allSettled([
      // Try with ytdlp first
      (async () => {
        try {
          const { getYTDLPManager } = await import('../services/ytdlpService.js');
          const ytdlpManager = await getYTDLPManager();
          const streamUrl = await ytdlpManager.getDirectAudioUrl(id, {
            additionalArgs: ['--force-ipv4', '--no-check-certificate']
          });
          if (streamUrl) {
            return { source: 'ytdlp', streamUrl };
          }
          throw new Error('No stream URL from ytdlp');
        } catch (error) {
          throw error;
        }
      })(),
      
      // Try with youtubeijs in parallel
      (async () => {
        try {
          const youtubeAPI = await getYouTubeAPI();
          const streamUrl = await youtubeAPI.getStreamURL(id, 'audio');
          if (streamUrl) {
            return { source: 'youtubei.js', streamUrl };
          }
          throw new Error('No stream URL from youtubei.js');
        } catch (error) {
          throw error;
        }
      })()
    ]);
    
    // Check results and use the successful one
    let result = null;
    
    // Prefer ytdlp result if available
    if (ytdlpPromise.status === 'fulfilled' && ytdlpPromise.value?.streamUrl) {
      result = ytdlpPromise.value;
    } 
    // Fallback to youtubei.js
    else if (youtubeijsPromise.status === 'fulfilled' && youtubeijsPromise.value?.streamUrl) {
      result = youtubeijsPromise.value;
    }
    
    if (result) {
      return res.json({ 
        streamUrl: result.streamUrl,
        source: result.source,
        timestamp: Date.now() 
      });
    }
    
    // If both methods fail, return an error with details
    const errors = {
      ytdlp: ytdlpPromise.status === 'rejected' ? ytdlpPromise.reason?.message : 'No URL returned',
      youtubeijs: youtubeijsPromise.status === 'rejected' ? youtubeijsPromise.reason?.message : 'No URL returned'
    };
    
    res.status(500).json({ 
      error: 'Failed to get stream URL from any source',
      details: errors
    });
  } catch (error) {
    console.error('Get stream URL error:', error);
    res.status(500).json({ error: 'Failed to get stream URL' });
  }
};

/**
 * Get song recommendations
 */
export const getRecommendations = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: 'Song ID is required' });
    }
    
    const youtubeAPI = await getYouTubeAPI();
    const recommendations = await youtubeAPI.getRecommendations(id);
    
    res.json({ recommendations });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
};

/**
 * Get playlist contents
 */
export const getPlaylist = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: 'Playlist ID is required' });
    }
    
    const youtubeAPI = await getYouTubeAPI();
    const playlist = await youtubeAPI.getPlaylist(id);
    
    res.json(playlist);
  } catch (error) {
    console.error('Get playlist error:', error);
    res.status(500).json({ error: 'Failed to get playlist' });
  }
};
