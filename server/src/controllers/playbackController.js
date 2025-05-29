import { getRoomRegistry } from '../services/roomRegistry.js';
import { getYTDLPManager } from '../services/ytdlpService.js';

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

    // Check if user is in the room
    const userInRoom = room.participants.some(p => p.id === userId);
    if (!userInRoom) {
      return res.status(403).json({ message: 'You are not in this room' });
    }

    // Toggle playback and get the new state
    const toggled = room.togglePlayback();

    if (!toggled) {
      return res.status(400).json({ message: 'No song is currently playing' });
    }

    // Emit playback update to all room members with enhanced sync data
    const io = req.app.get('io');
    if (io && io.socketService) {
      // Use the enhanced socket service for more accurate sync
      io.socketService.emitPlaybackSync(roomId, room, {
        action: room.isPlaying ? 'play' : 'pause',
        triggeredBy: userId,
        timestamp: Date.now()
      });
      
      // Log the sync event
      console.log(`[PlaybackSync] ${room.isPlaying ? 'Play' : 'Pause'} triggered by ${userId} in room ${roomId}`);
    } else {
      // Fallback to basic emit if socket service is not available
      io.to(roomId).emit('playbackSync', {
        currentSong: room.currentSong,
        isPlaying: room.isPlaying,
        currentPosition: room.getCurrentPlaybackTime(),
        streamUrl: room.currentSong?.streamUrl,
        startTimestamp: room.startTimestamp,
        serverTime: Date.now(),
        action: room.isPlaying ? 'play' : 'pause'
      });
    }

    return res.json({
      isPlaying: room.isPlaying,
      currentPosition: room.getCurrentPlaybackTime(),
      serverTime: Date.now()
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
    const played = room.playNext(req.app.get('io'));

    if (!played) {
      return res.status(400).json({ message: 'No more songs in queue' });
    }

    // Emit playback update to all room members
    const io = req.app.get('io');
    io.socketService.emitPlaybackSync(roomId, room);
    
    // Emit track change notification
    io.socketService.emitTrackChange(roomId, previousSong?.id, room.currentSong?.id, {
      skippedBy: userId
    });

    return res.json({
      currentSong: room.currentSong,
      isPlaying: room.isPlaying,
      currentPosition: room.getCurrentPlaybackTime()
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
