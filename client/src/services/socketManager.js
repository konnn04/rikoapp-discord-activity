import socketService from './socket';

/**
 * Socket Manager - handles socket events and callbacks
 * Prevents UI freezing by debouncing and handling socket events efficiently
 */
class SocketManager {
  constructor() {
    this.initialized = false;
    this.handlers = {
      playbackSync: null,
      queueUpdate: null,
      participantsUpdate: null,
      trackChange: null,
      playbackEnded: null, 
      roomJoined: null,
      roomLeft: null,
      skipVoteUpdate: null,
      queueProcessing: null
    };
    
    // For handling debounce timeouts
    this.debounceTimers = {};
    
    // Track last event times to prevent duplicate processing
    this.lastEventTimes = {};
  }
  
  /**
   * Initialize socket event listeners
   */
  initialize() {
    if (this.initialized) return;
    
    // Setup socket event listeners
    socketService.on('playbackSync', (data) => this.handlePlaybackSync(data));
    socketService.on('queueUpdate', (data) => this.handleQueueUpdate(data));
    socketService.on('participantsUpdate', (data) => this.handleParticipantsUpdate(data));
    socketService.on('trackChange', (data) => this.handleTrackChange(data));
    socketService.on('playbackEnded', (data) => this.handlePlaybackEnded(data));
    socketService.on('roomJoined', (data) => this.handleRoomJoined(data));
    socketService.on('roomLeft', (data) => this.handleRoomLeft(data));
    socketService.on('skipVoteUpdate', (data) => this.handleSkipVoteUpdate(data));
    socketService.on('queueProcessing', (data) => this.handleQueueProcessing(data));
    
    this.initialized = true;
    console.log('Socket manager initialized');
  }
  
  /**
   * Cleanup socket event listeners
   */
  cleanup() {
    // Clear all debounce timers
    Object.values(this.debounceTimers).forEach(timer => clearTimeout(timer));
    this.debounceTimers = {};
    
    // Reset handler references
    this.handlers = {
      playbackSync: null,
      queueUpdate: null,
      participantsUpdate: null,
      trackChange: null,
      playbackEnded: null,
      roomJoined: null,
      roomLeft: null,
      skipVoteUpdate: null,
      queueProcessing: null
    };
    
    this.initialized = false;
    console.log('Socket manager cleaned up');
  }
  
  /**
   * Debounce a function call
   */
  debounce(key, callback, delay = 100) {
    if (this.debounceTimers[key]) {
      clearTimeout(this.debounceTimers[key]);
    }
    
    this.debounceTimers[key] = setTimeout(() => {
      callback();
      delete this.debounceTimers[key];
    }, delay);
  }
  
  /**
   * Handle playback sync events from socket
   */
  handlePlaybackSync(data) {
    if (this.playbackSyncHandler) {
      this.debounce('playbackSync', () => {
        this.playbackSyncHandler(data);
      });
    }
  }
  
  /**
   * Handle queue update events from socket
   */
  handleQueueUpdate(data) {
    console.log('Queue update received:', data);
    // Ensure direct calling without debounce to prevent missing updates
    if (this.queueUpdateHandler) {
      // Add a timestamp to force UI update
      if (data && !data.timestamp) {
        data.timestamp = Date.now();
      }
      this.queueUpdateHandler(data);
    }
  }
  
  /**
   * Handle participants update events from socket
   */
  handleParticipantsUpdate(data) {
    console.log('Participants update received:', data);
    if (this.participantsUpdateHandler) {
      // Add timestamp to force refresh
      if (data && !data.timestamp) {
        data.timestamp = Date.now();
      }
      // Process immediately without debounce for accurate count
      this.participantsUpdateHandler(data);
    }
  }
  
  /**
   * Handle track change events from socket
   */
  handleTrackChange(data) {
    console.log('Track change received:', data);
    
    // If track change includes queue updates, process them
    if (data.queue && this.handlers.queueUpdate) {
      this.handlers.queueUpdate(data.queue);
    }
    
    if (this.handlers.trackChange) {
      setTimeout(() => {
        this.handlers.trackChange(data);
      }, 0);
    }
  }
  
  /**
   * Handle playback ended events from socket
   */
  handlePlaybackEnded(data) {
    console.log('Playback ended received:', data);
    
    if (this.handlers.playbackEnded) {
      setTimeout(() => {
        this.handlers.playbackEnded(data);
      }, 0);
    }
  }
  
  /**
   * Handle room joined events from socket
   */
  handleRoomJoined(data) {
    console.log('Room joined received:', data);
    
    if (this.handlers.roomJoined) {
      setTimeout(() => {
        this.handlers.roomJoined(data);
      }, 0);
    }
  }
  
  /**
   * Handle room left events from socket
   */
  handleRoomLeft(data) {
    console.log('Room left received');
    
    if (this.handlers.roomLeft) {
      setTimeout(() => {
        this.handlers.roomLeft(data);
      }, 0);
    }
  }
  
  /**
   * Handle skip vote update events from socket
   */
  handleSkipVoteUpdate(data) {
    console.log('Skip vote update received:', data);
    
    if (this.handlers.skipVoteUpdate) {
      setTimeout(() => {
        this.handlers.skipVoteUpdate(data);
      }, 0);
    }
  }
  
  /**
   * Handle queue processing events from socket
   */
  handleQueueProcessing(data) {
    console.log('Queue processing update received:', data);
    
    if (this.handlers.queueProcessing) {
      setTimeout(() => {
        this.handlers.queueProcessing(data);
      }, 0);
    }
  }
  
  // Setter methods for handlers
  setPlaybackSyncHandler(handler) {
    this.playbackSyncHandler = handler;
  }

  setQueueUpdateHandler(handler) {
    this.queueUpdateHandler = handler;
  }

  setParticipantsUpdateHandler(handler) {
    this.participantsUpdateHandler = handler;
  }

  setTrackChangeHandler(handler) {
    this.trackChangeHandler = handler;
  }

  setPlaybackEndedHandler(handler) {
    this.playbackEndedHandler = handler;
  }

  setRoomJoinedHandler(handler) {
    this.roomJoinedHandler = handler;
  }

  setSkipVoteUpdateHandler(handler) {
    this.skipVoteUpdateHandler = handler;
  }

  setQueueProcessingHandler(handler) {
    this.queueProcessingHandler = handler;
  }
}

export default new SocketManager();
