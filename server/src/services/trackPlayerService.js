import { toast } from 'react-toastify';
import { byProxy } from './api';
import socketService from './socket';

class TrackPlayerService {
  constructor() {
    this.audioRef = null;
    this.currentSongId = null;
    this.isPlaying = false;
    this.volume = 0.5;
    this.currentPosition = 0;
    this.onErrorCallback = null;
    this.onPlayCallback = null;
    this.onPauseCallback = null;
    this.onEndedCallback = null;
    this.onProgressCallback = null;
    this.roomId = null;
    this.lastErrReport = {}; // Add tracking for last error reports
    this.endedReportSent = false; // Track if we've already reported ended for current song
    this.retryCount = 0; // Track retry attempts
    this.lastEndedTime = 0; // Track when we last ended a track
    this.stalledSince = null; // Track when playback stalled
    this.maxRetries = 3; // Maximum retry attempts for track ended reporting
    this.endedReportTimer = null; // Timer for tracking ended report retries
  }

  /**
   * Initialize audio player with reference to audio element
   */
  initialize(audioRef, roomId) {
    this.audioRef = audioRef;
    this.roomId = roomId;
    
    // Attach event handlers
    if (this.audioRef) {
      this.audioRef.addEventListener('error', this.handleError);
      this.audioRef.addEventListener('ended', this.handleEnded);
      this.audioRef.addEventListener('timeupdate', this.handleTimeUpdate);
      this.audioRef.addEventListener('play', this.handlePlay);
      this.audioRef.addEventListener('pause', this.handlePause);
      this.audioRef.addEventListener('stalled', this.handleStalled);
    }
    
    // Reset ended tracking when new room is set
    this.endedReportSent = false;
    this.retryCount = 0;
    this.lastEndedTime = 0;
    this.stalledSince = null;
    
    return () => this.cleanup();
  }

  /**
   * Release resources
   */
  cleanup() {
    if (this.audioRef) {
      this.audioRef.removeEventListener('error', this.handleError);
      this.audioRef.removeEventListener('ended', this.handleEnded);
      this.audioRef.removeEventListener('timeupdate', this.handleTimeUpdate);
      this.audioRef.removeEventListener('play', this.handlePlay);
      this.audioRef.removeEventListener('pause', this.handlePause);
      this.audioRef.removeEventListener('stalled', this.handleStalled);
    }
    
    // Clear any pending timers
    if (this.endedReportTimer) {
      clearTimeout(this.endedReportTimer);
      this.endedReportTimer = null;
    }
  }

  /**
   * Set up song and auto-play if needed
   */
  loadTrack(song, shouldPlay = false, position = 0) {
    if (!this.audioRef || !song) {
      console.error('Cannot load track:', song);
      return false;
    }

    // Reset ended flag when loading a new track
    this.endedReportSent = false;
    this.retryCount = 0;
    this.lastEndedTime = 0;
    this.stalledSince = null;
    
    // Clear any pending timers
    if (this.endedReportTimer) {
      clearTimeout(this.endedReportTimer);
      this.endedReportTimer = null;
    }

    console.log(`[TrackPlayer] Loading track: ${song.title?.text || song.title || 'Unknown'} (ID: ${song.id}) at position ${position}s`);

    // If no stream URL, try using proxy or set error
    if (!song.streamUrl) {
      console.error('Song has no stream URL:', song);
      // Report to server if we have roomId and songId
      if (this.roomId && song.id) {
        socketService.reportError({
          type: 'missingStreamUrl',
          songId: song.id,
          roomId: this.roomId
        });
        socketService.requestSync(this.roomId);
      }
      return false;
    }

    try {
      // Save current song ID
      this.currentSongId = song.id;

      // Update playback source
      const proxiedUrl = song.streamUrl.startsWith('http')
        ? `${byProxy(song.streamUrl)}&_t=${Date.now()}`
        : song.streamUrl;

      console.log(`[TrackPlayer] Loading track: ${song.title?.text || song.title || 'Unknown'} at position ${position}s`);

      this.audioRef.src = proxiedUrl;
      this.audioRef.load();
      this.audioRef.volume = this.volume;

      // Set playback position
      if (position > 0) {
        this.audioRef.currentTime = position;
        this.currentPosition = position;
      } else {
        this.currentPosition = 0;
      }

      // Play if needed
      if (shouldPlay) {
        this.isPlaying = true;
        
        const playPromise = this.audioRef.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.error('[TrackPlayer] Autoplay error:', error);
            this.isPlaying = false;
            
            if (error.name === 'NotAllowedError') {
              toast.info('Click anywhere to start playback');
              this.setupAutoplayOnInteraction();
            }
          });
        }
      } else {
        this.audioRef.pause();
        this.isPlaying = false;
      }

      return true;
    } catch (error) {
      console.error('[TrackPlayer] Error loading track:', error);
      return false;
    }
  }

  /**
   * Set up autoplay when user interacts
   */
  setupAutoplayOnInteraction() {
    const handleUserInteraction = () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
      
      if (this.audioRef && this.isPlaying) {
        this.audioRef.play().catch(e => 
          console.error('[TrackPlayer] Still cannot play after interaction:', e)
        );
      }
    };
    
    document.addEventListener('click', handleUserInteraction, { once: true });
    document.addEventListener('touchstart', handleUserInteraction, { once: true });
  }

  /**
   * Play audio
   */
  play() {
    if (!this.audioRef) return false;
    
    try {
      const playPromise = this.audioRef.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error('[TrackPlayer] Error playing:', error);
          
          if (error.name === 'NotAllowedError') {
            toast.info('Click anywhere to play music');
            this.setupAutoplayOnInteraction();
          }
          
          return false;
        });
      }
      
      this.isPlaying = true;
      return true;
    } catch (error) {
      console.error('[TrackPlayer] Exception when playing:', error);
      return false;
    }
  }

  /**
   * Pause audio
   */
  pause() {
    if (!this.audioRef) return false;
    
    try {
      this.audioRef.pause();
      this.isPlaying = false;
      return true;
    } catch (error) {
      console.error('[TrackPlayer] Error pausing:', error);
      return false;
    }
  }

  /**
   * Toggle between play and pause
   */
  togglePlayback() {
    if (!this.audioRef) return false;
    
    if (this.audioRef.paused) {
      return this.play();
    } else {
      return this.pause();
    }
  }

  /**
   * Seek to a specific position
   */
  seekTo(position) {
    if (!this.audioRef) return false;
    
    try {
      this.audioRef.currentTime = position;
      this.currentPosition = position;
      return true;
    } catch (error) {
      console.error('[TrackPlayer] Error seeking:', error);
      return false;
    }
  }

  /**
   * Set volume level
   */
  setVolume(volume) {
    if (!this.audioRef) return false;
    
    try {
      this.volume = volume;
      this.audioRef.volume = volume;
      return true;
    } catch (error) {
      console.error('[TrackPlayer] Error setting volume:', error);
      return false;
    }
  }

  /**
   * Handle error events
   */
  handleError = (e) => {
    const error = e?.target?.error;
    console.error('[TrackPlayer] Playback error:', error);
    
    // Report error to server
    if (this.roomId && this.currentSongId) {
      // Check if we already reported this exact error recently (prevent spam)
      const errorKey = `${this.currentSongId}-${error?.name || 'unknown'}`;
      const now = Date.now();
      
      if (!this.lastErrReport[errorKey] || now - this.lastErrReport[errorKey] > 10000) {
        // Only report if it's been more than 10 seconds since the last similar error
        this.lastErrReport[errorKey] = now;
        
        socketService.reportError({
          type: 'playbackError',
          songId: this.currentSongId,
          error: error?.name || 'unknown',
          message: error?.message || 'Unknown playback error',
          roomId: this.roomId
        });
        
        // Request sync after reporting an error
        socketService.requestSync(this.roomId);
      }
    }
    
    if (this.onErrorCallback) {
      this.onErrorCallback(error);
    }
  }

  /**
   * Handle track ended event
   */
  handleEnded = () => {
    // Stop playback and reset position
    this.isPlaying = false;
    if (this.audioRef) {
      this.audioRef.pause();
      this.audioRef.currentTime = 0;
    }
    
    // Record the time the track ended
    this.lastEndedTime = Date.now();
    
    // Report to server when track ends and reset retry tracking
    if (this.roomId && this.currentSongId) {
      console.log('[TrackPlayer] Track ended, reporting to server and requesting sync');
      
      // Reset the ended report flag to ensure we try reporting again
      this.endedReportSent = false;
      this.retryCount = 0;
      
      // Report track ended with retry mechanism
      this.reportTrackEnded();
      
      // Proactively request sync immediately
      setTimeout(() => {
        if (this.onProgressCallback) {
          this.onProgressCallback(0, true); // Pass true to indicate track ended
        }
        
        // Also directly request sync via socket
        socketService.requestSync(this.roomId);
      }, 300);
      
      // Set a backup timer to re-check if we're still on the same song after some time
      setTimeout(() => {
        if (this.currentSongId && !this.isPlaying) {
          console.log('[TrackPlayer] Still on same song after track ended, requesting another sync');
          socketService.requestSync(this.roomId, { 
            forcedSync: true,
            reason: 'trackEndedTimeout',
            songId: this.currentSongId
          });
        }
      }, 3000);
    }
    
    if (this.onEndedCallback) {
      this.onEndedCallback();
    }
  }
  
  /**
   * Report track ended with enhanced retry mechanism
   */
  reportTrackEnded() {
    if (!this.roomId || !this.currentSongId) return;
    
    // If we've already successfully reported for this track, don't repeat
    if (this.endedReportSent) return;
    
    // Clear any existing timer
    if (this.endedReportTimer) {
      clearTimeout(this.endedReportTimer);
      this.endedReportTimer = null;
    }
    
    console.log(`[TrackPlayer] Reporting track ended for song ${this.currentSongId}, attempt ${this.retryCount}`);
    
    // First try the direct socket service method
    socketService.reportEvent({
      type: 'trackEnded',
      songId: this.currentSongId,
      roomId: this.roomId,
      timestamp: Date.now(),
      retryCount: this.retryCount,
      clientTime: Date.now()
    }).then(() => {
      console.log(`[TrackPlayer] Track ended report sent successfully after ${this.retryCount} retries`);
      this.endedReportSent = true;
      this.retryCount = 0;
      
      // Always request sync after reporting track ended
      setTimeout(() => {
        socketService.requestSync(this.roomId);
      }, 300);
    }).catch(err => {
      console.error('[TrackPlayer] Failed to report track ended:', err);
      
      // Try again via clientEvent socket event as a backup approach
      socketService.socket.emit('clientEvent', {
        type: 'trackEnded',
        songId: this.currentSongId,
        roomId: this.roomId,
        timestamp: Date.now(),
        retryCount: this.retryCount
      });
      
      // Retry logic with shorter timeout
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        const delay = Math.min(800 * this.retryCount, 3000); // Faster retry, max 3 seconds
        
        console.log(`[TrackPlayer] Will retry reporting track ended in ${delay}ms (attempt ${this.retryCount})`);
        
        this.endedReportTimer = setTimeout(() => {
          this.reportTrackEnded();
        }, delay);
      } else {
        console.error('[TrackPlayer] Max retries reached for track ended reporting');
        // Force a sync request when max retries reached
        socketService.requestSync(this.roomId, {
          forcedSync: true,
          maxRetriesReached: true
        });
      }
    });
  }

  /**
   * Handle time update event
   */
  handleTimeUpdate = () => {
    if (!this.audioRef) return;
    
    this.currentPosition = this.audioRef.currentTime;
    
    // Reset stalled state if we're making progress
    if (this.stalledSince !== null) {
      this.stalledSince = null;
    }
    
    // Check if we're near the end of the song - if so, prepare for end
    if (this.audioRef.duration && 
        !this.endedReportSent && 
        this.currentPosition >= this.audioRef.duration - 0.5) {
      console.log('[TrackPlayer] Near end of track, preparing ended report');
      
      // Some browsers/situations might not trigger 'ended' event
      // so we'll manually trigger our ended handler
      this.handleEnded();
    }
    
    if (this.onProgressCallback) {
      // Notify if we're approaching the end of the track
      const isNearEnd = this.audioRef.duration && 
                      this.currentPosition >= this.audioRef.duration - 1.5;
                      
      this.onProgressCallback(this.currentPosition, isNearEnd);
    }
  }

  /**
   * Handle play event
   */
  handlePlay = () => {
    this.isPlaying = true;
    this.stalledSince = null; // Reset stalled state on successful play
    
    if (this.onPlayCallback) {
      this.onPlayCallback();
    }
  }

  /**
   * Handle pause event
   */
  handlePause = () => {
    this.isPlaying = false;
    
    if (this.onPauseCallback) {
      this.onPauseCallback();
    }
  }

  /**
   * Handle stalled event
   */
  handleStalled = () => {
    console.warn('[TrackPlayer] Phát nhạc bị treo');
    
    // Record when the playback stalled
    this.stalledSince = Date.now();
    
    // Báo lên server
    if (this.roomId && this.currentSongId) {
      const socketService = require('./socket').default;
      socketService.reportError({
        type: 'playbackStalled',
        songId: this.currentSongId,
        roomId: this.roomId,
        position: this.currentPosition,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Register error callback
   */
  onError(callback) {
    this.onErrorCallback = callback;
  }

  /**
   * Register ended callback
   */
  onEnded(callback) {
    this.onEndedCallback = callback;
  }

  /**
   * Register progress update callback
   */
  onProgress(callback) {
    this.onProgressCallback = callback;
  }

  /**
   * Register play event callback
   */
  onPlay(callback) {
    this.onPlayCallback = callback;
  }

  /**
   * Register pause event callback
   */
  onPause(callback) {
    this.onPauseCallback = callback;
  }
}

export default new TrackPlayerService();
