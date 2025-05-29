import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { toast } from 'react-toastify';
import { joinRoom } from '../services/api';
import socketService from '../services/socket';
import socketManager from '../services/socketManager';
import MusicContext from './MusicContext';
import trackPlayerService from '../services/trackPlayerService';
import queueService from '../services/queueService';
import syncService from '../services/syncService';
import lyricsService from '../services/lyricsService';

export const MusicContextProvider = ({ children }) => {
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [lyrics, setLyrics] = useState(null);
  const audioRef = useRef(null);

  // CurrentSongId ref để theo dõi bài hát hiện tại
  const currentSongIdRef = useRef(null);
  const resumePositionRef = useRef(null);

  // Đồng bộ từ server - Define this early to avoid reference errors
  const syncFromServer = useCallback(() => {
    if (!currentRoom?.id) return;
    
    setIsSyncing(true);
    
    syncService.onSyncComplete(() => {
      setTimeout(() => setIsSyncing(false), 300);
    });
    
    syncService.requestSync();
  }, [currentRoom?.id]);

  // Hàm thiết lập phòng từ dữ liệu nhận được
  const setStatRoom = useCallback((room) => {
    console.log('Setting current room:', room);
    setCurrentRoom(room);
    setParticipants(room.participants || []);
    setQueue(room.queue || []);
    
    // Cập nhật queue service
    queueService.updateQueue(room.queue || []);
    
    // Cập nhật thông tin đồng bộ
    if (room.serverTime) {
      syncService.updateSyncInfo(room.serverTime);
    }
    
    // Lưu vị trí phát nếu thay đổi bài hát
    if (room.currentSong && room.currentSong.id !== currentSongIdRef.current) {
      resumePositionRef.current = room.currentPosition || 0;
      currentSongIdRef.current = room.currentSong.id;
    }
    
    setCurrentSong(room.currentSong || null);
    setIsPlaying(room.isPlaying || false);
    setCurrentPosition(room.currentPosition || 0);
  }, []);

  // Cập nhật phòng khi có thay đổi
  useEffect(() => {
    if (currentRoom) {
      setStatRoom(currentRoom);
    }
  }, [currentRoom, setStatRoom]);

  // Khởi tạo trackPlayerService khi audioRef sẵn sàng
  useEffect(() => {
    if (audioRef.current) {
      const cleanup = trackPlayerService.initialize(audioRef.current, currentRoom?.id);
      
      // Đăng ký callbacks
      trackPlayerService.onProgress((position) => setCurrentPosition(position));
      trackPlayerService.onPlay(() => setIsPlaying(true));
      trackPlayerService.onPause(() => setIsPlaying(false));
      trackPlayerService.onEnded(() => {
        setIsPlaying(false);
        setCurrentPosition(0);
        
        if (currentRoom?.id && currentSong) {
          socketService.reportEvent({
            type: 'trackEnded',
            songId: currentSong.id,
            roomId: currentRoom.id
          });
          
          // Yêu cầu đồng bộ để nhận bài kế tiếp
          syncService.requestSync();
        }
      });
      
      return cleanup;
    }
  }, [audioRef, currentRoom?.id, currentSong]);

  // Khởi tạo các services
  useEffect(() => {
    if (currentRoom?.id) {
      queueService.initialize(currentRoom.id);
      syncService.initialize(currentRoom.id);
    }
  }, [currentRoom?.id]);

  // Khi bài hát hiện tại thay đổi, cập nhật trình phát nhạc
  useEffect(() => {
    if (!currentSong) {
      setIsNoSong(true);
      setLyrics(null); // Clear lyrics when no song is playing
      return;
    }
    
    setIsNoSong(false);
    
    // Lấy vị trí phát
    const resumePosition = resumePositionRef.current !== null
      ? resumePositionRef.current
      : currentPosition;

    // Đánh dấu đang đồng bộ
    setIsSyncing(true);
    
    // Cập nhật trình phát với bài hát mới
    trackPlayerService.loadTrack(currentSong, isPlaying, resumePosition);
    
    // Xóa vị trí phát đã sử dụng
    resumePositionRef.current = null;
    
    // Xóa trạng thái đồng bộ sau khi hoàn tất
    setTimeout(() => {
      setIsSyncing(false);
    }, 500);
    
    // Khi bài hát thay đổi, đánh dấu lyrics đã bị reset
    // Nhưng không tự động tải lyrics - các component sẽ tải khi cần
    setLyrics(null);
    
  }, [currentSong, isPlaying]);

  // Xử lý thay đổi volume
  useEffect(() => {
    trackPlayerService.setVolume(volume);
  }, [volume]);

  // Thiết lập socket listeners khi kết nối
  useEffect(() => {
    if (isConnected) {
      // Kết nối socket
      if (!socketService.isSocketConnected() && token) {
        socketService.connect(token)
          .catch(error => {
            console.error('Socket connection error:', error);
            toast.error('Không thể kết nối đến cập nhật thời gian thực');
          });
      }

      // Khởi tạo socket manager
      socketManager.initialize();

      // Thiết lập handlers cho sự kiện socket
      socketManager.setQueueUpdateHandler((data) => {
        console.log('Cập nhật hàng đợi từ socket:', data);
        if (data.queue) {
          setQueue(data.queue);
          queueService.updateQueue(data.queue);
        }
      });

      // Xử lý đồng bộ playback
      socketManager.setPlaybackSyncHandler((data) => {
        console.log('Đồng bộ playback từ socket:', data);
        const { 
          currentSong, 
          isPlaying, 
          currentPosition, 
          streamUrl, 
          startTimestamp, 
          serverTime, 
          action,
          queue: newQueue 
        } = data;
        
        // Cập nhật queue nếu được cung cấp
        if (newQueue) {
          setQueue(newQueue);
          queueService.updateQueue(newQueue);
        }
        
        // Cập nhật thông tin đồng bộ
        if (serverTime) {
          syncService.updateSyncInfo(serverTime);
        }
        
        // Xử lý trường hợp không có bài hát
        if (!currentSong) {
          setCurrentSong(null);
          setIsPlaying(false);
          setCurrentPosition(0);
          currentSongIdRef.current = null;
          return;
        }
        
        // Kiểm tra xem có cần cập nhật bài hát không
        const songChanged = !currentSongIdRef.current || currentSong.id !== currentSongIdRef.current;
        
        if (songChanged) {
          // Lưu vị trí để khôi phục sau khi thay đổi bài hát
          resumePositionRef.current = currentPosition || 0;
          currentSongIdRef.current = currentSong.id;
          
          // Tạo đối tượng bài hát cập nhật với URL hợp lệ
          const updatedSong = {
            ...currentSong,
            streamUrl: streamUrl || currentSong.streamUrl
          };
          
          console.log('Thiết lập bài hát mới với URL stream:', updatedSong);
          
          setIsPlaying(isPlaying);
          setCurrentSong(updatedSong);
        } else {
          // Đánh dấu đang đồng bộ
          setIsSyncing(true);
          
          // Xử lý action pause
          if (action === 'pause') {
            setIsPlaying(false);
            setCurrentPosition(currentPosition);
            trackPlayerService.pause();
            trackPlayerService.seekTo(currentPosition);
          } 
          // Xử lý action play
          else if (action === 'play') {
            trackPlayerService.seekTo(currentPosition);
            setCurrentPosition(currentPosition);
            setIsPlaying(true);
            trackPlayerService.play();
          }
          // Xử lý cập nhật vị trí thông thường
          else if (Math.abs(currentPosition - trackPlayerService.currentPosition) > 1) {
            trackPlayerService.seekTo(currentPosition);
            setCurrentPosition(currentPosition);
          }
          
          // Kết thúc đồng bộ sau 300ms
          setTimeout(() => setIsSyncing(false), 300);
        }
      });
      
      // Xử lý đồng bộ người tham gia
      socketManager.setParticipantsUpdateHandler((data) => {
        console.log('Cập nhật người tham gia từ socket:', data);
        
        if (Array.isArray(data)) {
          // Trường hợp nhận trực tiếp mảng participants
          setParticipants(data);
        } else if (data && Array.isArray(data.participants)) {
          // Trường hợp nhận object có thuộc tính participants
          setParticipants(data.participants);
        } else if (data) {
          // Các trường hợp khác, yêu cầu cập nhật
          if (currentRoom?.id) {
            console.log('Yêu cầu đồng bộ danh sách người tham gia');
            fetch(`/.proxy/api/rooms/${currentRoom.id}/participants`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            })
            .then(response => response.json())
            .then(participantsData => {
              if (Array.isArray(participantsData)) {
                setParticipants(participantsData);
              }
            })
            .catch(error => {
              console.error('Lỗi khi lấy danh sách người tham gia:', error);
            });
          }
        }
      });
      
      socketManager.setTrackChangeHandler((data) => {
        console.log('Thay đổi bài hát:', data);
        
        if (data.skipped) {
          toast.info('Bài hát đã bị bỏ qua bởi biểu quyết');
        } else if (data.automatic) {
          toast.info('Đang phát bài tiếp theo');
        } else if (data.newSongId) {
          toast.info('Đang phát một bài hát mới');
        }
      });
      
      socketManager.setPlaybackEndedHandler((data) => {
        console.log('Kết thúc phát nhạc:', data);
        if (!data.nextSong) {
          toast.info('Hàng đợi đã kết thúc');
          setCurrentSong(null);
        }
      });
      
      socketManager.setRoomJoinedHandler((data) => {
        if (data) {
          setStatRoom(data);
        }
      });
      
      socketManager.setSkipVoteUpdateHandler((data) => {
        // Có thể hiển thị số phiếu bỏ qua
      });
      
      socketManager.setQueueProcessingHandler((data) => {
        if (data.status === 'success') {
          toast.success(`Đã thêm thành công bài hát vào hàng đợi`);
        } else if (data.status === 'error') {
          toast.error(data.message || 'Lỗi khi thêm bài hát vào hàng đợi');
        }
      });
      
      return () => {
        socketManager.cleanup();
      };
    }
  }, [isConnected, token, setStatRoom, currentRoom?.id]);

  // Xử lý tham gia phòng
  const joinRoomHandle = useCallback(async () => {
    if (!isAuthenticated) {
      toast.error('Bạn phải đăng nhập để tham gia phòng.');
      return;
    }

    if (isJoiningRoom) {
      return; // Tránh gọi trùng lặp
    }

    setIsJoiningRoom(true);
    try {
      const room = await joinRoom(channelId, user);
      setCurrentRoom(room?.room);
      setIsConnected(true);
      setIsJoiningRoom(false);
      
      // Khởi tạo services
      queueService.initialize(room?.room?.id);
      syncService.initialize(room?.room?.id);
      
      toast.success(`Đã tham gia phòng: ${room?.room?.id || 'Phòng không xác định'}`);
    } catch (error) {
      console.error('Lỗi khi tham gia phòng:', error);
      toast.error('Không thể tham gia phòng. Vui lòng thử lại.');
      setIsJoiningRoom(false);
    }
  }, [isAuthenticated, isJoiningRoom, channelId, user]);

  // Chuyển đổi phát/tạm dừng
  const togglePlayback = useCallback(() => {
    if (!currentSong) return;
    
    const newPlayingState = !isPlaying;
    console.log(`Chuyển đổi playback sang ${newPlayingState ? 'phát' : 'tạm dừng'}`);
    
    // Cập nhật trạng thái ngay lập tức cho UI phản hồi nhanh
    setIsPlaying(newPlayingState);
    
    // Cập nhật trình phát
    if (newPlayingState) {
      trackPlayerService.play();
    } else {
      trackPlayerService.pause();
    }
    
    // Thông báo cho server về thay đổi
    if (currentRoom?.id) {
      fetch(`/.proxy/api/playback/${currentRoom.id}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      .catch(error => {
        console.error('Lỗi khi chuyển đổi playback trên server:', error);
      });
    }
  }, [currentSong, isPlaying, currentRoom?.id, token]);

  // Chuyển đến bài tiếp theo
  const playNext = useCallback(() => {
    // Thông báo server chuyển bài (kể cả khi queue trống, để xóa bài hiện tại)
    if (currentRoom?.id) {
      setIsSyncing(true); // Đánh dấu đang đồng bộ ngay từ đầu
      
      fetch(`/.proxy/api/playback/${currentRoom.id}/next`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      .then(response => {
        if (!response.ok) {
          throw new Error('Không thể chuyển bài');
        }
        return response.json();
      })
      .then(data => {
        console.log('Kết quả chuyển bài:', data);
        
        // Nếu không có bài hát hiện tại sau khi chuyển bài, cập nhật trạng thái local
        if (!data.currentSong) {
          setCurrentSong(null);
          setIsPlaying(false);
          setCurrentPosition(0);
        }
        
        // Server sẽ gửi lại thông tin cập nhật qua socket nên không cần cập nhật thêm
      })
      .catch(error => {
        console.error('Lỗi khi chuyển bài tiếp theo:', error);
        toast.error('Không thể chuyển bài');
      })
      .finally(() => {
        setTimeout(() => setIsSyncing(false), 500);
      });
    }
  }, [currentRoom?.id, token]);

  // Di chuyển đến vị trí cụ thể
  const seekTo = useCallback((position) => {
    if (!currentRoom?.id || !currentSong) return;
    
    try {
      // Tạm dừng phát nhạc để seek chính xác hơn
      const wasPlaying = isPlaying;
      if (wasPlaying) {
        trackPlayerService.pause();
      }
      
      // Cập nhật vị trí
      setCurrentPosition(position);
      trackPlayerService.seekTo(position);
      
      // Thông báo server về vị trí mới
      fetch(`/.proxy/api/playback/${currentRoom.id}/seek`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ position })
      })
      .then(() => {
        // Tiếp tục phát nếu đang phát trước đó
        if (wasPlaying) {
          trackPlayerService.play();
        }
      })
      .catch(error => {
        console.error('Lỗi khi đồng bộ vị trí đến server:', error);
        // Vẫn tiếp tục phát nếu đang phát trước đó
        if (wasPlaying) {
          trackPlayerService.play();
        }
      });
    } catch (error) {
      console.error('Lỗi khi di chuyển đến vị trí:', error);
    }
  }, [currentRoom?.id, currentSong, isPlaying, token]);

  // Thêm bài hát vào hàng đợi
  const addToQueue = useCallback(async (song) => {
    return queueService.addToQueue(song);
  }, []);

  // Xóa hàng đợi
  const clearQueue = useCallback(() => {
    return queueService.clearQueue();
  }, []);

  // Chức năng bỏ phiếu bỏ qua bài hiện tại
  const voteToSkip = useCallback(async () => {
    if (!currentRoom?.id || !currentSong) {
      toast.error('Không có bài hát đang phát');
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
        throw new Error(error.message || 'Không thể bỏ qua bài hát');
      }
      
      const result = await response.json();
      
      if (result.skipped) {
        toast.success('Đã bỏ qua bài hát');
      } else if (result.success) {
        toast.info(`Đã thêm phiếu bỏ qua: ${result.currentVotes}/${result.votesNeeded}`);
      } else {
        toast.warning(result.message);
      }
      
      return result;
    } catch (error) {
      console.error('Lỗi khi bỏ qua bài hát:', error);
      toast.error(error.message);
      return null;
    }
  }, [currentRoom?.id, currentSong, token]);

  // Sắp xếp lại hàng đợi
  const reorderQueue = useCallback(async (fromIndex, toIndex) => {
    return queueService.reorderQueue(fromIndex, toIndex);
  }, []);

  // Xóa bài hát khỏi hàng đợi
  const removeFromQueue = useCallback(async (index) => {
    if (!currentRoom?.id || index < 0 || index >= queue.length) {
      return false;
    }

    try {
      const songId = queue[index].id;
      
      // Hiển thị giao diện đang xử lý
      setIsSyncing(true);
      
      const response = await fetch(`/.proxy/api/queue/${currentRoom.id}/${songId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Không thể xóa bài hát khỏi hàng đợi');
      }

      // Cập nhật cục bộ để giao diện phản hồi ngay
      setQueue(currentQueue => currentQueue.filter((_, i) => i !== index));
      
      // Server sẽ gửi lại hàng đợi cập nhật qua socket
      return true;
    } catch (error) {
      console.error('Lỗi khi xóa khỏi hàng đợi:', error);
      toast.error('Không thể xóa bài hát khỏi hàng đợi');
      return false;
    } finally {
      // Tắt trạng thái đồng bộ sau khi hoàn thành
      setTimeout(() => setIsSyncing(false), 300);
    }
  }, [currentRoom?.id, queue, token]);

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
        togglePlayback,
        playNext,
        seekTo,
        addToQueue,
        clearQueue,
        voteToSkip,
        reorderQueue,
        syncFromServer,
        isSyncing,
        removeFromQueue,
        lyrics,
      }}
    >
      {children}
      <audio
        ref={audioRef} 
        style={{ display: 'none' }} 
        preload="auto"
        crossOrigin="anonymous"
      />
    </MusicContext.Provider>
  );
};

export default MusicContextProvider;
