import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { toast } from 'react-toastify';
import { joinRoom, addToQueueApi, getQueueApi, byProxy } from '../services/api';
import socketService from '../services/socket';
import socketManager from '../services/socketManager';

const MusicContext = createContext(null);

export const MusicProvider = ({ children }) => {
  const { token, isAuthenticated, channelId, user } = useAuth();
  const [currentRoom, setCurrentRoom] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [isNoSong, setIsNoSong] = useState(true);
  const audioRef = useRef(null);

  // Thêm các biến trạng thái để theo dõi quá trình đồng bộ
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(0);
  const serverTimeOffsetRef = useRef(0); // Độ lệch thời gian giữa server và client
  
  // Tham chiếu đến bài hát hiện tại để tránh tải lại khi không cần thiết
  const currentSongIdRef = useRef(null);
  
  // Tham chiếu đến thời gian phát khi khôi phục phiên làm việc
  const resumePositionRef = useRef(null);

  const setStatRoom = (room) => {
    console.log('Setting current room:', room);
    setCurrentRoom(room);
    setParticipants(room.participants || []);
    setQueue(room.queue || []);
    
    // Lưu vị trí phát detect tại nếu thay đổi bài hát
    if (room.currentSong && room.currentSong.id !== currentSongIdRef.current) {
      resumePositionRef.current = room.currentPosition || 0;
      currentSongIdRef.current = room.currentSong.id;
    }
    
    setCurrentSong(room.currentSong || null);
    setIsPlaying(room.isPlaying || false);
    setCurrentPosition(room.currentPosition || 0);
    
    // Tính toán độ lệch thời gian server-client
    if (room.serverTime) {
      serverTimeOffsetRef.current = Date.now() - room.serverTime;
    }
  }

  useEffect(() => {
    if (currentRoom) {
      setStatRoom(currentRoom);
    }
  }, [currentRoom]);

  // When the current song changes, update the audio source
  useEffect(() => {
    if (!currentSong) {
      setIsNoSong(true);
      return;
    }
    
    setIsNoSong(false);
    
    if (audioRef.current) {
      const streamUrl = currentSong.streamUrl;
      if (!streamUrl) {
        console.error('Current song has no stream URL:', currentSong);
        toast.error('This song has no playable source');
        // Try to request a new stream URL from the server
        if (currentRoom?.id) {
          socketService.reportError({
            type: 'missingStreamUrl',
            songId: currentSong.id,
            roomId: currentRoom.id
          });
          socketService.requestSync(currentRoom.id);
        }
        return;
      }
      
      try {
        // Đánh dấu là đang đồng bộ để tránh cập nhật trùng lặp
        setIsSyncing(true);
        
        // Lưu vị trí hiện tại nếu bài hát không thay đổi
        const resumePosition = resumePositionRef.current !== null
          ? resumePositionRef.current
          : currentPosition;
        
        console.log(`Setting audio source: ${streamUrl} at position ${resumePosition}s`);
        
        // Cập nhật URL nguồn - thêm timestamp để tránh cache
        const proxiedUrl = streamUrl.startsWith('http') 
          ? `${byProxy(streamUrl)}&_t=${Date.now()}` 
          : streamUrl;
        
        // Tạo một audio element tạm để kiểm tra URL trước khi gán cho player chính
        const tempAudio = new Audio();
        tempAudio.crossOrigin = "anonymous";
        
        // Xử lý khi audio tạm load thành công
        const loadPromise = new Promise((resolve, reject) => {
          // Thiết lập timeout để không chờ quá lâu
          const timeout = setTimeout(() => {
            tempAudio.pause();
            tempAudio.src = '';
            reject(new Error('Audio preload timeout'));
          }, 8000);
          
          tempAudio.oncanplaythrough = () => {
            clearTimeout(timeout);
            resolve(true);
          };
          
          tempAudio.onerror = (e) => {
            clearTimeout(timeout);
            reject(new Error(`Audio preload error: ${e.target.error?.message || 'Unknown error'}`));
          };
        });
        
        // Bắt đầu tải audio tạm
        tempAudio.preload = "auto";
        tempAudio.src = proxiedUrl;
        tempAudio.load();
        
        // Đợi audio tạm load hoặc timeout
        loadPromise.then(() => {
          // Khi load thành công, áp dụng cho audio player chính
          audioRef.current.src = proxiedUrl;
          audioRef.current.load(); // Ép tải lại audio element
          
          // Đặt âm lượng trước khi phát
          audioRef.current.volume = volume;
          
          // Đặt vị trí phát
          if (resumePosition > 0) {
            console.log(`Resuming at position: ${resumePosition}s`);
            audioRef.current.currentTime = resumePosition;
            setCurrentPosition(resumePosition);
            // Xóa vị trí khởi động lại để tránh sử dụng lại
            resumePositionRef.current = null;
          }
          
          // Xử lý trạng thái phát
          if (isPlaying) {
            // Bọc trong timeout để đảm bảo audio đã load đủ
            setTimeout(() => {
              if (audioRef.current) {
                const playPromise = audioRef.current.play();
                if (playPromise !== undefined) {
                  playPromise.catch(error => {
                    console.error('Error playing audio:', error);
                    
                    // Báo cáo lỗi lên server
                    socketService.reportError({
                      type: 'playbackError',
                      songId: currentSong.id,
                      message: error.message,
                      roomId: currentRoom?.id
                    });
                    
                    // Yêu cầu đồng bộ lại từ server
                    if (currentRoom?.id) {
                      socketService.requestSync(currentRoom.id);
                    }
                    
                    toast.error('Failed to play the song. Please try again.');
                    setIsPlaying(false);
                  }).finally(() => {
                    // Đánh dấu đồng bộ hoàn tất
                    setIsSyncing(false);
                  });
                } else {
                  setIsSyncing(false);
                }
              }
            }, 300);
          } else {
            audioRef.current.pause();
            setIsSyncing(false);
          }
        }).catch(error => {
          console.error('Error preloading audio:', error);
          setIsSyncing(false);
          
          // Thử tạo lại một URL khác
          if (currentRoom?.id && currentSong) {
            toast.error('Failed to load audio. Trying to fix...');
            socketService.reportError({
              type: 'streamUrlError',
              songId: currentSong.id,
              roomId: currentRoom.id
            });
            
            // Yêu cầu một URL stream mới
            fetch(`/.proxy/api/music/${currentSong.id}/stream`, {
              headers: { 'Authorization': `Bearer ${token}` }
            })
            .then(response => response.json())
            .then(data => {
              if (data.streamUrl) {
                // Cập nhật URL mới
                const updatedSong = {...currentSong, streamUrl: data.streamUrl};
                setCurrentSong(updatedSong);
              }
            })
            .catch(err => {
              console.error('Failed to get new stream URL:', err);
            });
          }
        });
      } catch (error) {
        console.error('Exception setting up audio source:', error);
        toast.error('Failed to set up audio playback');
        setIsSyncing(false);
      }
    } else if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
  }, [currentSong]); // Remove volume from dependencies

  // Handle play/pause state changes
  useEffect(() => {
    if (audioRef.current && !isSyncing) {
      if (isPlaying) {
        console.log('Attempting to play audio due to isPlaying change');
        audioRef.current.play().catch(error => {
          console.error('Error playing audio:', error);
          toast.error('Failed to play the song. Please try again.');
          setIsPlaying(false);
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, isSyncing]);

  // Optimize volume changes to avoid triggering multiple updates
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]); // Keep volume as a separate effect
  
  // Setup socket listeners when connected
  useEffect(() => {
    if (isConnected) {
      // Initialize socket connection if needed
      if (!socketService.isSocketConnected() && token) {
        socketService.connect(token)
          .then(() => {
            console.log('Socket connected successfully');
          })
          .catch(error => {
            console.error('Socket connection error:', error);
            toast.error('Failed to connect to real-time updates');
          });
      }

      // Initialize socket manager
      socketManager.initialize();

      // Set handlers for socket events
      socketManager.setQueueUpdateHandler((queue) => {
        console.log('Updating queue from socket:', queue);
        setQueue(queue);
      });

      // Handle playback sync with proper stream URL handling and timing
      socketManager.setPlaybackSyncHandler((data) => {
        console.log('Syncing playback from socket:', data);
        const { 
          currentSong, 
          isPlaying, 
          currentPosition, 
          streamUrl, 
          startTimestamp, 
          pauseTimestamp,
          accumulatedTime,
          serverTime, 
          action,
          syncId,
          queue: newQueue 
        } = data;
        
        // Track sync events to prevent duplicates
        const lastSyncId = useRef.current?.lastSyncId;
        if (lastSyncId && lastSyncId === syncId) {
          console.log('Ignoring duplicate sync event with ID:', syncId);
          return;
        }
        useRef.current = { ...useRef.current, lastSyncId: syncId };
        
        // Cập nhật hàng đợi nếu được cung cấp
        if (newQueue) {
          setQueue(newQueue);
        }
        
        // Cập nhật độ lệch thời gian server-client
        if (serverTime) {
          serverTimeOffsetRef.current = Date.now() - serverTime;
          console.log(`Updated server time offset: ${serverTimeOffsetRef.current}ms`);
        }
        
        // Xử lý trường hợp không có bài hát
        if (!currentSong) {
          setCurrentSong(null);
          setIsPlaying(false);
          setCurrentPosition(0);
          currentSongIdRef.current = null;
          return;
        }
        
        // Tính toán vị trí phát chính xác dựa trên thông tin từ server
        let calculatedPosition = currentPosition;
        
        // Special case for precise pause action
        if (action === 'pause' && pauseTimestamp) {
          calculatedPosition = currentPosition; // Use the exact paused position
          console.log(`Sync: Paused at exact position ${calculatedPosition}s`);
        }
        // For playing state, calculate current position
        else if (isPlaying && startTimestamp && serverTime) {
          const serverTimeNow = Date.now() - serverTimeOffsetRef.current;
          const elapsedSinceServerTime = (serverTimeNow - serverTime) / 1000;
          
          if (accumulatedTime !== undefined && startTimestamp) {
            // Most accurate method using accumulated time and elapsed time since start
            const elapsedSinceStart = (serverTimeNow - startTimestamp) / 1000;
            calculatedPosition = accumulatedTime + elapsedSinceStart;
          } else {
            // Fallback to simpler calculation
            calculatedPosition = currentPosition + elapsedSinceServerTime;
          }
          
          console.log(`Calculated position: ${calculatedPosition.toFixed(2)}s (server: ${currentPosition.toFixed(2)}s + elapsed: ${elapsedSinceServerTime.toFixed(2)}s)`);
        }

        // Don't exceed song duration
        if (calculatedPosition > currentSong.duration) {
          calculatedPosition = currentSong.duration;
        }

        // Đảm bảo URL luôn hợp lệ
        let validStreamUrl = streamUrl;
        if (!streamUrl && currentSong?.streamUrl) {
          validStreamUrl = currentSong.streamUrl;
        }
        
        // Kiểm tra xem có cần cập nhật bài hát không
        const songChanged = !currentSongIdRef.current || (currentSong.id !== currentSongIdRef.current);
        
        if (songChanged) {
          // Lưu vị trí để khôi phục sau khi thay đổi bài hát
          resumePositionRef.current = calculatedPosition;
          currentSongIdRef.current = currentSong.id;
          
          // Tạo đối tượng bài hát cập nhật với URL hợp lệ
          const updatedSong = {
            ...currentSong,
            streamUrl: validStreamUrl
          };
          
          console.log('Setting new song with stream URL:', updatedSong);
          setCurrentSong(updatedSong);
        } else {
          // Special case for pause action
          if (action === 'pause' && isPlaying === false) {
            console.log(`Sync: Handling pause action at position ${calculatedPosition}s`);
            setCurrentPosition(calculatedPosition);
            if (audioRef.current) {
              audioRef.current.currentTime = calculatedPosition;
            }
            setIsPlaying(false);
          } 
          // Special case for play action
          else if (action === 'play' && isPlaying === true) {
            console.log(`Sync: Handling play action at position ${calculatedPosition}s`);
            if (audioRef.current) {
              audioRef.current.currentTime = calculatedPosition;
            }
            setCurrentPosition(calculatedPosition);
            setIsPlaying(true);
          }
          // Normal position update (small changes)
          else if (Math.abs(calculatedPosition - currentPosition) > 1) {
            console.log(`Sync: Position adjustment from ${currentPosition.toFixed(2)}s to ${calculatedPosition.toFixed(2)}s`);
            if (audioRef.current) {
              audioRef.current.currentTime = calculatedPosition;
            }
            setCurrentPosition(calculatedPosition);
            
            // Update playing state if needed
            if (isPlaying !== (audioRef.current ? !audioRef.current.paused : false)) {
              setIsPlaying(isPlaying);
            }
          }
        }
        
        setLastSyncTime(Date.now());
      });
      
      socketManager.setParticipantsUpdateHandler((participants) => {
        console.log('Updating participants from socket:', participants);
        setParticipants(participants);
      });
      
      // Add handlers for new events
      socketManager.setTrackChangeHandler((data) => {
        console.log('Track changed:', data);
        
        // Handle track change notifications
        if (data.skipped) {
          toast.info('Song skipped by vote');
        } else if (data.automatic) {
          toast.info('Playing next song');
        } else if (data.newSongId) {
          toast.info('Now playing a new track');
        }
      });
      
      socketManager.setPlaybackEndedHandler((data) => {
        console.log('Playback ended:', data);
        if (!data.nextSong) {
          toast.info('Queue has ended');
          setCurrentSong(null);
        }
      });
      
      socketManager.setRoomJoinedHandler((data) => {
        console.log('Room joined:', data);
        if (data) {
          setStatRoom(data);
        }
      });
      
      socketManager.setSkipVoteUpdateHandler((data) => {
        console.log('Skip vote update:', data);
        // You could update UI to show current vote count
      });
      
      return () => {
        // Clean up socket manager
        socketManager.cleanup();
      };
    }
  }, [isConnected, token, currentRoom?.id]); // Remove volume from dependencies

  const joinRoomHandle = useCallback(async () => {
    if (!isAuthenticated) {
      toast.error('You must be logged in to join a room.');
      return;
    }

    if (isJoiningRoom) {
      return; // Prevent duplicate calls while joining
    }

    setIsJoiningRoom(true);
    try {
      const room = await joinRoom(channelId, user);
      setCurrentRoom(room?.room);
      setIsConnected(true);
      setIsJoiningRoom(false);
      toast.success(`Joined room: ${room?.room?.id || 'Unknown Room'}`);
      console.log('Joined room:', room);
    } catch (error) {
      console.error('Error joining room:', error);
      toast.error('Failed to join room. Please try again.');
      setIsJoiningRoom(false);
    }
  }, [isAuthenticated, isJoiningRoom, channelId, user]);

  // Add missing functions
  const togglePlayback = useCallback(() => {
    if (!currentSong) return;
    
    const newPlayingState = !isPlaying;
    console.log(`Toggling playback to ${newPlayingState ? 'playing' : 'paused'} state`);
    
    // Update local state immediately for responsive UI
    setIsPlaying(newPlayingState);
    
    // Update audio element directly
    if (audioRef.current) {
      if (newPlayingState) {
        audioRef.current.play().catch(err => {
          console.error('Error playing:', err);
          setIsPlaying(false); // Revert state on error
        });
      } else {
        audioRef.current.pause();
      }
    }
    
    // Notify server about the change
    if (currentRoom?.id) {
      fetch(`/.proxy/api/playback/${currentRoom.id}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      .then(response => response.json())
      .then(data => {
        console.log('Toggle response from server:', data);
      })
      .catch(error => {
        console.error('Error toggling playback on server:', error);
      });
    }
  }, [currentSong, isPlaying, currentRoom?.id, token]);

  const playNext = useCallback(() => {
    if (queue.length === 0) return;
    
    const nextSong = queue[0];
    const newQueue = queue.slice(1);
    
    setCurrentSong(nextSong);
    setQueue(newQueue);
    setIsPlaying(true);
    setCurrentPosition  (0);
    
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  }, [queue]);

  const playPrevious = useCallback(() => {
    if (!audioRef.current) return;
    
    // If we're less than 3 seconds into the song, go to previous song if available
    // Otherwise just restart the current song
    if (audioRef.current.currentTime > 3 && queue.length > 0) {
      audioRef.current.currentTime = 0;
    } else {
      // In a real app, you'd implement proper previous song functionality here
      setCurrentPosition(0);
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
    }
  }, [queue]);

  // Modify the seekTo function to synchronize with server
  const seekTo = useCallback((position) => {
    if (!currentRoom?.id || !currentSong) return;
    
    try {
      // Update local position immediately for responsive UI
      setCurrentPosition(position);
      if (audioRef.current) {
        audioRef.current.currentTime = position;
      }
      
      // Notify server about seek action
      fetch(`/.proxy/api/playback/${currentRoom.id}/seek`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ position })
      })
      .catch(error => {
        console.error('Error syncing seek position to server:', error);
      });
    } catch (error) {
      console.error('Error seeking:', error);
    }
  }, [currentRoom?.id, currentSong, token]);

  const addToQueue = async (song) => {
    if (!song || !song.id) {
      toast.error('Invalid song data.');
      return;
    }

    try {
      const response = await addToQueueApi(currentRoom.id, song);
      
      if (response.success) {
        toast.info('Processing your song request...');
      } else {
        toast.error(response.message || 'Failed to add song to queue');
      }
      
      // Note: We don't need to call getQueueApi here anymore as
      // we'll receive a socket notification when processing is complete
    } catch (error) {
      console.error('Error adding song to queue:', error);
      toast.error('Failed to add song to queue');
    }
  }

  const clearQueue = () => {
    setQueue([]);
  }

  const searchSong = async (query) => {
    // Implementation will connect to the API
    return [];
  }

  // Add functionality to vote to skip current song
  const voteToSkip = useCallback(async () => {
    if (!currentRoom?.id || !currentSong) {
      toast.error('No song is playing');
      return;
    }
    
    try {
      const response = await fetch(`/.proxy/api/playback/${currentRoom.id}/skip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to skip song');
      }
      
      const result = await response.json();
      
      if (result.skipped) {
        toast.success('Song skipped');
      } else if (result.success) {
        toast.info(`Skip vote added: ${result.currentVotes}/${result.votesNeeded}`);
      } else {
        toast.warning(result.message);
      }
      
      return result;
    } catch (error) {
      console.error('Error skipping song:', error);
      toast.error(error.message);
      return null;
    }
  }, [currentRoom?.id, currentSong, token]);

  // Add a reorder queue function
  const reorderQueue = async (fromIndex, toIndex) => {
    if (!currentRoom?.id) {
      toast.error('Not connected to a room');
      return;
    }
    
    try {
      const response = await fetch(`/.proxy/api/queue/${currentRoom.id}/reorder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ fromIndex, toIndex })
      });
      
      if (!response.ok) {
        throw new Error('Failed to reorder queue');
      }
      
      return response.json();
    } catch (error) {
      console.error('Error reordering queue:', error);
      toast.error('Failed to reorder queue');
      return null;
    }
  };
  
  // Hàm để chủ động đồng bộ hóa từ server
  const syncFromServer = useCallback(() => {
    if (currentRoom?.id) {
      socketService.requestSync(currentRoom.id);
    }
  }, [currentRoom?.id]);

  return (
    <MusicContext.Provider
      value={{
        audioRef,
        isConnected,
        queue,
        currentSong,
        isPlaying,
        currentPosition,
        participants,
        volume,
        setVolume,
        setCurrentSong,
        setIsPlaying,
        setQueue,
        setCurrentPosition,
        setParticipants,
        setCurrentRoom,
        joinRoomHandle,
        searchSong,
        togglePlayback,
        playNext,
        playPrevious,
        seekTo,
        addToQueue,
        clearQueue,
        voteToSkip,
        reorderQueue,
        syncFromServer, // Thêm hàm này vào exports
        isSyncing,
      }}
    >
      {children}
      <audio
        ref={audioRef} 
        style={{ display: 'none' }} 
        preload="auto"
        crossOrigin="anonymous"
        onCanPlayThrough={() => {
          console.log('Audio can play through');
          // If playback should be started but isn't
          if (isPlaying && audioRef.current?.paused) {
            console.log('Auto-starting playback on canplaythrough event');
            audioRef.current.play().catch(err => {
              console.error('Play failed on canplaythrough:', err);
              
              // Try to automatically unmute on iOS devices
              if (err.name === 'NotAllowedError') {
                // On iOS, we need user interaction
                toast.info('Tap anywhere to enable audio');
                
                const unlockAudio = () => {
                  document.removeEventListener('click', unlockAudio);
                  document.removeEventListener('touchstart', unlockAudio);
                  
                  if (audioRef.current) {
                    const playPromise = audioRef.current.play();
                    if (playPromise !== undefined) {
                      playPromise.catch(e => console.error('Still failed after user interaction:', e));
                    }
                  }
                };
                
                document.addEventListener('click', unlockAudio, { once: true });
                document.addEventListener('touchstart', unlockAudio, { once: true });
              }
            });
          }
        }}
        onTimeUpdate={() => {
          // Chỉ cập nhật vị trí khi không đang đồng bộ để tránh xung đột
          if (!isSyncing && audioRef.current) {
            setCurrentPosition(audioRef.current.currentTime);
          }
        }}
        onEnded={() => {
          // Báo cho server biết khi bài hát kết thúc
          if (currentRoom?.id && currentSong) {
            socketService.reportEvent({
              type: 'trackEnded',
              songId: currentSong.id,
              roomId: currentRoom.id
            });
            
            // Yêu cầu chuyển bài tiếp theo từ server
            socketService.requestSync(currentRoom.id);
          }
          
          // Reset local state
          setIsPlaying(false);
          setCurrentPosition(0);
        }}
        onError={(e) => {
          if (isNoSong) return;
          console.error('Audio error:', e.target.error);
          
          // Kiểm tra loại lỗi cụ thể để xử lý tốt hơn
          const errorType = e.target?.error?.name || 'unknown';
          
          // Xử lý lỗi phát hiện
          handlePlaybackError(errorType, e.target.error?.message);
        }}
        onStalled={() => {
          console.warn('Audio playback stalled');
          // Handle stalled playback
          if (isPlaying && currentSong && currentRoom?.id) {
            // Request a new stream URL after a short delay
            setTimeout(() => {
              socketService.requestSync(currentRoom.id);
            }, 2000);
          }
        }}
        onWaiting={() => {
          console.log('Audio is waiting for more data...');
        }}
      />
    </MusicContext.Provider>
  );
};

export const useMusic = () => {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error('useMusic must be used within a MusicProvider');
  }
  return context;
}

export default MusicContext;

// Add a new helper function to handle playback errors
const handlePlaybackError = (errorType, errorMessage) => {
  // Báo lỗi lên server với thông tin chi tiết
  if (currentRoom?.id && currentSong) {
    socketService.reportError({
      type: 'playbackError',
      songId: currentSong.id,
      error: errorType,
      message: errorMessage || 'Unknown audio error',
      roomId: currentRoom.id,
      source: audioRef.current?.src || 'No source'
    });
    
    // Yêu cầu URL mới nếu gặp lỗi liên quan đến nguồn
    if (errorType === 'NotSupportedError' || 
        errorType === 'NetworkError' || 
        errorType === 'MediaError') {
      toast.error('Playback error. Trying to recover...');
      
      // Chờ một chút trước khi yêu cầu đồng bộ lại
      setTimeout(() => {
        socketService.requestSync(currentRoom.id);
      }, 1000);
      
      // Thử tạo lại URL mới từ API
      fetch(`/.proxy/api/music/${currentSong.id}/stream`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(response => response.json())
      .then(data => {
        if (data.streamUrl) {
          // Cập nhật URL mới và thử lại
          const updatedSong = {...currentSong, streamUrl: data.streamUrl};
          setCurrentSong(updatedSong);
        }
      })
      .catch(err => {
        console.error('Failed to get new stream URL:', err);
      });
    }
  }
}
