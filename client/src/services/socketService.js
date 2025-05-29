import io from 'socket.io-client';
import { API_URL } from '../config';

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.roomId = null;
    this.listeners = {};
    this.reconnectAttempts = 0;
    this.reconnectTimeout = null;
  }
  
  initialize(token) {
    if (this.socket) {
      console.log('Socket already initialized');
      return;
    }
    
    console.log('Initializing socket connection');
    
    this.socket = io(API_URL, {
      auth: {
        token
      },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });
    
    this.setupSocketEvents();
  }
  
  setupSocketEvents() {
    if (!this.socket) return;
    
    this.socket.on('connect', () => {
      console.log('Socket connected');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emit('heartbeat', { timestamp: Date.now() });
      
      // If we have a roomId, send it to join the room
      if (this.roomId) {
        console.log(`Socket reconnected, rejoining room: ${this.roomId}`);
        this.emit('joinRoom', { roomId: this.roomId });
        this.requestSync(this.roomId);
      }
    });
    
    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      this.connected = false;
    });
    
    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.connected = false;
      
      this.reconnectAttempts++;
      if (this.reconnectAttempts > 10) {
        console.log('Max reconnection attempts reached');
      }
    });
    
    // Start sending periodic heartbeats
    setInterval(() => {
      if (this.connected) {
        this.emit('heartbeat', { timestamp: Date.now() });
      }
    }, 30000); // Every 30 seconds
  }
  
  joinRoom(roomId) {
    if (!this.socket || !this.connected) {
      console.error('Cannot join room: socket not connected');
      return Promise.reject(new Error('Socket not connected'));
    }
    
    this.roomId = roomId;
    
    return new Promise((resolve, reject) => {
      this.socket.emit('joinRoom', { roomId }, (response) => {
        if (response && response.success) {
          console.log('Joined room:', roomId);
          resolve(response);
        } else {
          console.error('Failed to join room:', response?.error || 'Unknown error');
          reject(new Error(response?.error || 'Failed to join room'));
        }
      });
    });
  }
  
  leaveRoom(roomId = this.roomId) {
    if (!this.socket || !this.connected) {
      console.error('Cannot leave room: socket not connected');
      return;
    }
    
    if (!roomId) {
      console.error('Cannot leave room: no roomId provided or stored');
      return;
    }
    
    this.socket.emit('leaveRoom', { roomId });
    if (roomId === this.roomId) {
      this.roomId = null;
    }
  }
  
  requestSync(roomId = this.roomId) {
    if (!this.socket || !this.connected) {
      console.error('Cannot request sync: socket not connected');
      return Promise.reject(new Error('Socket not connected'));
    }
    
    if (!roomId) {
      console.error('Cannot request sync: no roomId provided or stored');
      return Promise.reject(new Error('No room ID'));
    }
    
    console.log(`Requesting playback sync for room: ${roomId}`);
    
    return new Promise((resolve) => {
      this.socket.emit('requestSync', {
        roomId,
        clientTime: Date.now(),
        lastSyncTime: this.lastSyncTime || 0
      });
      
      // We don't get a direct response to this event, so resolve immediately
      resolve();
    });
  }
  
  /**
   * Report an event to the server
   * @param {Object} eventData - The event data
   * @returns {Promise} A promise that resolves when the event is acknowledged
   */
  reportEvent(eventData) {
    if (!this.socket || !this.connected) {
      console.error('Cannot report event: socket not connected');
      return Promise.reject(new Error('Socket not connected'));
    }
    
    console.log(`Reporting event: ${eventData.type}`, eventData);
    
    return new Promise((resolve, reject) => {
      this.socket.emit('clientEvent', eventData, (response) => {
        if (response && response.success) {
          resolve(response);
        } else {
          reject(new Error(response?.error || 'Failed to report event'));
        }
      });
      
      // If we don't get an acknowledgement within 3 seconds, resolve anyway
      setTimeout(() => resolve({ acknowledged: false }), 3000);
    });
  }
  
  /**
   * Report an error to the server
   * @param {Object} errorData - The error data
   * @returns {Promise} A promise that resolves when the error is acknowledged
   */
  reportError(errorData) {
    if (!this.socket || !this.connected) {
      console.error('Cannot report error: socket not connected');
      return Promise.reject(new Error('Socket not connected'));
    }
    
    console.log(`Reporting error: ${errorData.type}`, errorData);
    
    return new Promise((resolve) => {
      this.socket.emit('clientError', errorData);
      
      // We don't wait for acknowledgement for error reports
      resolve({ reported: true });
    });
  }
  
  on(event, callback) {
    if (!this.socket) return;
    
    // Store the callback in our listeners map
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    
    this.socket.on(event, callback);
  }
  
  off(event, callback) {
    if (!this.socket) return;
    
    if (callback) {
      this.socket.off(event, callback);
      
      // Remove from listeners map
      if (this.listeners[event]) {
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
      }
    } else {
      // Remove all listeners for this event
      this.socket.off(event);
      this.listeners[event] = [];
    }
  }
  
  emit(event, data, callback) {
    if (!this.socket || !this.connected) {
      console.error(`Cannot emit ${event}: socket not connected`);
      return;
    }
    
    this.socket.emit(event, data, callback);
  }
  
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.roomId = null;
    }
  }
}

export default new SocketService();
