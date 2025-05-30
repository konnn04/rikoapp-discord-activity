import { toast } from 'react-toastify';
import socketService from './socket';

class SyncService {
  constructor() {
    this.roomId = null;
    this.serverTimeOffset = 0;
    this.lastSyncTime = 0;
    this.syncInProgress = false;
    this.onSyncCompleteCallback = null;
  }

  /**
   * Initialize service with room ID
   */
  initialize(roomId) {
    this.roomId = roomId;
    return this;
  }

  /**
   * Request sync from server
   */
  requestSync() {
    if (!this.roomId) {
      console.error('[SyncService] Cannot request sync: No room ID');
      return false;
    }

    if (this.syncInProgress) {
      console.log('[SyncService] Sync already in progress, skipping new request');
      return false;
    }

    this.syncInProgress = true;
    
    console.log('[SyncService] Requesting sync for room:', this.roomId);
    
    socketService.requestSync(this.roomId);
    
    // Set timeout to auto-reset sync state if no response
    setTimeout(() => {
      if (this.syncInProgress) {
        console.warn('[SyncService] Sync timeout, resetting state');
        this.syncInProgress = false;
      }
    }, 5000);

    return true;
  }

  /**
   * Update sync information
   */
  updateSyncInfo(serverTime) {
    if (!serverTime) return;
    
    this.serverTimeOffset = Date.now() - serverTime;
    this.lastSyncTime = Date.now();
    this.syncInProgress = false;
    
    if (this.onSyncCompleteCallback) {
      this.onSyncCompleteCallback();
    }
    
    console.log(`[SyncService] Updated time offset: ${this.serverTimeOffset}ms`);
  }

  /**
   * Calculate current position based on server info
   */
  calculateCurrentPosition(basePosition, startTimestamp, serverTime) {
    if (!startTimestamp || !serverTime) return basePosition;
    
    const serverTimeNow = Date.now() - this.serverTimeOffset;
    const elapsedSinceSync = (serverTimeNow - serverTime) / 1000;
    const elapsedSinceStart = (serverTimeNow - startTimestamp) / 1000;
    
    // Use time elapsed since start if available
    if (elapsedSinceStart >= 0) {
      return basePosition + elapsedSinceSync;
    }
    
    return basePosition;
  }

  /**
   * Register sync completion callback
   */
  onSyncComplete(callback) {
    this.onSyncCompleteCallback = callback;
  }

  /**
   * Get current sync status
   */
  getSyncStatus() {
    return {
      inProgress: this.syncInProgress,
      lastSyncTime: this.lastSyncTime,
      serverTimeOffset: this.serverTimeOffset
    };
  }

  /**
   * Get last sync time (added for compatibility)
   */
  getLastSyncTime() {
    return this.lastSyncTime;
  }
}

export default new SyncService();
