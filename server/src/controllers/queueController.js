import { getRoomRegistry } from '../services/roomRegistry.js';
import { getYTDLPManager } from '../services/ytdlpService.js';

/**
 * Get queue for a room
 */
export const getQueue = async (req, res) => {
  const { roomId } = req.params;

  try {
    const roomRegistry = getRoomRegistry();
    const room = roomRegistry.get(roomId);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    return res.json(room.queue);
  } catch (error) {
    console.error('Error getting queue:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Add song to queue
 */
export const addToQueue = async (req, res) => {
  const { roomId } = req.params;
  const { song } = req.body;
  const userId = req.user.id;

  // Enhanced input validation
  if (!song || !song.id) {
    return res.status(400).json({ 
      success: false,
      message: 'Invalid song data: missing song or song ID' 
    });
  }

  try {
    const roomRegistry = getRoomRegistry();
    const room = roomRegistry.get(roomId);

    if (!room) {
      return res.status(404).json({ 
        success: false,
        message: 'Room not found' 
      });
    }

    // Check if user is in the room
    const participant = room.participants.find(p => p.id === userId);
    if (!participant) {
      return res.status(403).json({
        success: false, 
        message: 'You must be in the room to add songs'
      });
    }

    // Check queue size limit
    const USER_QUEUE_LIMIT = 20; // Set a reasonable limit
    const userSongsInQueue = room.queue.filter(queuedSong => queuedSong.addedBy === userId).length;
    
    if (userSongsInQueue >= USER_QUEUE_LIMIT) {
      return res.status(429).json({
        success: false,
        message: `Queue limit reached: You can only queue up to ${USER_QUEUE_LIMIT} songs at a time`
      });
    }

    // Check for duplicates
    const isDuplicate = room.queue.some(queuedSong => queuedSong.id === song.id);
    if (isDuplicate && room.currentSong?.id !== song.id) {
      return res.status(409).json({
        success: false, 
        message: 'This song is already in the queue'
      });
    }

    // Send an immediate response that we're processing
    res.status(202).json({
      success: true,
      message: 'Processing song request',
      songId: song.id,
      status: 'processing'
    });

    // Add user to song's metadata
    const enhancedSong = {
      ...song,
      addedBy: req.user.global_name || req.user.name || req.user.id,
      addedAt: Date.now(),
      requestedBy: participant.name || 'Unknown user',
    };

    // Process in background with better error handling
    fetchStreamUrlAndAddToQueue(req.app.get('io'), roomId, room, enhancedSong, userId)
      .catch(error => {
        console.error(`Queue processing error for song ${song.id}:`, error);
        // Send error notification via socket
        req.app.get('io').to(roomId).emit('queueProcessing', {
          songId: song.id,
          status: 'error',
          message: `Failed to process song: ${error.message || 'Unknown error'}`
        });
      });
      
  } catch (error) {
    console.error('Error adding to queue:', error);
    // If response hasn't been sent yet
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Server error while processing queue request'
      });
    }
  }
};

/**
 * Helper function to fetch stream URL and add song to queue
 */
async function fetchStreamUrlAndAddToQueue(io, roomId, room, song, userId) {
  const MAX_RETRIES = 2;
  let retries = 0;
  let success = false;
  
  // Get socket service
  const SocketService = io.socketService;

  while (retries <= MAX_RETRIES && !success) {
    try {
      // Notify that we're fetching the stream URL
      SocketService.emitQueueProcessing(roomId, {
        songId: song.id,
        status: retries > 0 ? 'retrying' : 'fetchingStreamUrl',
        message: retries > 0 ? `Retrying (${retries}/${MAX_RETRIES})...` : 'Getting audio stream...'
      }, userId);

      // Get stream URL using yt-dlp with timeout
      const ytdlpManager = await getYTDLPManager();
      const streamUrl = await Promise.race([
        ytdlpManager.getDirectAudioUrl(song.id),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timed out getting stream URL')), 15000)
        )
      ]);

      if (!streamUrl) {
        throw new Error('Failed to get stream URL: empty response');
      }

      // Add metadata to song
      song.streamUrl = streamUrl;
      
      // Check if room still exists (might have been deleted while processing)
      const roomRegistry = getRoomRegistry();
      if (!roomRegistry.has(roomId)) {
        throw new Error('Room no longer exists');
      }

      // Save previous song to detect if this is starting playback
      const previousSong = room.currentSong;
      const wasPlaying = room.isPlaying;
      
      // Add to queue with optimistic locking
      const startedPlaying = room.addToQueue(song);

      // If this is the first song, emit a playback event with stream URL
      if (startedPlaying) {
        SocketService.emitPlaybackSync(roomId, room);
        
        // If we transitioned from no song to a song, emit track change
        if (!previousSong && room.currentSong) {
          SocketService.emitTrackChange(roomId, null, room.currentSong.id);
        }
      } else {
        // Otherwise just update the queue
        SocketService.emitQueueUpdate(roomId, room.queue);
      }

      // Update the user's stats (songs added count)
      const participant = room.participants.find(p => p.id === userId);
      if (participant) {
        participant.songsAdded = (participant.songsAdded || 0) + 1;
        
        // Emit participant update
        SocketService.emitParticipantsUpdate(roomId, room.participants);
      }

      // Notify of success
      SocketService.emitQueueProcessing(roomId, {
        songId: song.id,
        status: 'success',
        message: 'Song added to queue successfully'
      }, userId);

      success = true;
      return;
      
    } catch (error) {
      retries++;
      console.error(`Error processing song (attempt ${retries}):`, error);
      
      if (retries > MAX_RETRIES) {
        SocketService.emitQueueProcessing(roomId, {
          songId: song.id,
          status: 'error',
          message: `Error adding song: ${error.message || 'Unknown error'}`
        }, userId);
        throw error;
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

/**
 * Remove song from queue
 */
export const removeFromQueue = async (req, res) => {
  const { roomId, songId } = req.params;

  try {
    const roomRegistry = getRoomRegistry();
    const room = roomRegistry.get(roomId);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const removed = room.removeSong(songId);

    if (!removed) {
      return res.status(404).json({ message: 'Song not found in queue' });
    }

    // Emit queue update to all room members
    const io = req.app.get('io');
    io.to(roomId).emit('queueUpdate', {
      queue: room.queue
    });

    return res.json({ message: 'Song removed from queue' });
  } catch (error) {
    console.error('Error removing from queue:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Clear queue
 */
export const clearQueue = async (req, res) => {
  const { roomId } = req.params;

  try {
    const roomRegistry = getRoomRegistry();
    const room = roomRegistry.get(roomId);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    room.clearQueue();

    // Emit queue update to all room members
    const io = req.app.get('io');
    io.to(roomId).emit('queueUpdate', {
      queue: room.queue
    });

    // If this affected playback, emit playback update
    io.to(roomId).emit('playbackSync', {
      currentSong: room.currentSong,
      isPlaying: room.isPlaying,
      currentPosition: room.getCurrentPlaybackTime(),
      streamUrl: room.currentSong?.streamUrl,
      startTimestamp: room.startTimestamp,
      serverTime: Date.now()
    });

    return res.json({ message: 'Queue cleared' });
  } catch (error) {
    console.error('Error clearing queue:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
