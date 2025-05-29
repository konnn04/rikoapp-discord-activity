import axios from 'axios';

class LyricsService {
  constructor() {
    this.apiBaseUrl = process.env.LYRICS_API_URL || 'https://lrclib.net/api';
    this.cache = new Map();
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours in ms
    this.maxRetries = 2;
  }

  /**
   * Get lyrics for a song
   * @param {Object} params - Parameters including artist and title
   * @returns {Promise<Object|null>} - Lyrics object or null if not found
   */
  async getLyrics({ artist, title }) {
    if (!artist || !title) {
      throw new Error('Artist and title are required to fetch lyrics');
    }

    // Filter artist name to remove "-topic" or "official" suffixes
    const filteredArtist = this.filterArtistName(artist);

    // Check cache first
    const cacheKey = `${filteredArtist}:${title}`.toLowerCase();
    if (this.cache.has(cacheKey)) {
      const cacheEntry = this.cache.get(cacheKey);
      const now = Date.now();
      
      // Return from cache if not expired
      if (now - cacheEntry.timestamp < this.cacheExpiry) {
        console.log(`[LyricsService] Cache hit for "${filteredArtist} - ${title}"`);
        return cacheEntry.data;
      } else {
        // Remove expired entry
        this.cache.delete(cacheKey);
      }
    }

    return this.fetchWithRetry(filteredArtist, title);
  }

  /**
   * Filter artist name to remove common suffixes like "-topic" or "official"
   */
  filterArtistName(artist) {
    if (!artist) return '';
    
    // Remove "-topic" suffix
    let filtered = artist.replace(/\s*-\s*topic$/i, '');
    
    // Remove "official" suffix
    filtered = filtered.replace(/\s*official$/i, '');
    
    return filtered.trim();
  }

  /**
   * Fetch lyrics with retry logic
   */
  async fetchWithRetry(artist, title, attempt = 0) {
    try {
      console.log(`[LyricsService] Fetching lyrics for "${artist} - ${title}" (attempt ${attempt + 1})`);
      
      // Encode URI components to handle special characters
      const encodedArtist = encodeURIComponent(artist);
      const encodedTitle = encodeURIComponent(title);
      
      // Using the correct API endpoint format
      const response = await axios.get(`${this.apiBaseUrl}/get?artist_name=${encodedArtist}&track_name=${encodedTitle}`, {
        timeout: 5000, // 5 second timeout
        headers: {
          'User-Agent': 'LyricsService/1.0'
        }
      });

      // Check if we have lyrics data - properly handle the API response
      if (response.status === 200 && response.data) {
        // Process the response according to the API format
        const data = response.data;
        
        // Create a standardized lyrics object with the available data
        const lyricsObj = {
          id: data.id,
          title: data.trackName || title,
          artist: data.artistName || artist,
          album: data.albumName || '',
          plainLyrics: data.plainLyrics || null,
          syncedLyrics: data.syncedLyrics || null,
          duration: data.duration || 0,
          instrumental: data.instrumental || false,
          // Ensure there's always a lines array
          lines: this.parseLyrics(data)
        };

        // Cache the result
        this.cache.set(`${artist}:${title}`.toLowerCase(), {
          data: lyricsObj,
          timestamp: Date.now()
        });

        return lyricsObj;
      }
      
      return null;
    } catch (error) {
      // Create a structured error object for better handling
      const errorInfo = {
        status: error.response?.status || 500,
        message: error.message || 'Unknown error',
        code: error.code || 'ERR_UNKNOWN'
      };
      
      console.error(`[LyricsService] Error fetching lyrics (attempt ${attempt + 1}):`, 
        errorInfo.status, errorInfo.message);
      
      // Don't retry on 404 errors - lyrics just don't exist
      if (error.response?.status === 404) {
        console.log(`[LyricsService] Lyrics not found for "${artist} - ${title}", returning null`);
        return null;
      }
      
      // Try alternative service if we failed with the primary one
      if (attempt === 0) {
        try {
          // Try an alternative lyrics source
          const backupUrl = `https://api.lyrics.app/v1/lyrics/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
          const response = await axios.get(backupUrl, { timeout: 5000 });
          
          if (response.status === 200 && response.data?.lyrics) {
            // Format the backup response to match our standard structure
            const plainLyrics = response.data.lyrics;
            return {
              title: title,
              artist: artist,
              plainLyrics: plainLyrics,
              syncedLyrics: null,
              // Add a basic lines array with the lyrics split by newlines
              lines: plainLyrics.split('\n').map((text, index) => ({
                time: index * 5000, // Add estimated timestamps
                text: text.trim()
              }))
            };
          }
        } catch (backupError) {
          console.error('[LyricsService] Backup lyrics source failed:', 
            backupError.response?.status || backupError.message);
        }
      }
      
      // Retry if we haven't reached max retries
      if (attempt < this.maxRetries) {
        const delay = 1000 * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s...
        console.log(`[LyricsService] Retrying in ${delay}ms...`);
        
        return new Promise(resolve => {
          setTimeout(() => {
            resolve(this.fetchWithRetry(artist, title, attempt + 1));
          }, delay);
        });
      }
      
      // All retries failed
      return null;
    }
  }

  /**
   * Parse lyrics from API response into structured format
   * @param {Object} data - API response data
   * @returns {Array} Array of lyric lines with time and text
   */
  parseLyrics(data) {
    // If we have synced lyrics, parse them if they exist
    if (data.syncedLyrics) {
      try {
        // Try to parse LRC format or other synced formats
        const lines = data.syncedLyrics
          .split('\n')
          .filter(line => line.trim())
          .map(line => {
            // Basic LRC format parser: [mm:ss.xx]Text
            const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
            if (match) {
              const minutes = parseInt(match[1]);
              const seconds = parseFloat(match[2]);
              const text = match[3].trim();
              const time = (minutes * 60 + seconds) * 1000; // Convert to ms
              return { time, text };
            }
            return null;
          })
          .filter(line => line !== null);
          
        if (lines.length > 0) return lines;
      } catch (e) {
        console.error('[LyricsService] Error parsing synced lyrics:', e);
      }
    }
    
    // Fallback to plain lyrics if synced parsing failed or doesn't exist
    if (data.plainLyrics) {
      return data.plainLyrics
        .split('\n')
        .map((text, index) => ({ 
          time: index * 5000, // Add estimated timestamps (5 sec per line)
          text: text.trim() || " " 
        }));
    }
    
    // Return empty array if no lyrics available
    return [];
  }
}

export default new LyricsService();
