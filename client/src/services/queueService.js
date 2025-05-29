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
   * Initialize service with room ID
   */
  initialize(roomId) {
    this.roomId = roomId;
    return this;
  }

  /**
   * Update queue
   */
  updateQueue(newQueue) {
    if (!Array.isArray(newQueue)) {
      console.error('[QueueService] Invalid queue:', newQueue);
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
   * Get current queue
   */
  getQueue() {
    return [...this.queue];
  }

  /**
   * Add song to queue
   */
  async addToQueue(song) {
    if (!song || !song.id) {
      toast.error('Invalid song data');
      return false;
    }

    if (!this.roomId) {
      toast.error('Room ID not found');
      return false;
    }

    try {
      // Fix: Use proper API call with token and fix the request body format
      const token = localStorage.getItem('discord_token');
      if (!token) {
        toast.error('You need to be logged in to add songs');
        return false;
      }

      const response = await fetch(`/.proxy/api/queue/${this.roomId}/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        // Fix: Proper API request format
        body: JSON.stringify({ song })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Could not add song to queue');
      }
      
      const result = await response.json();
      
      if (result.success) {
        toast.info('Processing request...');
        return true;
      } else {
        toast.error(result.message || 'Could not add song to queue');
        return false;
      }
    } catch (error) {
      console.error('[QueueService] Error adding to queue:', error);
      toast.error(error.message || 'Error adding song to queue');
      return false;
    }
  }

  /**
   * Remove song from queue
   */
  async removeFromQueue(index) {
    if (!this.roomId) {
      toast.error('Room ID not found');
      return false;
    }

    if (index < 0 || index >= this.queue.length) {
      toast.error('Invalid index');
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
        throw new Error('Error removing song');
      }

      // Server will send back updated queue via socket
      return true;
    } catch (error) {
      console.error('[QueueService] Error removing from queue:', error);
      toast.error('Could not remove song from queue');
      return false;
    }
  }

  /**
   * Clear queue
   */
  async clearQueue() {
    if (!this.roomId) {
      toast.error('Room ID not found');
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
        throw new Error('Error clearing queue');
      }

      // Server will send back empty queue via socket
      return true;
    } catch (error) {
      console.error('[QueueService] Error clearing queue:', error);
      toast.error('Could not clear queue');
      return false;
    }
  }

  /**
   * Reorder songs in queue
   */
  async reorderQueue(fromIndex, toIndex) {
    if (!this.roomId) {
      toast.error('Room ID not found');
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
        throw new Error('Error reordering queue');
      }

      // Server will send back updated queue via socket
      return true;
    } catch (error) {
      console.error('[QueueService] Error reordering queue:', error);
      toast.error('Could not reorder queue');
      return false;
    }
  }

  /**
   * Register queue update callback
   */
  onQueueUpdate(callback) {
    this.onQueueUpdateCallback = callback;
  }
}

export default new QueueService();
