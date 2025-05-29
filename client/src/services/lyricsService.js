import axios from 'axios';

class LyricsService {
  constructor() {
    this.cache = new Map(); // Cache lyrics by songId
    this.timeMultiplier = 1000; // Default time multiplier for converting seconds to ms
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
        // Process lyrics to ensure proper time format
        const processedLyrics = this.processLyrics(response.data.lyrics);
        
        // Store in cache before returning
        this.cache.set(cacheKey, processedLyrics);
        return processedLyrics;
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching lyrics:', error);
      return null;
    }
  }
  
  /**
   * Process lyrics to ensure consistent time format
   * @param {Object} lyrics - Raw lyrics from API
   * @returns {Object} - Processed lyrics with normalized time values
   */
  processLyrics(lyrics) {
    if (!lyrics) return null;
    
    // Copy lyrics to avoid modifying the original object
    const processedLyrics = { ...lyrics };
    
    // Process each line to ensure times are in milliseconds
    if (Array.isArray(processedLyrics.lines)) {
      processedLyrics.lines = processedLyrics.lines.map(line => {
        // If line has a time property that seems to be in seconds, convert to ms
        if (line.time !== undefined && typeof line.time === 'number' && line.time < 10000) {
          return {
            ...line,
            time: Math.round(line.time * 1000) // Convert seconds to milliseconds
          };
        }
        return line;
      });
      
      // Sort lines by time for proper sequence
      processedLyrics.lines.sort((a, b) => a.time - b.time);
    } else if (processedLyrics.plainLyrics) {
      // Generate timed lines from plain lyrics
      processedLyrics.lines = processedLyrics.plainLyrics
        .split('\n')
        .map((text, index) => ({
          time: index * 5000, // 5 seconds per line
          text: text.trim() || " "
        }));
    } else {
      processedLyrics.lines = [];
    }
    
    return processedLyrics;
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
