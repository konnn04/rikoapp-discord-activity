import { verifyToken } from './authService.js';
import { getRoomRegistry } from './roomRegistry.js';

export default class SocketService {
  constructor(io) {
    this.io = io;
    this.socketToUser = new Map();
    this.userSockets = new Map(); // userId -> Set<socketId>
    this.inactivityTimeouts = new Map(); // userId -> timeout
    
    // Set up authentication middleware
    this.setupSocketAuth();
    
    this.io.on('connection', (socket) => {
      console.log('User connected:', socket.userId);
      
      // Save socket-userId mapping
      this.socketToUser.set(socket.id, socket.userId);
      
      const userId = socket.userId;
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId).add(socket.id);
      
      // Clear any existing inactivity timeout for this user
      if (this.inactivityTimeouts.has(userId)) {
        clearTimeout(this.inactivityTimeouts.get(userId));
        this.inactivityTimeouts.delete(userId);
      }
      
      // Handle client events
      this.setupClientEventHandlers(socket);
      
      // Handle disconnection events
      socket.on('disconnect', () => this.handleDisconnect(socket));
    });
  }
  
  setupSocketAuth() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
          return next(new Error('Authentication error: Token missing'));
        }
        
        // Verify token
        const userData = await verifyToken(token);
        
        if (!userData || !userData.id) {
          return next(new Error('Authentication error: Invalid token'));
        }
        
        // Attach user data to socket for use in connection handler
        socket.userId = userData.id;
        socket.userData = userData;
        
        // Check if user is already in a room
        const roomRegistry = getRoomRegistry();
        const existingRoom = roomRegistry.getRoomForUser(userData.id);
        
        if (existingRoom) {
          // Auto-join the room
          socket.join(existingRoom.id);
          
          // Send current room state
          socket.emit('roomJoined', existingRoom.getState());
        }
        
        next();
      } catch (error) {
        console.error('Socket authentication error:', error);
        next(new Error('Authentication error: ' + error.message));
      }
    });
  }
  
  setupClientEventHandlers(socket) {
    // Handle client-sent heartbeat to know the client is still active
    socket.on('heartbeat', () => {
      const userId = this.socketToUser.get(socket.id);
      
      // If there's an existing timeout for this user, clear it
      if (this.inactivityTimeouts.has(userId)) {
        clearTimeout(this.inactivityTimeouts.get(userId));
        this.inactivityTimeouts.delete(userId);
      }
    });
    
    // Handle client reporting events
    socket.on('clientEvent', (data) => {
      console.log('Client event received:', data);
      
      // Handle track ended event
      if (data.type === 'trackEnded') {
        this.handleTrackEndedEvent(socket, data);
      }
    });
    
    // Enhance requestSync handler with more accurate data
    socket.on('requestSync', (data) => {
      if (!data || !data.roomId) return;
      
      const roomRegistry = getRoomRegistry();
      const room = roomRegistry.get(data.roomId);
      
      if (room) {
        console.log(`Sync requested for room ${data.roomId} by ${socket.userId}`);
        
        // Include accurate server time information
        const serverTime = Date.now();
        const clientTime = data.clientTime || serverTime;
        const timeOffset = serverTime - clientTime;
        
        // Send enhanced sync data
        this.emitPlaybackSyncToSocket(socket.id, room, {
          serverTime,
          clientTime,
          timeOffset,
          clientLastSync: data.lastSyncTime
        });
      }
    });
  }
  
  handleTrackEndedEvent(socket, data) {
    const roomId = data.roomId;
    if (!roomId) return;
    
    const roomRegistry = getRoomRegistry();
    const room = roomRegistry.get(roomId);
    
    if (room && room.currentSong && room.currentSong.id === data.songId) {
      console.log(`Track ended reported by client in room ${roomId}`);
      
      // Try playing next song automatically
      const prevSong = room.currentSong;
      const hasNext = room.playNext(this.io);
      
      if (hasNext) {
        console.log(`Auto-advancing to next song in room ${roomId} based on client report`);
        
        // Emit playback sync with new song
        this.emitPlaybackSync(roomId, room);
        
        // Emit track change event
        this.emitTrackChange(roomId, prevSong.id, room.currentSong.id, {
          automatic: true,
          clientReported: true
        });
      }
    }
  }
  
  handlePlaybackErrorReport(socket, data) {
    const roomId = data.roomId;
    if (!roomId) return;
    
    const roomRegistry = getRoomRegistry();
    const room = roomRegistry.get(roomId);
    
    if (room && room.currentSong) {
      // Re-emit the playback sync data to help client recover
      this.emitPlaybackSyncToSocket(socket.id, room);
    }
  }
  
  handleDisconnect(socket) {
    console.log('User disconnected:', socket.id);
    
    // Find user from socket
    const userId = socket.userId || this.socketToUser.get(socket.id);
    if (userId) {
      // Remove socket from user's socket set
      if (this.userSockets.has(userId)) {
        this.userSockets.get(userId).delete(socket.id);
        
        // If this was the last socket for this user, set a timeout to remove from room
        if (this.userSockets.get(userId).size === 0) {
          const timeoutDuration = 5 * 60 * 1000; // 5 minutes
          
          console.log(`Setting inactivity timeout for user ${userId}: ${timeoutDuration / 1000}s`);
          
          this.inactivityTimeouts.set(userId, setTimeout(() => {
            // Find user's room
            const roomRegistry = getRoomRegistry();
            const room = roomRegistry.getRoomForUser(userId);
            
            if (room) {
              console.log(`User ${userId} was inactive for too long, removing from room ${room.id}`);
              
              // Remove user from room
              const remainingParticipants = room.removeParticipant(userId);
              
              // Emit participants update to all room members
              this.emitParticipantsUpdate(room.id, room.participants);
              
              // If room is empty, clean it up
              if (remainingParticipants === 0) {
                console.log(`Room ${room.id} is empty, cleaning up`);
                roomRegistry.delete(room.id);
              }
            }
            
            // Clean up user data
            this.userSockets.delete(userId);
            this.inactivityTimeouts.delete(userId);
          }, timeoutDuration));
        }
      }
      
      // Clean up socket-user mapping
      this.socketToUser.delete(socket.id);
    }
  }
  
  // Enhanced room-wide playback sync
  emitPlaybackSync(roomId, room, additionalInfo = {}) {
    const serverTime = Date.now();
    
    const playbackInfo = {
      currentSong: room.currentSong,
      isPlaying: room.isPlaying,
      currentPosition: room.getCurrentPlaybackTime(),
      streamUrl: room.currentSong?.streamUrl,
      startTimestamp: room.startTimestamp,
      pauseTimestamp: room.pauseTimestamp,
      accumulatedTime: room.accumulatedTime,
      serverTime,
      syncId: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      ...additionalInfo
    };
    
    // Include exact position if provided (for precise pause events)
    if (additionalInfo.exactPosition !== undefined) {
      playbackInfo.currentPosition = additionalInfo.exactPosition;
    }
    
    console.log(`[Socket] Emitting playback sync for room ${roomId}:`, {
      songId: room.currentSong?.id,
      playing: room.isPlaying,
      position: playbackInfo.currentPosition,
      action: additionalInfo.action || 'update',
      syncId: playbackInfo.syncId,
      serverTime
    });
    
    this.io.to(roomId).emit('playbackSync', playbackInfo);
  }
  
  // Method to emit playback sync specifically to one socket with enhanced timing data
  emitPlaybackSyncToSocket(socketId, room, timingData = {}) {
    const serverTime = timingData.serverTime || Date.now();
    
    const playbackInfo = {
      currentSong: room.currentSong,
      isPlaying: room.isPlaying,
      currentPosition: room.getCurrentPlaybackTime(),
      streamUrl: room.currentSong?.streamUrl,
      startTimestamp: room.startTimestamp,
      pauseTimestamp: room.pauseTimestamp,
      accumulatedTime: room.accumulatedTime,
      serverTime,
      syncId: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      ...timingData
    };
    
    console.log(`[Socket] Emitting detailed playback sync to socket ${socketId}`);
    this.io.to(socketId).emit('playbackSync', playbackInfo);
  }
  
  // Method to emit queue processing status to a room or specific user
  emitQueueProcessing(roomId, data, userId = null) {
    if (userId) {
      // Send only to the specific user
      if (this.userSockets.has(userId)) {
        for (const socketId of this.userSockets.get(userId)) {
          this.io.to(socketId).emit('queueProcessing', data);
        }
      }
    } else {
      // Send to the entire room
      this.io.to(roomId).emit('queueProcessing', data);
    }
    
    console.log(`Emitting queue processing update for ${userId ? 'user ' + userId : 'room ' + roomId}:`, {
      status: data.status,
      songId: data.songId
    });
  }
  
  // Method to emit queue update to a room
  emitQueueUpdate(roomId, queue) {
    console.log(`Emitting queue update for room ${roomId}, queue length: ${queue.length}`);
    this.io.to(roomId).emit('queueUpdate', {
      queue: queue
    });
  }
  
  // Method to emit playback ended event to a room
  emitPlaybackEnded(roomId, nextSong = null) {
    console.log(`Emitting playback ended for room ${roomId}, next song: ${nextSong?.id || 'none'}`);
    this.io.to(roomId).emit('playbackEnded', {
      nextSong,
      serverTime: Date.now()
    });
  }
  
  // Method to emit track change event to a room
  emitTrackChange(roomId, previousSongId, newSongId, metadata = {}) {
    console.log(`Emitting track change for room ${roomId}: ${previousSongId} -> ${newSongId}`);
    this.io.to(roomId).emit('trackChange', {
      previousSongId,
      newSongId,
      serverTime: Date.now(),
      ...metadata
    });
  }
  
  // Method to emit participants update to a room
  emitParticipantsUpdate(roomId, participants) {
    console.log(`Emitting participants update for room ${roomId}, count: ${participants.length}`);
    this.io.to(roomId).emit('participantsUpdate', {
      participants,
      count: participants.length,
      timestamp: Date.now()
    });
  }
  
  // Method to emit skip vote update
  emitSkipVoteUpdate(roomId, votes, needed) {
    console.log(`Emitting skip vote update for room ${roomId}: ${votes}/${needed}`);
    this.io.to(roomId).emit('skipVoteUpdate', {
      currentVotes: votes,
      votesNeeded: needed,
      serverTime: Date.now()
    });
  }
  
  // Method to get socket for a specific user
  getSocketForUser(userId) {
    if (this.userSockets.has(userId)) {
      const socketIds = Array.from(this.userSockets.get(userId));
      if (socketIds.length > 0) {
        return this.io.sockets.sockets.get(socketIds[0]);
      }
    }
    return null;
  }
}