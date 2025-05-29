import { toast } from 'react-toastify';
import { addToQueueApi, getQueueApi } from './api';
import socketService from './socket';

class QueueService {
  constructor() {
    this.queue = [];
    this.lastQueueUpdateTime = 0;
    this.roomId = null;
    this.onQueueUpdateCallback = null;
  }

  /**
   * Khởi tạo service với id phòng
   */
  initialize(roomId) {
    this.roomId = roomId;
    return this;
  }

  /**
   * Cập nhật hàng đợi
   */
  updateQueue(newQueue) {
    if (!Array.isArray(newQueue)) {
      console.error('[QueueService] Hàng đợi không hợp lệ:', newQueue);
      return false;
    }
    
    this.queue = [...newQueue];
    this.lastQueueUpdateTime = Date.now();
    
    if (this.onQueueUpdateCallback) {
      this.onQueueUpdateCallback(this.queue);
    }
    
    return true;
  }

  /**
   * Lấy hàng đợi hiện tại
   */
  getQueue() {
    return [...this.queue];
  }

  /**
   * Thêm bài hát vào hàng đợi
   */
  async addToQueue(song) {
    if (!song || !song.id) {
      toast.error('Dữ liệu bài hát không hợp lệ');
      return false;
    }

    if (!this.roomId) {
      toast.error('Không tìm thấy ID phòng');
      return false;
    }

    try {
      // Fix: Use proper API call with token and fix the request body format
      const token = localStorage.getItem('discord_token');
      if (!token) {
        toast.error('Bạn cần đăng nhập để thêm bài hát');
        return false;
      }

      const response = await fetch(`/.proxy/api/queue/${this.roomId}/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        // Fix: Đúng định dạng yêu cầu của API
        body: JSON.stringify({ song })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Không thể thêm bài hát vào hàng đợi');
      }
      
      const result = await response.json();
      
      if (result.success) {
        toast.info('Đang xử lý yêu cầu...');
        return true;
      } else {
        toast.error(result.message || 'Không thể thêm bài hát vào hàng đợi');
        return false;
      }
    } catch (error) {
      console.error('[QueueService] Lỗi khi thêm vào hàng đợi:', error);
      toast.error(error.message || 'Lỗi khi thêm bài hát vào hàng đợi');
      return false;
    }
  }

  /**
   * Xóa bài hát khỏi hàng đợi
   */
  async removeFromQueue(index) {
    if (!this.roomId) {
      toast.error('Không tìm thấy ID phòng');
      return false;
    }

    if (index < 0 || index >= this.queue.length) {
      toast.error('Chỉ số không hợp lệ');
      return false;
    }

    try {
      const songId = this.queue[index].id;
      
      const response = await fetch(`/.proxy/api/queue/${this.roomId}/${songId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('discord_token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Lỗi khi xóa bài hát');
      }

      // Server sẽ gửi lại hàng đợi mới qua socket
      return true;
    } catch (error) {
      console.error('[QueueService] Lỗi khi xóa khỏi hàng đợi:', error);
      toast.error('Không thể xóa bài hát khỏi hàng đợi');
      return false;
    }
  }

  /**
   * Xóa toàn bộ hàng đợi
   */
  async clearQueue() {
    if (!this.roomId) {
      toast.error('Không tìm thấy ID phòng');
      return false;
    }

    try {
      const response = await fetch(`/.proxy/api/queue/${this.roomId}/queue`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('discord_token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Lỗi khi xóa hàng đợi');
      }

      // Server sẽ gửi lại hàng đợi trống qua socket
      return true;
    } catch (error) {
      console.error('[QueueService] Lỗi khi xóa hàng đợi:', error);
      toast.error('Không thể xóa hàng đợi');
      return false;
    }
  }

  /**
   * Thay đổi thứ tự bài hát trong hàng đợi
   */
  async reorderQueue(fromIndex, toIndex) {
    if (!this.roomId) {
      toast.error('Không tìm thấy ID phòng');
      return false;
    }

    try {
      const response = await fetch(`/.proxy/api/queue/${this.roomId}/reorder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('discord_token')}`
        },
        body: JSON.stringify({ fromIndex, toIndex })
      });

      if (!response.ok) {
        throw new Error('Lỗi khi sắp xếp lại hàng đợi');
      }

      // Server sẽ gửi lại hàng đợi mới qua socket
      return true;
    } catch (error) {
      console.error('[QueueService] Lỗi khi sắp xếp lại hàng đợi:', error);
      toast.error('Không thể sắp xếp lại hàng đợi');
      return false;
    }
  }

  /**
   * Đăng ký callback nhận cập nhật hàng đợi
   */
  onQueueUpdate(callback) {
    this.onQueueUpdateCallback = callback;
  }
}

export default new QueueService();
