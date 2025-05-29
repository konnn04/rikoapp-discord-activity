// Shared room registry for both socket and API to access the same rooms

class RoomRegistry {
  constructor() {
    this.rooms = new Map();
  }
  
  get(roomId) {
    return this.rooms.get(roomId);
  }
  
  set(roomId, room) {
    this.rooms.set(roomId, room);
  }
  
  delete(roomId) {
    this.rooms.delete(roomId);
  }
  
  has(roomId) {
    return this.rooms.has(roomId);
  }
  
  getAllRooms() {
    return Array.from(this.rooms.values());
  }
  
  getRoomForUser(userId) {
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.participants.some(p => p.id === userId)) {
        return room;
      }
    }
    return null;
  }
}

// Singleton instance
const roomRegistry = new RoomRegistry();

export const getRoomRegistry = () => roomRegistry;
