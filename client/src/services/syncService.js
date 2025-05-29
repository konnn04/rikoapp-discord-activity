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
   * Khởi tạo service với ID phòng
   */
  initialize(roomId) {
    this.roomId = roomId;
    return this;
  }

  /**
   * Yêu cầu đồng bộ từ server
   */
  requestSync() {
    if (!this.roomId) {
      console.error('[SyncService] Không thể yêu cầu đồng bộ: Không có ID phòng');
      return false;
    }

    if (this.syncInProgress) {
      console.log('[SyncService] Đồng bộ đang diễn ra, bỏ qua yêu cầu mới');
      return false;
    }

    this.syncInProgress = true;
    
    console.log('[SyncService] Đang yêu cầu đồng bộ cho phòng:', this.roomId);
    
    socketService.requestSync(this.roomId);
    
    // Đặt timeout để tự reset trạng thái đồng bộ nếu không nhận được phản hồi
    setTimeout(() => {
      if (this.syncInProgress) {
        console.warn('[SyncService] Đồng bộ timeout, reset trạng thái');
        this.syncInProgress = false;
      }
    }, 5000);

    return true;
  }

  /**
   * Cập nhật thông tin đồng bộ
   */
  updateSyncInfo(serverTime) {
    if (!serverTime) return;
    
    this.serverTimeOffset = Date.now() - serverTime;
    this.lastSyncTime = Date.now();
    this.syncInProgress = false;
    
    if (this.onSyncCompleteCallback) {
      this.onSyncCompleteCallback();
    }
    
    console.log(`[SyncService] Cập nhật độ lệch thời gian: ${this.serverTimeOffset}ms`);
  }

  /**
   * Tính toán vị trí hiện tại dựa trên thông tin từ server
   */
  calculateCurrentPosition(basePosition, startTimestamp, serverTime) {
    if (!startTimestamp || !serverTime) return basePosition;
    
    const serverTimeNow = Date.now() - this.serverTimeOffset;
    const elapsedSinceSync = (serverTimeNow - serverTime) / 1000;
    const elapsedSinceStart = (serverTimeNow - startTimestamp) / 1000;
    
    // Sử dụng thời gian trôi qua từ khi bắt đầu nếu có
    if (elapsedSinceStart >= 0) {
      return basePosition + elapsedSinceSync;
    }
    
    return basePosition;
  }

  /**
   * Đăng ký callback khi đồng bộ hoàn tất
   */
  onSyncComplete(callback) {
    this.onSyncCompleteCallback = callback;
  }

  /**
   * Lấy trạng thái đồng bộ hiện tại
   */
  getSyncStatus() {
    return {
      inProgress: this.syncInProgress,
      lastSyncTime: this.lastSyncTime,
      serverTimeOffset: this.serverTimeOffset
    };
  }
}

export default new SyncService();
