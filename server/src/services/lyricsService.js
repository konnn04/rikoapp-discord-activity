import fetch from 'node-fetch';
import NodeCache from 'node-cache';

class LyricsService {
  constructor() {
    // Cache lyrics with 7-day TTL
    this.cache = new NodeCache({ stdTTL: 7 * 24 * 60 * 60, checkperiod: 24 * 60 * 60 });
  }

  /**
   * Get lyrics for a song from cache or lrclib.net API
   * @param {Object} song - Song information object
   * @returns {Promise<Object>} - Lyrics data or null if not found
   */
  async getLyrics(song) {
    if (!song) return null;

    try {
      // Extract information
      const artistName = this.extractArtistName(song);
      const trackName = this.extractTrackName(song);
      
      if (!artistName || !trackName) {
        console.log('Insufficient information to search for lyrics');
        return null;
      }

      // Create cache key
      const cacheKey = `lyrics_${artistName.toLowerCase()}_${trackName.toLowerCase()}`;
      
      // Check if we have it in cache
      const cachedLyrics = this.cache.get(cacheKey);
      if (cachedLyrics) {
        console.log(`Serving cached lyrics for: ${artistName} - ${trackName}`);
        return cachedLyrics;
      }

      // Create URL with required parameters
      const params = new URLSearchParams({
        artist_name: artistName,
        track_name: trackName
      });

      const url = `https://lrclib.net/api/get?${params.toString()}`;
      
      console.log(`Searching for lyrics: ${artistName} - ${trackName}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // If no data found, return null
      if (!data || (!data.syncedLyrics && !data.plainLyrics)) {
        console.log(`No lyrics found for: ${artistName} - ${trackName}`);
        return null;
      }
      
      // Process lyrics into standard format
      const processedLyrics = this.processLyrics(data, artistName, trackName);
      
      // Only cache if lyrics were found
      if (processedLyrics && (processedLyrics.lines.length > 0)) {
        this.cache.set(cacheKey, processedLyrics);
      }
      
      return processedLyrics;
    } catch (error) {
      console.error('Error fetching lyrics:', error);
      return null;
    }
  }
  
  /**
   * Extract artist name from song information
   */
  extractArtistName(song) {
    // Try different fields in priority order
    let artist = song.artist || 
           song.artistName || 
           song.channel || 
           song.channelName ||
           song.author ||
           'Unknown Artist';
    
    // Remove " - Topic" from artist name to improve search success
    artist = artist.replace(/\s+-\s+Topic$/, '')
                  .replace(/\s+Topic$/, '')
                  .replace(/\s+-\s+Official$/, '')
                  .replace(/\s+Official$/, '');
    
    return artist;
  }
  
  /**
   * Extract track name from song information
   */
  extractTrackName(song) {
    // Try different fields in priority order
    let title = song.title?.text || song.title || song.name || '';
    
    // Remove extra information typically found in YouTube video titles
    title = title
      .replace(/\(Official Video\)/i, '')
      .replace(/\(Official Audio\)/i, '')
      .replace(/\(Official Music Video\)/i, '')
      .replace(/\(Lyrics\)/i, '')
      .replace(/\(Lyric Video\)/i, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/Official Video/i, '')
      .replace(/Official Audio/i, '')
      .replace(/Official Music Video/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
      
    return title;
  }
  
  /**
   * Process lyrics data into standard format
   */
  processLyrics(data, artistName, trackName) {
    // Use synced lyrics if available, otherwise use plain lyrics
    if (data.syncedLyrics) {
      return {
        id: data.id,
        artist: data.artistName || artistName,
        title: data.trackName || trackName,
        album: data.albumName,
        duration: data.duration,
        lines: this.parseSyncedLyrics(data.syncedLyrics),
        plainText: data.plainLyrics,
        synced: true
      };
    } else if (data.plainLyrics) {
      return {
        id: data.id,
        artist: data.artistName || artistName,
        title: data.trackName || trackName,
        album: data.albumName,
        duration: data.duration,
        lines: this.parsePlainLyrics(data.plainLyrics),
        plainText: data.plainLyrics,
        synced: false
      };
    }
    
    return null;
  }
  
  /**
   * Parse synced lyrics into array of lines with timestamps
   */
  parseSyncedLyrics(syncedLyrics) {
    if (!syncedLyrics) return [];
    
    return syncedLyrics
      .split('\n')
      .map(line => {
        // Format: [mm:ss.xx] text
        const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2})\](.*)/);
        if (match) {
          const minutes = parseInt(match[1], 10);
          const seconds = parseInt(match[2], 10);
          const hundredths = parseInt(match[3], 10);
          const text = match[4].trim();
          
          // Calculate total time in seconds
          const time = minutes * 60 + seconds + hundredths / 100;
          
          return { time, text };
        }
        
        // If not matching the format, return line without timestamp
        return { time: 0, text: line.trim() };
      })
      .filter(line => line.text); // Filter out empty lines
  }
  
  /**
   * Parse plain lyrics into array of lines
   * Distribute timestamps evenly across lines
   */
  parsePlainLyrics(plainLyrics) {
    if (!plainLyrics) return [];
    
    const lines = plainLyrics
      .split('\n')
      .filter(line => line.trim());
    
    // Distribute time evenly across lines
    // Assume song is 3 minutes (180 seconds) if duration not known
    const estimatedDuration = 180;
    const timePerLine = estimatedDuration / lines.length;
    
    return lines.map((text, index) => ({
      time: index * timePerLine,
      text: text.trim()
    }));
  }
}

export default new LyricsService();
