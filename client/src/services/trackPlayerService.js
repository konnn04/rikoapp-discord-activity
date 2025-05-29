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
  }

  /**
   * Khởi tạo audio player với tham chiếu đến phần tử audio
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
    }
    
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

      // Thiết lập vị trí phát
      if (position > 0) {
        this.audioRef.currentTime = position;
        this.currentPosition = position;
      } else {
        this.currentPosition = 0;
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
    // Dừng phát nhạc và reset vị trí
    this.isPlaying = false;
    if (this.audioRef) {
      this.audioRef.pause();
      this.audioRef.currentTime = 0;
    }
    
    // Báo lên server khi bài hát kết thúc
    if (this.roomId && this.currentSongId) {
      console.log('[TrackPlayer] Bài hát kết thúc, thông báo server và yêu cầu đồng bộ');
      
      socketService.reportEvent({
        type: 'trackEnded',
        songId: this.currentSongId,
        roomId: this.roomId
      });
      
      // Chủ động yêu cầu đồng bộ ngay lập tức
      setTimeout(() => {
        socketService.requestSync(this.roomId);
      }, 300);
    }
    
    if (this.onEndedCallback) {
      this.onEndedCallback();
    }
  }

  /**
   * Xử lý sự kiện cập nhật thời gian
   */
  handleTimeUpdate = () => {
    if (!this.audioRef) return;
    
    this.currentPosition = this.audioRef.currentTime;
    
    if (this.onProgressCallback) {
      this.onProgressCallback(this.currentPosition);
    }
  }

  /**
   * Xử lý sự kiện phát
   */
  handlePlay = () => {
    this.isPlaying = true;
    
    if (this.onPlayCallback) {
      this.onPlayCallback();
    }
  }

  /**
   * Xử lý sự kiện tạm dừng
   */
  handlePause = () => {
    this.isPlaying = false;
    
    if (this.onPauseCallback) {
      this.onPauseCallback();
    }
  }

  /**
   * Xử lý sự kiện bị treo
   */
  handleStalled = () => {
    console.warn('[TrackPlayer] Phát nhạc bị treo');
    
    // Báo lên server
    if (this.roomId && this.currentSongId) {
      socketService.reportError({
        type: 'playbackStalled',
        songId: this.currentSongId,
        roomId: this.roomId
      });
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
