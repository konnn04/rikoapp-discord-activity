const DELAY_TIME = 1000; // 1 second delay for playback synchronization

class Room {
  constructor(id) {
    this.id = id;
    this.participants = [];
    this.queue = [];
    this.currentSong = null;
    this.isPlaying = false;
    this.startTimestamp = null;
    this.pauseTimestamp = null;
    this.accumulatedTime = 0;
    this.createdAt = Date.now();
    this.playbackHistory = []; 
    this.autoNextTimer = null; // Timer for automatic playback of next song
    this.lastCommandTime = Date.now(); // Track most recent command time for conflict resolution
    this.skipVotes = new Map(); // Track skip votes: userId -> timestamp
  }
  
  addParticipant(participant) {
    if (!this.participants.some(p => p.id === participant.id)) {
      this.participants.push(participant);
    }
  }
  
  removeParticipant(userId) {
    this.participants = this.participants.filter(p => p.id !== userId);
    return this.participants.length;
  }
  
  addToQueue(song) {
    const songWithMetadata = {
      ...song,
      addedAt: Date.now()
    };
    
    this.queue.push(songWithMetadata);
    
    if (!this.currentSong) {
      this.startPlayback(this.queue[0]);
      // Remove the started song from the queue
      this.queue.shift();
      return true;
    }
    
    return false;
  }
  
  startPlayback(song, io) {
    if (!song) return false;
    
    this.currentSong = song;
    this.isPlaying = true;
    this.currentPosition = 0;
    this.startTimestamp = Date.now();
    this.accumulatedTime = 0;
    this.lastCommandTime = Date.now();
    
    // Clear previous skip votes
    this.skipVotes.clear();
    
    // Setup auto-next timer
    if (io) {
      this.setupAutoNext(io);
    }
    
    return true;
  }
  
  playNext(io) {
    // Clear existing timer
    if (this.autoNextTimer) {
      clearTimeout(this.autoNextTimer);
      this.autoNextTimer = null;
    }
    
    if (this.queue.length === 0) return false;
    
    // Store the current song in history if it exists
    if (this.currentSong) {
      this.playbackHistory.unshift(this.currentSong);
      // Limit history to 20 songs
      if (this.playbackHistory.length > 20) {
        this.playbackHistory.pop();
      }
    }
    
    // Get the next song from queue
    const nextSong = this.queue.shift();
    
    // Start playback with the next song
    this.startPlayback(nextSong, io);
    this.lastCommandTime = Date.now();
    
    // Clear all skip votes since we've moved to a new song
    this.skipVotes.clear();
    
    return true;
  }
  
  playPrevious() {
    if (this.queue.length === 0) return false;
    
    // If we have history, play the most recent song from history
    if (this.playbackHistory.length > 0) {
      const previousSong = this.playbackHistory.shift();
      // Add current song back to queue if needed
      if (this.currentSong) {
        this.queue.unshift(this.currentSong);
      }
      this.startPlayback(previousSong);
      return true;
    }
    
    // Otherwise use the current queue for previous
    const currentIndex = this.currentSong 
      ? this.queue.findIndex(song => song.id === this.currentSong.id)
      : -1;
    
    if (currentIndex > 0) {
      this.startPlayback(this.queue[currentIndex - 1]);
      return true;
    }
    
    return false;
  }
  
  pausePlayback(position = null) {
    if (!this.currentSong || !this.isPlaying) return false;
    
    this.lastCommandTime = Date.now();
    this.isPlaying = false;
    this.pauseTimestamp = Date.now();
    
    // Use provided position if available, otherwise calculate it
    if (position !== null) {
      this.currentPosition = position;
      this.accumulatedTime = position;
    } else {
      // Calculate accumulated time based on how long we've been playing
      this.accumulatedTime += (this.pauseTimestamp - this.startTimestamp) / 1000;
      this.currentPosition = this.accumulatedTime;
    }
    
    // Clear auto-next timer
    if (this.autoNextTimer) {
      clearTimeout(this.autoNextTimer);
      this.autoNextTimer = null;
    }
    
    return true;
  }
  
  resumePlayback() {
    if (!this.currentSong || this.isPlaying) return false;
    
    this.lastCommandTime = Date.now();
    this.isPlaying = true;
    this.startTimestamp = Date.now();
    
    return true;
  }
  
  // Override the existing togglePlayback method to use the new methods
  togglePlayback() {
    if (!this.currentSong) return false;
    
    if (this.isPlaying) {
      return this.pausePlayback();
    } else {
      return this.resumePlayback();
    }
  }
  
  // Seeking in the song
  seekTo(position, io) {
    if (!this.currentSong) return false;
    
    this.lastCommandTime = Date.now();
    
    // Update accumulated time to the new position
    this.accumulatedTime = position;
    
    if (this.isPlaying) {
      // Update start timestamp to account for new position
      this.startTimestamp = Date.now();
      
      // Update auto-next timer for the new position
      if (io && this.autoNextTimer) {
        clearTimeout(this.autoNextTimer);
        this.setupAutoNext(io);
      }
    } else {
      // Just update the current position for paused state
      this.currentPosition = position;
    }
    
    return true;
  }
  
  // Add a skip vote from a user
  addSkipVote(userId, io) {
    if (!this.currentSong) return { success: false, message: "No song playing" };
    
    // If user has already voted, don't count again
    if (this.skipVotes.has(userId)) {
      return { success: false, message: "Already voted to skip" };
    }
    
    // Add this user's vote
    this.skipVotes.set(userId, Date.now());
    
    // Calculate votes needed based on active participants
    const activeParticipants = this.participants.length;
    const votesNeeded = Math.ceil(activeParticipants / 2); // Majority vote
    
    // If we have enough votes or if there's only one person, skip the song
    if (this.skipVotes.size >= votesNeeded || activeParticipants === 1) {
      const previousSong = this.currentSong;
      const hasNext = this.playNext(io);
      
      if (hasNext) {
        // Emit events for the skip
        if (io) {
          const socketService = io.socketService;
          
          // Emit playback sync with new song
          socketService.emitPlaybackSync(this.id, this);
          
          // Emit track change event
          socketService.emitTrackChange(this.id, previousSong.id, this.currentSong.id, {
            skipped: true,
            votedBy: Array.from(this.skipVotes.keys())
          });
        }
        
        return { 
          success: true, 
          message: "Song skipped", 
          skipped: true,
          votesNeeded: 0,
          currentVotes: 0
        };
      } else {
        return { 
          success: false, 
          message: "No more songs in queue",
          skipped: false
        };
      }
    }
    
    // Not enough votes yet
    return { 
      success: true, 
      message: "Skip vote added", 
      skipped: false,
      votesNeeded: votesNeeded,
      currentVotes: this.skipVotes.size
    };
  }
  
  // Shuffle the queue
  shuffleQueue() {
    // Fisher-Yates shuffle algorithm
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    
    this.lastCommandTime = Date.now();
    return true;
  }
  
  // Reorder a song in the queue
  reorderQueue(fromIndex, toIndex) {
    if (
      fromIndex < 0 || 
      fromIndex >= this.queue.length || 
      toIndex < 0 || 
      toIndex >= this.queue.length
    ) {
      return false;
    }
    
    // Get the item to move
    const itemToMove = this.queue[fromIndex];
    
    // Remove it from its original position
    this.queue.splice(fromIndex, 1);
    
    // Insert it at the new position
    this.queue.splice(toIndex, 0, itemToMove);
    
    this.lastCommandTime = Date.now();
    return true;
  }
  
  // Get current playback time considering accumulated time and elapsed time since start
  getCurrentPlaybackTime() {
    if (!this.currentSong) {
      return 0;
    }
    
    if (!this.isPlaying) {
      return this.currentPosition;
    }
    
    const currentTime = Date.now();
    const elapsedSinceStart = (currentTime - this.startTimestamp) / 1000;
    const currentPosition = this.accumulatedTime + elapsedSinceStart;
    
    // Đảm bảo không vượt quá độ dài bài hát
    if (this.currentSong.duration && currentPosition > this.currentSong.duration) {
      return this.currentSong.duration;
    }
    
    return currentPosition;
  }
  
  getState() {
    return {
      id: this.id,
      participants: this.participants,
      queue: this.queue,
      currentSong: this.currentSong,
      isPlaying: this.isPlaying,
      currentPosition: this.getCurrentPlaybackTime(),
      startTimestamp: this.startTimestamp,
      pauseTimestamp: this.pauseTimestamp,
      accumulatedTime: this.accumulatedTime,
      playbackHistory: this.playbackHistory,
      serverTime: Date.now()
    };
  }
  
  isEmpty() {
    return this.participants.length === 0;
  }
  
  // Remove a specific song from the queue by ID
  removeSong(songId) {
    if (!songId) return false;
    
    const initialLength = this.queue.length;
    this.queue = this.queue.filter(song => song.id !== songId);
    
    // Return true if a song was removed
    return this.queue.length < initialLength;
  }
  
  clearQueue() {
    // Keep the current song if there is one
    const currentSong = this.currentSong;
    
    // Clear the queue
    this.queue = [];
    this.lastCommandTime = Date.now();
    
    return true;
  }
  
  // Setup song progress and handle auto-next when a song ends
  setupAutoNext(io) {
    // Clear any existing timer
    if (this.autoNextTimer) {
      clearTimeout(this.autoNextTimer);
      this.autoNextTimer = null;
    }
    
    // Only set timer if there's a current song and it's playing
    if (this.currentSong && this.isPlaying) {
      const currentTime = this.getCurrentPlaybackTime();
      
      // Đảm bảo bài hát có thông tin về độ dài
      if (!this.currentSong.duration) {
        console.warn(`Song ${this.currentSong.id} has no duration, cannot set auto-next timer`);
        return;
      }
      
      const remainingTime = Math.max(0, this.currentSong.duration - currentTime) * 1000; // Convert to ms
      
      console.log(`Setting auto-next timer for room ${this.id}: ${Math.round(remainingTime/1000)}s remaining`);
      
      this.autoNextTimer = setTimeout(() => {
        const prevSong = this.currentSong;
        const hasNext = this.playNext();
        
        if (hasNext) {
          console.log(`Auto-advancing to next song in room ${this.id}`);
          const socketService = io.socketService;
          
          // Emit playback sync with new song
          socketService.emitPlaybackSync(this.id, this);
          
          // Emit track change event
          socketService.emitTrackChange(this.id, prevSong.id, this.currentSong.id, {
            automatic: true,
            timerTriggered: true
          });
        } else {
          console.log(`No more songs in queue for room ${this.id}`);
          // Mark playback as ended - no more songs
          this.isPlaying = false;
          
          const socketService = io.socketService;
          socketService.emitPlaybackEnded(this.id);
        }
      }, remainingTime + 500); // Add 500ms buffer
    }
  }
}

export default Room;