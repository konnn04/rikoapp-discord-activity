import { io } from 'socket.io-client';
import { toast } from 'react-toastify';

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = {
      playbackSync: [],
      queueUpdate: [],
      participantsUpdate: [],
      roomJoined: [],
      roomLeft: [],
      skipVoteUpdate: [],
      error: []
    };
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxAttempts = 5;
    this.connectPromise = null;
    this.heartbeatInterval = null;
    this.reconnectTimeout = null;
    this.throttledActions = {}; // For throttling actions
    this.lastSyncTime = 0;
    this.lastReportedEvents = {}; // Track last reported events
  }

  connect(token) {
    if (this.isSocketConnected()) {
      console.log('Socket already connected');
      return Promise.resolve(this.socket);
    }
    
    if (!token) {
      console.error("Cannot connect socket: No token provided");
      return Promise.reject(new Error("No token provided"));
    }

    console.log('Initiating socket connection with token');
    
    // Clear any existing connection resources
    this.cleanup();
    
    // Create a promise that resolves when connection is established
    // or rejects after max attempts
    this.connectPromise = new Promise((resolve, reject) => {
      const socketUrl = import.meta.env.VITE_SOCKET_URL || '';
      
      this.socket = io("/", {
        auth: { token },
        reconnectionAttempts: this.maxAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        path: "/.proxy/ws/socket.io",
        transports: ['websocket', 'polling'] // Try websocket first, fallback to polling
      });

      this.setupEventListeners(resolve, reject);
    });
    
    return this.connectPromise;
  }

  setupEventListeners(resolveConnect, rejectConnect) {
    this.socket.on('connect', () => {
      console.log('Socket connected successfully');
      this.isConnected = true;
      this.connectionAttempts = 0;
      
      // Start heartbeat
      this.startHeartbeat();
      
      // Resolve the connection promise
      if (resolveConnect) {
        resolveConnect(this.socket);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${reason}`);
      this.isConnected = false;
      
      // Stop heartbeat
      this.stopHeartbeat();
      
      // Handle reconnectable disconnects
      if (reason === 'io server disconnect') {
        // the disconnection was initiated by the server, reconnect manually
        this.scheduleReconnect();
      }
    });

    this.socket.on('connect_error', (error) => {
      this.connectionAttempts++;
      console.log(`Socket connection error (${this.connectionAttempts}/${this.maxAttempts}): ${error.message}`);
      
      if (this.connectionAttempts >= this.maxAttempts) {
        console.log(`Max reconnection attempts (${this.maxAttempts}) reached, giving up`);
        this.emitEvent('error', { type: 'connection', message: 'Unable to connect to server' });
        toast.error('Connection to server lost. Please refresh the page.');
        
        // Stop trying to reconnect
        this.stopHeartbeat();
        
        // Reject the connection promise
        if (rejectConnect) {
          rejectConnect(error);
        }
      } else {
        // Schedule reconnect
        this.scheduleReconnect();
      }
    });

    // Sync events (receive only)
    this.socket.on('playbackSync', (data) => {
      this.emitEvent('playbackSync', data);
    });

    this.socket.on('queueUpdate', (data) => {
      this.emitEvent('queueUpdate', data);
    });

    this.socket.on('participantsUpdate', (data) => {
      this.emitEvent('participantsUpdate', data);
    });
    
    this.socket.on('skipVoteUpdate', (data) => {
      this.emitEvent('skipVoteUpdate', data);
    });
    
    this.socket.on('roomJoined', (data) => {
      this.emitEvent('roomJoined', data);
    });
    
    this.socket.on('roomLeft', () => {
      this.emitEvent('roomLeft', {});
    });

    this.socket.on('error', (data) => {
      console.error('Server error:', data.message);
      toast.error(data.message);
      this.emitEvent('error', data);
    });
  }
  
  // Start sending heartbeats to let server know client is active
  startHeartbeat() {
    this.stopHeartbeat(); // Clear any existing heartbeat
    
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.isConnected) {
        this.socket.emit('heartbeat');
      }
    }, 30000); // Every 30 seconds
  }
  
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
  
  scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    const delay = Math.min(1000 * Math.pow(2, this.connectionAttempts), 30000); // Exponential backoff, max 30s
    console.log(`Scheduling reconnect in ${delay}ms`);
    
    this.reconnectTimeout = setTimeout(() => {
      if (this.socket) {
        console.log('Attempting to reconnect...');
        this.socket.connect();
      }
    }, delay);
  }
  
  // Add throttle utility to prevent spamming server
  throttle(key, callback, delay = 2000) {
    if (this.throttledActions[key]) {
      clearTimeout(this.throttledActions[key].timeout);
    } else {
      this.throttledActions[key] = { executed: false };
      // Allow first call immediately
      callback();
      this.throttledActions[key].executed = true;
      return;
    }

    // Schedule next execution
    this.throttledActions[key].timeout = setTimeout(() => {
      if (!this.throttledActions[key].executed) {
        callback();
      }
      delete this.throttledActions[key];
    }, delay);
  }
  
  // Report errors to server with throttling
  reportError(errorData) {
    const key = `error-${errorData.type}-${errorData.songId || 'unknown'}`;
    
    if (this.isSocketConnected()) {
      this.throttle(key, () => {
        console.log('Reporting error to server:', errorData.type);
        this.socket.emit('errorReport', errorData);
      }, 5000);
    }
  }

  // Thêm hàm báo cáo sự kiện chung
  reportEvent(eventData) {
    const key = `event-${eventData.type}-${eventData.songId || 'unknown'}`;
    
    if (this.isSocketConnected()) {
      // Kiểm tra trùng lặp sự kiện
      const now = Date.now();
      if (this.lastReportedEvents[key] && now - this.lastReportedEvents[key] < 5000) {
        console.log('Duplicate event submission detected, skipping:', eventData.type);
        return; // Tránh gửi sự kiện trùng lặp
      }
      
      this.throttle(key, () => {
        console.log('Reporting event to server:', eventData.type);
        this.socket.emit('clientEvent', eventData);
        this.lastReportedEvents[key] = now; // Cập nhật thời gian sự kiện vừa gửi
      }, 2000);
    }
  }

  // Cải thiện hàm requestSync
  requestSync(roomId) {
    if (this.isSocketConnected() && roomId) {
      // Ngăn chặn yêu cầu sync quá thường xuyên
      const now = Date.now();
      if (now - this.lastSyncTime < 1000) {
        console.log('Rate limiting sync request, skipping');
        return; // Giới hạn tốc độ sync để tránh quá tải server
      }
      
      console.log('Requesting sync from server for room:', roomId);
      this.socket.emit('requestSync', {
        roomId,
        clientTime: now,
        lastSyncTime: this.lastSyncTime || 0
      });
      
      this.lastSyncTime = now;
    } else {
      console.warn('Cannot request sync: socket not connected or missing roomId');
    }
  }
  
  disconnect() {
    this.cleanup();
    if (this.socket) {
      console.log('Disconnecting socket');
      this.socket.disconnect();
      this.socket = null;
    }
  }
  
  cleanup() {
    this.stopHeartbeat();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    this.isConnected = false;
    this.connectPromise = null;
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    
    this.listeners[event].push(callback);
    console.log(`Registered listener for ${event}, total listeners: ${this.listeners[event].length}`);
    
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emitEvent(event, data) {
    if (!this.listeners[event]) return;
    
    this.listeners[event].forEach(callback => callback(data));
  }

  // Improved isSocketConnected function with reconnection if needed
  isSocketConnected() {
    const isConnected = this.isConnected && this.socket?.connected;
    
    if (!isConnected && this.socket) {
      console.log('Socket exists but disconnected, attempting to reconnect');
      this.socket.connect();
      
      // Lên lịch thử lại
      if (!this.reconnectTimeout) {
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectTimeout = null;
          if (!this.socket?.connected) {
            console.log('Reconnection failed, trying again...');
            this.socket.connect();
          }
        }, 2000);
      }
    }
    
    return isConnected;
  }
}

export default new SocketService();
