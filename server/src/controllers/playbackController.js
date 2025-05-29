import { getRoomRegistry } from '../services/roomRegistry.js';

/**
 * Skip current song - with voting system
 */
export const skipSong = async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;
  
  try {
    const roomRegistry = getRoomRegistry();
    const room = roomRegistry.get(roomId);
    
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    // Check if user is in the room
    const participant = room.participants.find(p => p.id === userId);
    if (!participant) {
      return res.status(403).json({ message: 'You must be in the room to skip songs' });
    }
    
    // Add skip vote
    const skipResult = room.addSkipVote(userId, req.app.get('io'));
    
    // Return the result of the vote
    return res.json(skipResult);
  } catch (error) {
    console.error('Error skipping song:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Toggle playback (play/pause)
 */
export const togglePlayback = async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;

  try {
    const roomRegistry = getRoomRegistry();
    const room = roomRegistry.get(roomId);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Toggle playback state
    const result = room.togglePlayback();
    
    if (!result) {
      return res.status(400).json({ message: 'Cannot toggle playback, no song is playing' });
    }

    // Get the socket.io instance
    const io = req.app.get('io');
    if (!io) {
      return res.status(500).json({ message: 'Socket.io instance not available' });
    }

    // Emit playback sync event with appropriate action flag
    const action = room.isPlaying ? 'play' : 'pause';
    const exactPosition = room.getCurrentPlaybackTime();

    io.socketService.emitPlaybackSync(roomId, room, { 
      action,
      exactPosition
    });

    return res.json({
      message: `Playback ${room.isPlaying ? 'started' : 'paused'}`,
      isPlaying: room.isPlaying,
      currentPosition: exactPosition
    });
  } catch (error) {
    console.error('Error toggling playback:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Play
 */
export const play = async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;
  
  try {
    const roomRegistry = getRoomRegistry();
    const room = roomRegistry.get(roomId);
    
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    if (!room.currentSong) {
      return res.status(400).json({ message: 'No song is currently loaded' });
    }
    
    // If already playing, do nothing
    if (room.isPlaying) {
      return res.json({ 
        message: 'Already playing', 
        isPlaying: true,
        currentPosition: room.getCurrentPlaybackTime(),
        serverTime: Date.now()
      });
    }
    
    // Resume playback with accurate timing
    room.resumePlayback();
    
    // Get the socket service
    const io = req.app.get('io');
    if (io && io.socketService) {
      // Emit with detailed sync information
      io.socketService.emitPlaybackSync(roomId, room, {
        action: 'play',
        triggeredBy: userId,
        timestamp: Date.now()
      });
      
      console.log(`[PlaybackSync] Play triggered by ${userId} in room ${roomId} at position ${room.getCurrentPlaybackTime()}`);
    } else {
      // Fallback to direct socket emit
      io.to(roomId).emit('playbackSync', {
        currentSong: room.currentSong,
        isPlaying: true,
        currentPosition: room.getCurrentPlaybackTime(),
        streamUrl: room.currentSong.streamUrl,
        startTimestamp: room.startTimestamp,
        serverTime: Date.now(),
        action: 'play'
      });
    }
    
    return res.json({ 
      message: 'Playback started', 
      isPlaying: true,
      currentPosition: room.getCurrentPlaybackTime(),
      serverTime: Date.now()
    });
  } catch (error) {
    console.error('Error starting playback:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Pause
 */
export const pause = async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;
  
  try {
    const roomRegistry = getRoomRegistry();
    const room = roomRegistry.get(roomId);
    
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    if (!room.currentSong) {
      return res.status(400).json({ message: 'No song is currently playing' });
    }
    
    // If already paused, do nothing
    if (!room.isPlaying) {
      return res.json({ 
        message: 'Already paused', 
        isPlaying: false,
        currentPosition: room.getCurrentPlaybackTime(),
        serverTime: Date.now()
      });
    }
    
    // Save current position before pausing for accuracy
    const currentPosition = room.getCurrentPlaybackTime();
    
    // Pause playback
    room.pausePlayback(currentPosition);
    
    // Emit playback sync event with accurate position
    const io = req.app.get('io');
    if (io && io.socketService) {
      io.socketService.emitPlaybackSync(roomId, room, {
        action: 'pause',
        triggeredBy: userId,
        timestamp: Date.now(),
        exactPosition: currentPosition
      });
      
      console.log(`[PlaybackSync] Pause triggered by ${userId} in room ${roomId} at position ${currentPosition}`);
    } else {
      io.to(roomId).emit('playbackSync', {
        currentSong: room.currentSong,
        isPlaying: false,
        currentPosition: currentPosition,
        streamUrl: room.currentSong.streamUrl,
        startTimestamp: null,
        serverTime: Date.now(),
        action: 'pause'
      });
    }
    
    return res.json({ 
      message: 'Playback paused', 
      isPlaying: false,
      currentPosition: currentPosition,
      serverTime: Date.now()
    });
  } catch (error) {
    console.error('Error pausing playback:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Seek to a specific position in the current song
 */
export const seekTo = async (req, res) => {
  const { roomId } = req.params;
  const { position } = req.body;
  const userId = req.user.id;

  try {
    const roomRegistry = getRoomRegistry();
    const room = roomRegistry.get(roomId);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if user is in the room
    const userInRoom = room.participants.some(p => p.id === userId);
    if (!userInRoom) {
      return res.status(403).json({ message: 'You are not in this room' });
    }

    // Check if there's a current song
    if (!room.currentSong) {
      return res.status(400).json({ message: 'No song is currently playing' });
    }

    // Validate position
    if (position < 0 || (room.currentSong.duration && position > room.currentSong.duration)) {
      return res.status(400).json({ message: 'Invalid position' });
    }

    // Seek to position
    const seeked = room.seekTo(position, req.app.get('io'));

    if (!seeked) {
      return res.status(400).json({ message: 'Failed to seek' });
    }

    // Emit playback update to all room members
    const io = req.app.get('io');
    const socketService = io.socketService;
    socketService.emitPlaybackSync(roomId, room);

    return res.json({
      currentPosition: room.getCurrentPlaybackTime()
    });
  } catch (error) {
    console.error('Error seeking:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Play next song
 */
export const playNext = async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;

  try {
    const roomRegistry = getRoomRegistry();
    const room = roomRegistry.get(roomId);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if user is in the room
    const userInRoom = room.participants.some(p => p.id === userId);
    if (!userInRoom) {
      return res.status(403).json({ message: 'You are not in this room' });
    }

    // Play next song
    const previousSong = room.currentSong;
    let played = false;
    
    if (room.queue.length > 0) {
      // If there are songs in queue, play next one
      played = room.playNext(req.app.get('io'));
      
      // Ensure we have a stream URL for the new song
      if (played && room.currentSong) {
        await ensureStreamUrl(room);
      }
    } else if (room.currentSong) {
      // Per business requirements: if queue is empty but there's a current song,
      // clear everything and return to empty state
      if (previousSong) {
        // Store the cleared song in history
        room.playbackHistory.unshift(previousSong);
        if (room.playbackHistory.length > 20) {
          room.playbackHistory.pop();
        }
      }
      
      room.currentSong = null;
      room.isPlaying = false;
      room.currentPosition = 0;
      room.accumulatedTime = 0;
      room.startTimestamp = null;
      room.pauseTimestamp = null;
      
      played = true; // Consider this a successful operation
    } else {
      // Nothing to do, already empty
      played = false;
    }

    // Emit playback update to all room members
    const io = req.app.get('io');
    if (io && io.socketService) {
      io.socketService.emitPlaybackSync(roomId, room);
      
      if (previousSong && !room.currentSong) {
        // Emit playback ended event if we cleared the current song
        io.socketService.emitPlaybackEnded(roomId, null);
      }
      else if (previousSong) {
        // Emit track change notification
        io.socketService.emitTrackChange(roomId, previousSong?.id, room.currentSong?.id, {
          skippedBy: userId,
          queue: room.queue // Include updated queue in the event
        });
      }
      
      // Emit separate queue update to ensure all clients have the latest queue
      io.socketService.emitQueueUpdate(roomId, room.queue);
    }

    return res.json({
      currentSong: room.currentSong,
      isPlaying: room.isPlaying,
      currentPosition: room.getCurrentPlaybackTime(),
      queue: room.queue,
      serverTime: Date.now()
    });
  } catch (error) {
    console.error('Error playing next song:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Play previous song
 */
export const playPrevious = async (req, res) => {
  const { roomId } = req.params;
  
  try {
    const roomRegistry = getRoomRegistry();
    const room = roomRegistry.get(roomId);
    
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    // Try to play previous song
    if (room.playPrevious()) {
      // If successful, get or fetch stream URL for the new song
      await ensureStreamUrl(room);
      
      // Emit playback sync event with updated state
      const io = req.app.get('io');
      io.to(roomId).emit('playbackSync', {
        currentSong: room.currentSong,
        isPlaying: room.isPlaying,
        currentPosition: room.getCurrentPlaybackTime(),
        streamUrl: room.currentSong.streamUrl,
        startTimestamp: room.startTimestamp,
        serverTime: Date.now()
      });
      
      return res.json({ 
        message: 'Playing previous song', 
        currentSong: room.currentSong 
      });
    } else {
      return res.status(400).json({ message: 'No previous song available' });
    }
  } catch (error) {
    console.error('Error playing previous song:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Play specific song from queue
 */
export const playSong = async (req, res) => {
  const { roomId, songId } = req.params;
  
  try {
    const roomRegistry = getRoomRegistry();
    const room = roomRegistry.get(roomId);
    
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    // Find the song in the queue
    const song = room.queue.find(s => s.id === songId);
    
    if (!song) {
      return res.status(404).json({ message: 'Song not found in queue' });
    }
    
    // Start playback of the specific song
    if (room.startPlayback(song)) {
      // If successful, ensure we have the stream URL
      await ensureStreamUrl(room);
      
      // Emit playback sync event with updated state
      const io = req.app.get('io');
      io.to(roomId).emit('playbackSync', {
        currentSong: room.currentSong,
        isPlaying: room.isPlaying,
        currentPosition: room.getCurrentPlaybackTime(),
        streamUrl: room.currentSong.streamUrl,
        startTimestamp: room.startTimestamp,
        serverTime: Date.now()
      });
      
      return res.json({ 
        message: 'Playing requested song', 
        currentSong: room.currentSong 
      });
    } else {
      return res.status(500).json({ message: 'Failed to start playback' });
    }
  } catch (error) {
    console.error('Error playing specific song:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Helper function to ensure a song has a stream URL
 */
async function ensureStreamUrl(room) {
  if (!room.currentSong) return;
  
  // If the song already has a stream URL, we're good
  if (room.currentSong.streamUrl) return;
  
  try {
    // Get stream URL using yt-dlp
    const ytdlpManager = await getYTDLPManager();
    const streamUrl = await ytdlpManager.getDirectAudioUrl(room.currentSong.id);
    
    if (!streamUrl) {
      throw new Error('Failed to get stream URL');
    }
    
    // Update song with stream URL
    room.currentSong.streamUrl = streamUrl;
  } catch (error) {
    console.error('Error getting stream URL:', error);
    throw error;
  }
}
