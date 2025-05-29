import { getYTDLPManager } from './ytdlpService.js';
import { getYouTubeAPI } from './youtubeijsService.js';

// Pre-initialized service instances
let ytdlpManager = null;
let youtubeAPI = null;

/**
 * Initialize all required services before server start
 * @param {Object} options - Configuration options for services
 * @returns {Promise<Object>} Initialized services
 */
export async function initializeServices(options = {}) {
  console.log('Initializing services...');
  
  try {
    // Initialize YT-DLP Manager with custom bin path if provided
    ytdlpManager = await getYTDLPManager(options.ytdlpOptions);
    console.log('YT-DLP Manager initialized');
    
    // Initialize YouTube API
    youtubeAPI = await getYouTubeAPI();
    console.log('YouTube API initialized');
    
    return {
      ytdlpManager,
      youtubeAPI
    };
  } catch (error) {
    console.error('Service initialization failed:', error);
    throw error;
  }
}

/**
 * Get the initialized YT-DLP Manager instance
 * @returns {YTDLPManager} The initialized instance
 */
export function getInitializedYTDLPManager() {
  if (!ytdlpManager) {
    throw new Error('YT-DLP Manager not initialized. Call initializeServices() first.');
  }
  return ytdlpManager;
}

/**
 * Get the initialized YouTube API instance
 * @returns {YouTubeAPI} The initialized instance
 */
export function getInitializedYouTubeAPI() {
  if (!youtubeAPI) {
    throw new Error('YouTube API not initialized. Call initializeServices() first.');
  }
  return youtubeAPI;
}
