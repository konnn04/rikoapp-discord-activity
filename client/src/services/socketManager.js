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
    // Avoid processing duplicate events in quick succession
    const now = Date.now();
    const lastTime = this.lastEventTimes.playbackSync || 0;
    
    if (now - lastTime < 500) {
      console.log('Skipping duplicate playback sync');
      return;
    }
    
    this.lastEventTimes.playbackSync = now;
    console.log('Playback sync received:', data);
    
    if (this.handlers.playbackSync) {
      // Use a small timeout to prevent UI freezing
      setTimeout(() => {
        this.handlers.playbackSync(data);
      }, 0);
    }
  }
  
  /**
   * Handle queue update events from socket
   */
  handleQueueUpdate(data) {
    console.log('Queue update received:', data.queue?.length || 0);
    
    if (this.handlers.queueUpdate) {
      // Debounce queue updates to prevent UI freezing
      this.debounce('queueUpdate', () => {
        this.handlers.queueUpdate(data.queue);
      }, 200);
    }
  }
  
  /**
   * Handle participants update events from socket
   */
  handleParticipantsUpdate(data) {
    console.log('Participants update received:', data);
    
    if (this.handlers.participantsUpdate) {
      this.debounce('participantsUpdate', () => {
        this.handlers.participantsUpdate(data.participants);
      }, 300);
    }
  }
  
  /**
   * Handle track change events from socket
   */
  handleTrackChange(data) {
    console.log('Track change received:', data);
    
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
  
  // Handler setters
  setPlaybackSyncHandler(handler) {
    this.handlers.playbackSync = handler;
  }
  
  setQueueUpdateHandler(handler) {
    this.handlers.queueUpdate = handler;
  }
  
  setParticipantsUpdateHandler(handler) {
    this.handlers.participantsUpdate = handler;
  }
  
  setTrackChangeHandler(handler) {
    this.handlers.trackChange = handler;
  }
  
  setPlaybackEndedHandler(handler) {
    this.handlers.playbackEnded = handler;
  }
  
  setRoomJoinedHandler(handler) {
    this.handlers.roomJoined = handler;
  }
  
  setRoomLeftHandler(handler) {
    this.handlers.roomLeft = handler;
  }
  
  setSkipVoteUpdateHandler(handler) {
    this.handlers.skipVoteUpdate = handler;
  }
  
  setQueueProcessingHandler(handler) {
    this.handlers.queueProcessing = handler;
  }
}

export default new SocketManager();
