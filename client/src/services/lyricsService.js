import axios from 'axios';

class LyricsService {
  constructor() {
    this.cache = new Map(); // Cache lyrics by songId
  }

  /**
   * Get lyrics for a song
   * @param {Object} song - Song object with id, title, artist properties
   * @returns {Promise<Object>} - Lyrics object with lines property
   */
  async getLyrics(song) {
    if (!song) return null;
    
    const cacheKey = song.id;
    
    // Return from cache if available
    if (this.cache.has(cacheKey)) {
      console.log('Returning lyrics from cache for:', song.title?.text || song.title);
      return this.cache.get(cacheKey);
    }
    
    try {
      // Extract artist from song object
      const artist = song.artist || song.channel?.name || '';
      
      // Extract title
      const title = song.title?.text || song.title || '';
      
      if (!artist || !title) {
        console.error('Missing artist or title for lyrics search');
        return null;
      }
      
      // Try to fetch lyrics from API
      const params = new URLSearchParams({
        artist_name: artist,
        track_name: title
      });
      
      const response = await axios.get(`/.proxy/api/lyrics?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('discord_token')}`
        }
      });
      
      if (response.data?.success && response.data?.lyrics) {
        // Store in cache before returning
        this.cache.set(cacheKey, response.data.lyrics);
        return response.data.lyrics;
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching lyrics:', error);
      return null;
    }
  }
  
  /**
   * Get YouTube search URL for a song
   * @param {Object} song - Song object
   * @returns {string} - YouTube search URL
   */
  getYouTubeSearchUrl(song) {
    if (!song) return null;
    
    // If song already has a YouTube ID, use it
    if (song.id && song.id.length > 10) {
      return `https://www.youtube.com/watch?v=${song.id}`;
    }
    
    // Otherwise build a search URL
    let searchQuery = '';
    
    if (song.artist) {
      searchQuery += `${song.artist} - `;
    }
    
    searchQuery += song.title?.text || song.title || '';
    
    if (!searchQuery) return null;
    
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
  }
  
  /**
   * Clear the lyrics cache
   */
  clearCache() {
    this.cache.clear();
  }
}

export default new LyricsService();
