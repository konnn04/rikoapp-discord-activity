import { toast } from 'react-toastify';
import { imageProxy } from './proxy';

class DiscordActivityService {
  constructor() {
    this.sdk = null;
    this.isReady = false;
    this.currentActivity = null;
    this.activityTimeoutId = null;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.lastUpdateTime = 0; // Track last update time
    this.updateThrottleMs = 10000; // Minimum 10 seconds between updates for same song
    this.pendingUpdate = null; // Store pending update if being throttled
  }

  /**
   * Initialize the Discord Activity service with Discord SDK
   * @param {Object} discordSdk - Discord SDK instance 
   */
  initialize(discordSdk) {
    if (!discordSdk) {
      console.error('Discord SDK is required for DiscordActivityService');
      return false;
    }

    this.sdk = discordSdk;
    this.isReady = true;
    this.retryCount = 0;
    console.log('Discord Activity Service initialized');
    
    return true;
  }

  /**
   * Update Discord activity based on the current song
   * @param {Object} song - Current song object
   * @param {Boolean} isPlaying - Whether the song is currently playing
   * @param {Number} currentPosition - Current playback position in seconds
   */
  async updateActivity(song, isPlaying, currentPosition = 0) {
    if (!this.isReady || !this.sdk) {
      console.warn('Discord Activity Service not ready');
      return false;
    }

    // Handle case where there's no song
    if (!song) {
      return await this.clearActivity();
    }

    // Check if we really need to update the activity
    if (!this.needsUpdate(song, isPlaying, currentPosition)) {
      // console.log('Skipping Discord activity update - no significant change');
      return false;
    }

    // Throttle updates for the same song to avoid spamming the API
    const now = Date.now();
    if (this.currentActivity?.songId === song.id && 
        now - this.lastUpdateTime < this.updateThrottleMs) {
      
      // If we have a pending update, clear it
      if (this.pendingUpdate) {
        clearTimeout(this.pendingUpdate);
      }
      
      // Schedule update for later
      this.pendingUpdate = setTimeout(() => {
        this.updateActivity(song, isPlaying, currentPosition);
        this.pendingUpdate = null;
      }, this.updateThrottleMs - (now - this.lastUpdateTime));
      
      return false;
    }

    // Clear any pending activity updates
    this.clearActivityTimeout();
    
    try {
      // Extract song details
      const title = song.title?.text || song.title || 'Unknown Song';
      const artist = song.artist || song.channel || 'Unknown Artist';
      const thumbnail = song.thumbnail || (song.thumbnails?.[0]?.url || '');
      const duration = song.duration || 0;

      // Calculate timestamps
      let timestamps = {};
      if (isPlaying && duration) {
        const now = Date.now();
        const startTime = Math.floor(now / 1000 - currentPosition);
        const endTime = Math.floor(startTime + duration);
        
        timestamps = {
          start: startTime,
          end: endTime
        };
      }

      // Create activity object
      const activity = {
        type: 2, // Listening
        state: title,
        details: artist,
        timestamps: isPlaying ? timestamps : undefined,
      };

      // Add assets if thumbnail is available
      if (thumbnail) {
        activity.assets = {
          large_image: thumbnail,
          large_text: `Listening to ${title}`,
        };
      }

      // Set Discord activity
      console.log('Setting Discord activity once:', activity);
      await this.sdk.commands.setActivity({ activity });
      
      // Update tracking variables
      this.lastUpdateTime = Date.now();
      this.currentActivity = {
        songId: song.id,
        isPlaying,
        position: currentPosition,
        title,
        artist
      };

      // Schedule automatic update if playing (every 30 seconds)
      if (isPlaying) {
        this.activityTimeoutId = setTimeout(() => {
          this.updateActivity(song, isPlaying, currentPosition + 30);
        }, 30000); // Increase from 15s to 30s for less frequent updates
      }

      return true;
    } catch (error) {
      console.error('Failed to update Discord activity:', error);
      
      // Retry a limited number of times
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        console.log(`Retrying activity update (${this.retryCount}/${this.maxRetries})...`);
        
        // Exponential backoff
        setTimeout(() => {
          this.updateActivity(song, isPlaying, currentPosition);
        }, 1000 * this.retryCount);
      } else {
        // Reset retry count and notify user
        this.retryCount = 0;
        toast.error('Could not update Discord status', { autoClose: 3000 });
      }
      
      return false;
    }
  }

  /**
   * Update activity with paused state
   * @param {Object} song - Current song object 
   * @param {Number} currentPosition - Current playback position
   */
  async setPausedActivity(song, currentPosition = 0) {
    if (!song) return this.clearActivity();
    
    // Check if we need to update (prevent redundant calls)
    if (this.currentActivity?.songId === song.id && 
        this.currentActivity?.isPlaying === false) {
      // Already showing this song as paused
      return false;
    }
    
    // Get current song info
    const title = song.title?.text || song.title || 'Unknown Song';
    const artist = song.artist || song.channel || 'Unknown Artist';
    const thumbnail = song.thumbnail || (song.thumbnails?.[0]?.url || '');
    
    // Apply throttling for paused status too
    const now = Date.now();
    if (this.currentActivity?.songId === song.id && 
        now - this.lastUpdateTime < this.updateThrottleMs) {
      return false;
    }
    
    try {
      // Create paused activity state (no timestamps)
      const activity = {
        type: 2, // Listening
        state: `${title} (Paused)`,
        details: artist,
      };

      if (thumbnail) {
        activity.assets = {
          large_image: imageProxy(thumbnail),
          large_text: `Paused: ${title}`,
        };
      }

      // Set the activity
      await this.sdk.commands.setActivity({ activity });
      
      // Update tracking variables
      this.lastUpdateTime = Date.now();
      this.currentActivity = {
        songId: song.id,
        isPlaying: false,
        position: currentPosition,
        title,
        artist
      };
      
      return true;
    } catch (error) {
      console.error('Failed to set paused activity:', error);
      return false;
    }
  }

  /**
   * Clear Discord activity
   */
  async clearActivity() {
    this.clearActivityTimeout();
    
    if (!this.isReady || !this.sdk) return false;
    
    // Don't clear if already cleared
    if (this.currentActivity === null) return false;
    
    try {
      await this.sdk.commands.setActivity({});
      this.currentActivity = null;
      return true;
    } catch (error) {
      console.error('Failed to clear Discord activity:', error);
      return false;
    }
  }
  
  /**
   * Clear any pending activity updates
   */
  clearActivityTimeout() {
    if (this.activityTimeoutId) {
      clearTimeout(this.activityTimeoutId);
      this.activityTimeoutId = null;
    }
    
    if (this.pendingUpdate) {
      clearTimeout(this.pendingUpdate);
      this.pendingUpdate = null;
    }
  }
  
  /**
   * Check if we need to update the activity
   * @param {Object} song - Current song 
   * @param {Boolean} isPlaying - Current playing state
   * @param {Number} position - Current position
   * @returns {Boolean} - Whether update is needed
   */
  needsUpdate(song, isPlaying, position) {
    // No current activity, definitely need update
    if (!this.currentActivity) return true;
    
    // Different song or playback state changed
    if (!song && this.currentActivity) return true;
    if (song && song.id !== this.currentActivity.songId) return true;
    if (isPlaying !== this.currentActivity.isPlaying) return true;
    
    // For playing songs, only update if position changed significantly (more than 30 seconds)
    if (isPlaying && Math.abs(position - this.currentActivity.position) > 30) return true;
    
    // Title or artist changed (for same song ID)
    const title = song.title?.text || song.title || 'Unknown Song';
    const artist = song.artist || song.channel || 'Unknown Artist';
    if (title !== this.currentActivity.title || artist !== this.currentActivity.artist) return true;
    
    return false;
  }
}

export default new DiscordActivityService();
