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
  
  // Method to improve socket.on('clientEvent') handler
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
    
    // Handle client reporting events with improved error handling
    socket.on('clientEvent', (data) => {
      try {
        console.log('Client event received:', data);
        
        // Handle track ended event
        if (data.type === 'trackEnded') {
          this.handleTrackEndedEvent(socket, data);
        }
        // Handle other event types as needed
      } catch (error) {
        console.error('Error processing client event:', error);
        
        // Try to recover if possible
        if (data.roomId) {
          const roomRegistry = getRoomRegistry();
          const room = roomRegistry.get(data.roomId);
          
          if (room) {
            // Send sync to help client recover
            this.emitPlaybackSyncToSocket(socket.id, room, { 
              errorRecovery: true,
              error: error.message
            });
          }
        }
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
    if (!roomId) {
      console.log('Track ended event missing roomId');
      return;
    }
    
    const roomRegistry = getRoomRegistry();
    const room = roomRegistry.get(roomId);
    
    if (!room) {
      console.log(`Room ${roomId} not found for track ended event`);
      return;
    }
    
    console.log(`Track ended reported by client in room ${roomId} for songId: ${data.songId}`);
    
    // Prevent repeated ended events for the same song within a short time window
    const now = Date.now();
    const recentEndedThreshold = 5000; // 5 seconds
    
    if (room._lastEndedEvent && 
        room._lastEndedEvent.songId === data.songId &&
        now - room._lastEndedEvent.timestamp < recentEndedThreshold) {
      console.log(`Ignoring duplicate track ended event for ${data.songId} (received within ${now - room._lastEndedEvent.timestamp}ms)`);
      return;
    }
    
    // Record this ended event with more details
    room._lastEndedEvent = {
      songId: data.songId,
      timestamp: now,
      clientTime: data.clientTime || now,
      userId: socket.userId
    };
    
    // Log attempts for debugging
    console.log(`Processing track ended for song ${data.songId} (attempt: ${data.retryCount || 0})`);
    
    // Check if the reported song matches the current song
    if (room.currentSong && room.currentSong.id === data.songId) {
      // Try playing next song automatically
      const prevSong = room.currentSong;
      const hasNext = room.playNext(this.io);
      
      if (hasNext) {
        console.log(`Auto-advancing to next song in room ${roomId} based on client report: ${prevSong?.id} -> ${room.currentSong?.id}`);
        
        // Emit playback sync with new song
        this.emitPlaybackSync(roomId, room, { 
          action: 'nextTrack',
          previousSong: prevSong?.id,
          endTriggeredBy: socket.userId
        });
        
        // Emit track change event
        this.emitTrackChange(roomId, prevSong.id, room.currentSong.id, {
          automatic: true,
          clientReported: true,
          timestamp: Date.now()
        });
        
        // Also send separate queue update to ensure clients have latest queue
        this.emitQueueUpdate(roomId, room.queue);
      } else {
        console.log(`No next song available in room ${roomId} after track ended`);
        // If there's no next song, still emit a playback ended event to notify clients
        this.emitPlaybackEnded(roomId, null);
        
        // Emit an updated sync event to ensure clients know there's nothing to play
        this.emitPlaybackSync(roomId, room, { 
          noMoreSongs: true,
          endTriggeredBy: socket.userId,
          previousSong: prevSong?.id
        });
      }
      
      // Send acknowledgement to client that the event was processed
      socket.emit('eventProcessed', { 
        type: 'trackEnded', 
        songId: data.songId,
        processed: true,
        timestamp: Date.now()
      });
      
      return;
    } else {
      console.log(`Track ended mismatch: client reported ${data.songId} but current is ${room.currentSong?.id || 'none'}`);
      
      // If room has a current song that differs from what client reported
      if (room.currentSong && room.currentSong.id !== data.songId) {
        // Send sync to fix client's state
        this.emitPlaybackSyncToSocket(socket.id, room, { 
          forcedSync: true,
          mismatchSongId: data.songId
        });
      } 
      // If there's no current song but we have songs in queue, try starting playback
      else if (!room.currentSong && room.queue.length > 0) {
        console.log(`No current song in room ${roomId}, but queue has songs. Starting playback.`);
        const startedPlayback = room.playNext(this.io);
        
        if (startedPlayback) {
          this.emitPlaybackSync(roomId, room, { 
            action: 'startPlayback',
            reason: 'trackEndedRecovery'
          });
        }
      }
      // If the song ID matches but the room doesn't think it has a current song,
      // this could be a race condition - trust the client and try to advance
      else if (!room.currentSong && data.songId) {
        console.log(`Race condition detected: client reports ended song ${data.songId} but room has no current song`);
        
        // Temporarily set a pseudo current song to allow playNext to work
        room.currentSong = { id: data.songId, tempRestored: true };
        const hasNext = room.playNext(this.io);
        
        if (hasNext) {
          console.log(`Recovered from race condition in room ${roomId}, now playing: ${room.currentSong?.id}`);
          this.emitPlaybackSync(roomId, room, { 
            action: 'nextTrack',
            recoveredFromRace: true
          });
        } else {
          console.log(`No songs to play after race condition recovery in room ${roomId}`);
          this.emitPlaybackSync(roomId, room, { noMoreSongs: true });
        }
      }
    }
  }
  
  // Add a new method to handle client error reports more effectively
  handleClientErrorReport(socket, data) {
    if (!data || !data.roomId) return;
    
    const roomRegistry = getRoomRegistry();
    const room = roomRegistry.get(data.roomId);
    
    if (room) {
      console.log(`Client ${socket.userId} reported error in room ${data.roomId}: ${data.type}`);
      
      // If this is a serious error, send a detailed sync response
      this.emitPlaybackSyncToSocket(socket.id, room, {
        errorRecovery: true,
        serverTime: Date.now(),
        retryAttempt: data.retryAttempt || 0
      });
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