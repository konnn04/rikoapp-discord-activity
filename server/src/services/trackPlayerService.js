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
  }

  /**
   * Set up song and auto-play if needed
   */
  loadTrack(song, shouldPlay = false, position = 0) {
    if (!this.audioRef || !song) {
      console.error('Cannot load track:', song);
      return false;
    }

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
      socketService.reportError({
        type: 'playbackError',
        songId: this.currentSongId,
        error: error?.name || 'unknown',
        message: error?.message || 'Unknown playback error',
        roomId: this.roomId
      });
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
    
    // Report to server when track ends
    if (this.roomId && this.currentSongId) {
      console.log('[TrackPlayer] Track ended, notifying server and requesting sync');
      
      socketService.reportEvent({
        type: 'trackEnded',
        songId: this.currentSongId,
        roomId: this.roomId
      });
      
      // Proactively request sync
      setTimeout(() => {
        socketService.requestSync(this.roomId);
      }, 300);
    }
    
    if (this.onEndedCallback) {
      this.onEndedCallback();
    }
  }

  /**
   * Handle time update event
   */
  handleTimeUpdate = () => {
    if (!this.audioRef) return;
    
    this.currentPosition = this.audioRef.currentTime;
    
    if (this.onProgressCallback) {
      this.onProgressCallback(this.currentPosition);
    }
  }

  /**
   * Handle play event
   */
  handlePlay = () => {
    this.isPlaying = true;
    
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
    console.warn('[TrackPlayer] Playback stalled');
    
    // Report to server
    if (this.roomId && this.currentSongId) {
      socketService.reportError({
        type: 'playbackStalled',
        songId: this.currentSongId,
        roomId: this.roomId
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
