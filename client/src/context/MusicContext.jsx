import { createContext, useContext } from 'react';

// Create the context with default values
const MusicContext = createContext({
  audioRef: null,
  isConnected: false,
  queue: [],
  currentSong: null,
  isPlaying: false,
  currentPosition: 0,
  participants: [],
  volume: 0.5,
  lyrics: null,
  setVolume: () => {},
  setCurrentSong: () => {},
  setIsPlaying: () => {},
  setQueue: () => {},
  setCurrentPosition: () => {},
  setParticipants: () => {},
  setCurrentRoom: () => {},
  joinRoomHandle: () => {},
  togglePlayback: () => {},
  playNext: () => {},
  seekTo: () => {},
  addToQueue: () => {},
  clearQueue: () => {},
  voteToSkip: () => {},
  reorderQueue: () => {},
  syncFromServer: () => {},
  isSyncing: false,
  removeFromQueue: () => {},
});

// Export the hook for using the context
export const useMusic = () => {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error('useMusic must be used within a MusicProvider');
  }
  return context;
};

export default MusicContext;
