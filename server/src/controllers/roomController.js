import Room from '../models/Room.js';
import Participant from '../models/Participant.js';
import { getUserFromDiscord } from '../services/discordService.js';

// Global room registry (accessed from socket service too)
import { getRoomRegistry } from '../services/roomRegistry.js';

/**
 * Get room information
 */
export const getRoomInfo = async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;
  
  try {
    const roomRegistry = getRoomRegistry();
    let room = roomRegistry.get(roomId);
    
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    return res.json(room.getState());
  } catch (error) {
    console.error('Error getting room info:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Join a room
 */
export const joinRoom = async (req, res) => {
  const { roomId } = req.params;
  const { user } = req.body
  
  try {
    const roomRegistry = getRoomRegistry();
    let room = roomRegistry.get(roomId);
    
    if (!room) {
      room = new Room(roomId);
      roomRegistry.set(roomId, room);
    }
    // Create participant
    const participant = new Participant(
      user.id,
      user.global_name || user.username,
      user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null
    );
    
    // Add participant to room
    room.addParticipant(participant);
    
    // Emit participant update to all room members via socket
    const io = req.app.get('io');
    if (io && io.socketService) {
      io.socketService.emitParticipantsUpdate(roomId, room.participants);
      
      // If there's a current song, make sure the new user receives it with stream URL
      if (room.currentSong) {
        // Add the user to the room for socket.io
        const socket = io.socketService.getSocketForUser(user.id);
        if (socket) {
          socket.join(roomId);
          
          // Send synchronized playback state specifically to this user
          io.socketService.emitPlaybackSyncToSocket(socket.id, room, {
            initialJoin: true
          });
        }
      }
    }
    
    // Return success
    return res.json({ 
      message: 'Successfully joined room',
      room: room.getState()
    });
  } catch (error) {
    console.error('Error joining room:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Leave a room
 */
export const leaveRoom = async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;
  
  try {
    const roomRegistry = getRoomRegistry();
    const room = roomRegistry.get(roomId);
    
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    // Remove participant
    const remainingParticipants = room.removeParticipant(userId);
    
    // Emit participant update to all room members
    const io = req.app.get('io');
    io.to(roomId).emit('participantsUpdate', {
      participants: room.participants
    });
    
    // If room is empty, delete it
    if (remainingParticipants === 0) {
      roomRegistry.delete(roomId);
    }
    
    return res.json({ message: 'Successfully left room' });
  } catch (error) {
    console.error('Error leaving room:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get room participants
 */
export const getParticipants = async (req, res) => {
  const { roomId } = req.params;
  
  try {
    const roomRegistry = getRoomRegistry();
    const room = roomRegistry.get(roomId);
    
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    return res.json(room.participants);
  } catch (error) {
    console.error('Error getting room participants:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
