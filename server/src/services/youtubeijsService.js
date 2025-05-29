import { Innertube } from 'youtubei.js';

class YouTubeAPI {
  constructor() {
    this.innertube = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      if (!this.initialized) {
        console.log('Initializing YouTube API');
        this.innertube = await Innertube.create({ 
          gl: 'VN',
          hl: 'vi',
          generate_session_locally: true, 
        });
        this.initialized = true;
        console.log('YouTube API initialized successfully');
      }
      return this;
    } catch (error) {
      console.error('Failed to initialize YouTube API:', error);
      throw new Error('YouTube API initialization failed');
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
    return this;
  }

  /**
   * Search for content with type filtering
   * @param {string} query - Search query
   * @param {string} filterType - 'music', 'video', or 'mixed'
   * @returns {Promise<Array>} Search results
   */
  async search(query, filterType = 'mixed') {
    try {
      await this.ensureInitialized();
      
      // Search YouTube
      const searchResults = await this.innertube.search(query)
      .then(results => results.results.filter(item => item.id))
      
      // Filter results based on content type
      let results = [];
      
      if (searchResults) {
        try {
          if (typeof searchResults.selectType === 'function') {
            console.log(`Using selectType for ${filterType} content`);
            // If filterType is 'mixed', we don't apply specific filtering
            if (filterType === 'mixed') {
              results = searchResults || [];
            } else {
              const filteredResults = await searchResults.selectType(filterType);
              results = filteredResults || [];
            }
          } else {
            console.log(`selectType not available, using manual filtering for ${filterType}`);
            // If filterType is 'mixed', we don't apply filtering
            if (filterType === 'mixed') {
              results = searchResults || [];
            } else {
              // Manual filtering based on result type
              results = (searchResults || []).filter(item => {
                if (!item) return false;
                
                // Safely handle different types for itemType and itemTitle
                const itemType = item.type ? String(item.type).toLowerCase() : '';
                
                // Handle title safely - ensure it's a string before calling toLowerCase
                let itemTitle = '';
                if (item.title) {
                  itemTitle = typeof item.title === 'string' 
                    ? item.title.toLowerCase() 
                    : String(item.title).toLowerCase();
                }
                
                // Safely handle author
                let authorName = '';
                if (item.author && item.author.name) {
                  authorName = typeof item.author.name === 'string'
                    ? item.author.name.toLowerCase()
                    : String(item.author.name).toLowerCase();
                }
                
                if (filterType === 'music') {
                  return itemType.includes('song') || 
                        itemType.includes('music') || 
                        itemType.includes('album') ||
                        itemTitle.includes('official audio') ||
                        authorName.includes('music') ||
                        authorName.includes('vevo');
                } else if (filterType === 'video') {
                  return itemType.includes('video') && 
                        !itemType.includes('music') &&
                        !itemTitle.includes('official audio');
                }
                
                return true; // Should not reach here as we handle 'mixed' separately
              });
            }
          }
        } catch (filterError) {
          console.warn(`Error filtering ${filterType} results:`, filterError);
          // If filtering fails, return unfiltered results
          results = searchResults.results || [];
        }
      }
      
      // Format results for frontend consumption
      return this.formatSearchResults(results);
    } catch (error) {
      console.error('YouTube API search error:', error);
      return []; // Return empty array instead of throwing to make the app more resilient
    }
  }

  /**
   * Format search results for consistent API response
   * @param {Array} results - Raw search results from YouTube API
   * @returns {Array} Formatted results
   */
  formatSearchResults(results) {
    return results.map(item => {
      // Extract duration in seconds
      let durationSeconds = 0;
      if (item.duration) {
        if (typeof item.duration === 'object' && item.duration.seconds) {
          durationSeconds = item.duration.seconds;
        } else if (typeof item.duration === 'string') {
          // Parse duration string like "3:45" into seconds
          const parts = item.duration.split(':').map(Number);
          if (parts.length === 2) {
            durationSeconds = parts[0] * 60 + parts[1];
          } else if (parts.length === 3) {
            durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
          }
        }
      }

      // Get best available thumbnail
      let thumbnailUrl = '';
      if (Array.isArray(item.thumbnail) && item.thumbnail.length > 0) {
        // Get highest quality thumbnail
        thumbnailUrl = item.thumbnail[item.thumbnail.length - 1].url;
      } else if (item.thumbnails && item.thumbnails.length > 0) {
        // Get highest quality thumbnail
        thumbnailUrl = item.thumbnails[item.thumbnails.length - 1].url;
      }

      return {
        id: item.id || '',
        title: item.title || 'Unknown Title',
        artist: item.author ? (item.author.name || 'Unknown Artist') : 'Unknown Artist',
        artistId: item.author ? (item.author.id || '') : '',
        duration: durationSeconds,
        durationFormatted: item.duration && item.duration.text ? item.duration.text : this.formatDuration(durationSeconds),
        thumbnail: thumbnailUrl,
        type: item.type || 'Unknown',
        viewCount: item.view_count || item.viewCount || 0
      };
    });
  }

  /**
   * Format duration in seconds to MM:SS format
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration
   */
  formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Search for music only
   * @param {string} query - Search query
   * @returns {Promise<Array>} Music search results
   */
  async searchMusic(query) {
    return this.search(query, 'music');
  }

  /**
   * Get detailed information about a song
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<Object>} Formatted song information
   */
  async getSongDetails(videoId) {
    try {
      await this.ensureInitialized();
      
      const info = await this.innertube.getInfo(videoId);
      if (!info || !info.basic_info) {
        throw new Error('Failed to get video information');
      }
      
      // Format song details for frontend
      const basicInfo = info.basic_info;
      
      return {
        id: videoId,
        title: basicInfo.title || 'Unknown Title',
        artist: basicInfo.author || 'Unknown Artist',
        artistId: basicInfo.author_id || '',
        duration: basicInfo.duration || 0,
        durationFormatted: this.formatDuration(basicInfo.duration),
        thumbnail: basicInfo.thumbnail?.[0]?.url || '',
        viewCount: basicInfo.view_count || 0,
        likes: basicInfo.like_count || 0,
        description: basicInfo.description || '',
        isLive: basicInfo.is_live || false,
        streamUrl: await this.getStreamURL(videoId)
      };
    } catch (error) {
      console.error(`Error getting song details for ${videoId}:`, error);
      throw new Error('Failed to get song details');
    }
  }

  /**
   * Get streaming URL for a video
   * @param {string} videoId - YouTube video ID
   * @param {string} format - 'audio' or 'video'
   * @returns {Promise<string>} Streaming URL
   */
  async getStreamURL(videoId, format = 'audio') {
    try {
      await this.ensureInitialized();
      
      const info = await this.innertube.getStreamingData(videoId);
      if (!info || !info.streaming_data) {
        console.log(`Streaming data for ${videoId}:`, info);
        return null;
      }
      
      let streamingData;
      try {
        streamingData = format === 'audio' 
          ? await info.chooseFormat({ type: 'audio' })
          : await info.chooseFormat({ type: 'video' });
      } catch (formatError) {
        console.error('Format selection error:', formatError);
        // Try to get any format as fallback
        streamingData = await info.chooseFormat();
      }
      
      // Validate the URL before returning
      if (streamingData && streamingData.url && streamingData.url.startsWith('http')) {
        return streamingData.url;
      } else {
        console.error('Invalid stream URL received:', streamingData);
        return null;
      }
    } catch (error) {
      console.error('Get stream URL error:', error);
      throw new Error('Failed to get streaming URL');
    }
  }

  /**
   * Stream a song
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<Object>} Stream info with URL and metadata
   */
  async streamSong(videoId) {
    try {
      await this.ensureInitialized();
      
      const songDetails = await this.getSongDetails(videoId);
      const streamUrl = await this.getStreamURL(videoId, 'audio');
      
      return {
        ...songDetails,
        streamUrl
      };
    } catch (error) {
      console.error(`Error streaming song ${videoId}:`, error);
      throw new Error('Failed to stream song');
    }
  }

  /**
   * Get video recommendations for a video
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<Array>} Related videos
   */
  async getRecommendations(videoId) {
    try {
      await this.ensureInitialized();
      
      const info = await this.innertube.getInfo(videoId);
      const relatedVideos = info.related_videos || [];
      
      return this.formatSearchResults(relatedVideos);
    } catch (error) {
      console.error('Get recommendations error:', error);
      return [];
    }
  }

  /**
   * Get playlist contents
   * @param {string} playlistIdOrUrl - Playlist ID or URL
   * @returns {Promise<Object>} Playlist information and videos
   */
  async getPlaylist(playlistIdOrUrl) {
    try {
      await this.ensureInitialized();
      
      // Extract playlist ID if URL is provided
      const playlistId = playlistIdOrUrl.includes('list=') 
        ? playlistIdOrUrl.split('list=')[1].split('&')[0] 
        : playlistIdOrUrl;
      
      const playlist = await this.innertube.getPlaylist(playlistId);
      
      return {
        id: playlist.id || playlistId,
        title: playlist.title || 'Unknown Playlist',
        description: playlist.description || '',
        author: playlist.author ? playlist.author.name : 'Unknown',
        videoCount: playlist.videoCount || 0,
        videos: this.formatSearchResults(playlist.videos || [])
      };
    } catch (error) {
      console.error('Get playlist error:', error);
      throw new Error('Failed to get playlist');
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Get the YouTube API singleton instance
 * @returns {Promise<YouTubeAPI>} Initialized YouTube API
 */
export async function getYouTubeAPI() {
  if (!instance) {
    instance = new YouTubeAPI();
    await instance.initialize();
  }
  return instance;
}

export default YouTubeAPI;
