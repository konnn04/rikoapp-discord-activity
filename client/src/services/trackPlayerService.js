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
    this.maxRetries = 5; // Increase maximum retry attempts for reliability
    this.endedReportTimer = null; // Timer for tracking ended report retries
    this.endThreshold = 0.5; // Seconds before end to trigger ended event
    this.autoEndCheckInterval = null; // Timer to periodically check if we're near the end
  }

  /**
   * Initialize audio player with reference to audio element
   */
  initialize(audioRef, roomId) {
    this.audioRef = audioRef;
    this.roomId = roomId;
    
    // Gắn các event handlers
    if (this.audioRef) {
      this.audioRef.addEventListener('error', this.handleError);
      this.audioRef.addEventListener('ended', this.handleEnded);
      this.audioRef.addEventListener('timeupdate', this.handleTimeUpdate);
      this.audioRef.addEventListener('play', this.handlePlay);
      this.audioRef.addEventListener('pause', this.handlePause);
      this.audioRef.addEventListener('stalled', this.handleStalled);
      this.audioRef.addEventListener('waiting', this.handleWaiting);
    }
    
    // Reset tracking properties when initializing for a new room
    this.endedReportSent = false;
    this.retryCount = 0;
    this.lastEndedTime = 0;
    this.stalledSince = null;
    
    // Set up periodic check for tracks that might be near the end
    // This helps catch cases where the ended event might not fire
    this.autoEndCheckInterval = setInterval(() => {
      this.checkForTrackEnd();
    }, 1000);
    
    return () => this.cleanup();
  }

  /**
   * Giải phóng tài nguyên
   */
  cleanup() {
    if (this.audioRef) {
      this.audioRef.removeEventListener('error', this.handleError);
      this.audioRef.removeEventListener('ended', this.handleEnded);
      this.audioRef.removeEventListener('timeupdate', this.handleTimeUpdate);
      this.audioRef.removeEventListener('play', this.handlePlay);
      this.audioRef.removeEventListener('pause', this.handlePause);
      this.audioRef.removeEventListener('stalled', this.handleStalled);
      this.audioRef.removeEventListener('waiting', this.handleWaiting);
    }
    
    // Clear any pending timers
    if (this.endedReportTimer) {
      clearTimeout(this.endedReportTimer);
      this.endedReportTimer = null;
    }
    
    // Clear the auto end check interval
    if (this.autoEndCheckInterval) {
      clearInterval(this.autoEndCheckInterval);
      this.autoEndCheckInterval = null;
    }
  }

  /**
   * Periodically check if track should have ended
   */
  checkForTrackEnd() {
    // Only check if we have an audio element, it's playing, and we haven't already reported ended
    if (!this.audioRef || !this.isPlaying || this.endedReportSent || !this.currentSongId) {
      return;
    }
    
    try {
      // If we're near the end or past the end but didn't get an ended event
      const duration = this.audioRef.duration;
      if (duration && isFinite(duration)) {
        const timeLeft = duration - this.audioRef.currentTime;
        
        // If we're very close to the end or past it
        if (timeLeft <= this.endThreshold || this.audioRef.currentTime >= duration) {
          console.log(`[TrackPlayer] Auto-detecting track end: ${timeLeft.toFixed(2)}s left`);
          this.handleEnded();
        }
      }
    } catch (e) {
      console.error('[TrackPlayer] Error in checkForTrackEnd:', e);
    }
  }

  /**
   * Thiết lập bài hát và tự động phát nếu cần
   */
  loadTrack(song, shouldPlay = false, position = 0) {
    if (!this.audioRef || !song) {
      console.error('Không thể tải bài hát:', song);
      return false;
    }

    // Reset tracking properties when loading a new track
    this.endedReportSent = false;
    this.retryCount = 0;
    this.lastEndedTime = 0;
    this.stalledSince = null;
    this.currentPosition = position; // Explicitly set the currentPosition
    
    if (this.endedReportTimer) {
      clearTimeout(this.endedReportTimer);
      this.endedReportTimer = null;
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
      // Lưu ID bài hát hiện tại
      this.currentSongId = song.id;

      // Cập nhật nguồn phát nhạc
      const proxiedUrl = song.streamUrl.startsWith('http')
        ? `${byProxy(song.streamUrl)}&_t=${Date.now()}`
        : song.streamUrl;

      console.log(`[TrackPlayer] Đang tải bài hát: ${song.title?.text || song.title || 'Unknown'} tại vị trí ${position}s`);

      this.audioRef.src = proxiedUrl;
      this.audioRef.load();
      this.audioRef.volume = this.volume;

      // Thiết lập vị trí phát - make sure this works
      if (position > 0) {
        this.audioRef.currentTime = position;
        this.currentPosition = position;
        
        // Immediately report position to ensure UI is updated
        if (this.onProgressCallback) {
          setTimeout(() => {
            this.onProgressCallback(position, false);
          }, 50);
        }
      } else {
        this.currentPosition = 0;
        this.audioRef.currentTime = 0;
        
        // Immediately report position to ensure UI is updated
        if (this.onProgressCallback) {
          setTimeout(() => {
            this.onProgressCallback(0, false);
          }, 50);
        }
      }

      // Phát nhạc nếu cần
      if (shouldPlay) {
        this.isPlaying = true;
        
        const playPromise = this.audioRef.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.error('[TrackPlayer] Lỗi autoplay:', error);
            this.isPlaying = false;
            
            if (error.name === 'NotAllowedError') {
              toast.info('Nhấp vào bất kỳ đâu để phát nhạc');
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
      console.error('[TrackPlayer] Lỗi khi tải bài hát:', error);
      return false;
    }
  }

  /**
   * Thiết lập tự động phát khi người dùng tương tác
   */
  setupAutoplayOnInteraction() {
    const handleUserInteraction = () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
      
      if (this.audioRef && this.isPlaying) {
        this.audioRef.play().catch(e => 
          console.error('[TrackPlayer] Vẫn không thể phát sau tương tác:', e)
        );
      }
    };
    
    document.addEventListener('click', handleUserInteraction, { once: true });
    document.addEventListener('touchstart', handleUserInteraction, { once: true });
  }

  /**
   * Phát nhạc
   */
  play() {
    if (!this.audioRef) return false;
    
    try {
      const playPromise = this.audioRef.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error('[TrackPlayer] Lỗi khi phát:', error);
          
          if (error.name === 'NotAllowedError') {
            toast.info('Nhấp vào bất kỳ đâu để phát nhạc');
            this.setupAutoplayOnInteraction();
          }
          
          return false;
        });
      }
      
      this.isPlaying = true;
      return true;
    } catch (error) {
      console.error('[TrackPlayer] Ngoại lệ khi phát:', error);
      return false;
    }
  }

  /**
   * Tạm dừng phát nhạc
   */
  pause() {
    if (!this.audioRef) return false;
    
    try {
      this.audioRef.pause();
      this.isPlaying = false;
      return true;
    } catch (error) {
      console.error('[TrackPlayer] Lỗi khi tạm dừng:', error);
      return false;
    }
  }

  /**
   * Chuyển đổi giữa phát và tạm dừng
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
   * Di chuyển đến vị trí cụ thể
   */
  seekTo(position) {
    if (!this.audioRef) return false;
    
    try {
      this.audioRef.currentTime = position;
      this.currentPosition = position;
      
      // Immediately report position change
      if (this.onProgressCallback) {
        setTimeout(() => {
          this.onProgressCallback(position, false);
        }, 50);
      }
      
      return true;
    } catch (error) {
      console.error('[TrackPlayer] Lỗi khi di chuyển vị trí:', error);
      return false;
    }
  }

  /**
   * Thiết lập âm lượng
   */
  setVolume(volume) {
    if (!this.audioRef) return false;
    
    try {
      this.volume = volume;
      this.audioRef.volume = volume;
      return true;
    } catch (error) {
      console.error('[TrackPlayer] Lỗi khi thiết lập âm lượng:', error);
      return false;
    }
  }

  /**
   * Xử lý sự kiện lỗi
   */
  handleError = (e) => {
    const error = e?.target?.error;
    console.error('[TrackPlayer] Lỗi phát nhạc:', error);
    
    // Báo lỗi lên server
    if (this.roomId && this.currentSongId) {
      socketService.reportError({
        type: 'playbackError',
        songId: this.currentSongId,
        error: error?.name || 'unknown',
        message: error?.message || 'Lỗi phát nhạc không xác định',
        roomId: this.roomId
      });
    }
    
    if (this.onErrorCallback) {
      this.onErrorCallback(error);
    }
  }

  /**
   * Xử lý sự kiện kết thúc bài hát
   */
  handleEnded = () => {
    // If we've already reported this track as ended, don't report again
    if (this.endedReportSent) return;
    
    // Dừng phát nhạc và reset vị trí
    this.isPlaying = false;
    if (this.audioRef) {
      this.audioRef.pause();
      this.audioRef.currentTime = 0;
    }
    
    // Record the time the track ended
    this.lastEndedTime = Date.now();
    
    // Báo lên server khi bài hát kết thúc
    if (this.roomId && this.currentSongId) {
      console.log('[TrackPlayer] Bài hát kết thúc, thông báo server và yêu cầu đồng bộ');
      
      // Report via multiple methods for redundancy
      this.reportTrackEnded();
      
      // Also directly request sync from the server
      socketService.requestSync(this.roomId, {
        reason: 'trackEnded',
        songId: this.currentSongId,
        timestamp: Date.now()
      });
      
      setTimeout(() => {
        if (this.onProgressCallback) {
          this.onProgressCallback(0, true); // Pass true to indicate track ended
        }
      }, 300);
    }
    
    if (this.onEndedCallback) {
      this.onEndedCallback();
    }
  }
  
  /**
   * Report track ended with retry mechanism
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

    // Try both event reporting methods for redundancy
    let reportPromise;
    try {
      reportPromise = socketService.reportEvent({
        type: 'trackEnded',
        songId: this.currentSongId,
        roomId: this.roomId,
        timestamp: Date.now(),
        retryCount: this.retryCount
      });
    } catch (e) {
      reportPromise = undefined;
    }

    // Also emit directly through socket as a backup
    if (socketService.socket) {
      socketService.socket.emit('clientEvent', {
        type: 'trackEnded',
        songId: this.currentSongId,
        roomId: this.roomId,
        timestamp: Date.now(),
        retryCount: this.retryCount
      });
    }

    // Only call .then if reportPromise is a Promise
    if (reportPromise && typeof reportPromise.then === 'function') {
      reportPromise.then(() => {
        console.log(`[TrackPlayer] Track ended report sent successfully after ${this.retryCount} retries`);
        this.endedReportSent = true;
        this.retryCount = 0;

        // Always request sync after reporting track ended
        setTimeout(() => {
          socketService.requestSync(this.roomId);
        }, 500);
      }).catch(err => {
        console.error('[TrackPlayer] Failed to report track ended:', err);

        // Retry logic with more aggressive retry timing
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
    } else {
      // If no promise, fallback to marking as sent and requesting sync
      this.endedReportSent = true;
      this.retryCount = 0;
      setTimeout(() => {
        socketService.requestSync(this.roomId);
      }, 500);
    }
  }

  /**
   * Handle waiting event (browser is waiting for more data)
   */
  handleWaiting = () => {
    console.warn('[TrackPlayer] Playback waiting for data');
    
    if (this.roomId && this.currentSongId) {
      socketService.reportError({
        type: 'playbackWaiting',
        songId: this.currentSongId,
        roomId: this.roomId,
        position: this.currentPosition,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Xử lý sự kiện bị treo
   */
  handleStalled = () => {
    console.warn('[TrackPlayer] Phát nhạc bị treo');
    
    // Record when the stall happened
    this.stalledSince = Date.now();
    
    // Báo lên server
    if (this.roomId && this.currentSongId) {
      socketService.reportError({
        type: 'playbackStalled',
        songId: this.currentSongId,
        roomId: this.roomId,
        position: this.currentPosition,
        timestamp: Date.now()
      });
      
      // If we're close to the end of the track and stalled, report as ended
      if (this.audioRef && this.currentPosition > 0 && 
          this.audioRef.duration && 
          this.currentPosition >= this.audioRef.duration - 3) {
        console.log('[TrackPlayer] Stalled near end of track, reporting as ended');
        this.handleEnded();
      }
    }
  }

  /**
   * Xử lý sự kiện cập nhật thời gian
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
        this.currentPosition >= this.audioRef.duration - this.endThreshold) {
      console.log('[TrackPlayer] Approaching end of track, preparing ended report');
      
      // Some browsers/situations might not trigger 'ended' event reliably
      this.handleEnded();
    }
    
    if (this.onProgressCallback) {
      // Check if we're very close to the end to provide an early signal
      const isNearEnd = this.audioRef.duration && 
                      this.currentPosition >= this.audioRef.duration - 1.5;
                      
      this.onProgressCallback(this.currentPosition, isNearEnd);
    }
  }

  /**
   * Đăng ký callback xử lý lỗi
   */
  onError(callback) {
    this.onErrorCallback = callback;
  }

  /**
   * Đăng ký callback xử lý kết thúc bài hát
   */
  onEnded(callback) {
    this.onEndedCallback = callback;
  }

  /**
   * Đăng ký callback xử lý cập nhật tiến trình
   */
  onProgress(callback) {
    this.onProgressCallback = callback;
  }

  /**
   * Đăng ký callback xử lý sự kiện phát
   */
  onPlay(callback) {
    this.onPlayCallback = callback;
  }

  /**
   * Đăng ký callback xử lý sự kiện tạm dừng
   */
  onPause(callback) {
    this.onPauseCallback = callback;
  }
}

export default new TrackPlayerService();
