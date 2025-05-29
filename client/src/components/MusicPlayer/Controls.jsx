import { useMusic } from '../../context/MusicContext'
import { useState, useEffect } from 'react'

const Controls = () => {
  const { 
    currentSong,
    isPlaying,
    togglePlayback,
    playNext,
    audioRef,
    queue,
    syncFromServer,
    isSyncing
  } = useMusic()
  
  const [hasPlaybackIssue, setHasPlaybackIssue] = useState(false)
  const [lastErrorTime, setLastErrorTime] = useState(0)
  
  // Monitor audio element for issues
  useEffect(() => {
    if (!audioRef.current) return
    
    const checkPlaybackStatus = () => {
      const now = Date.now()
      const audio = audioRef.current
      
      // If audio should be playing but is actually paused or has other issues
      if (currentSong && isPlaying && 
         (audio.paused || audio.error || (audio.readyState < 3 && now - lastErrorTime > 5000))) {
        setHasPlaybackIssue(true)
      } else {
        setHasPlaybackIssue(false)
      }
    }
    
    // Check playback status periodically
    const interval = setInterval(checkPlaybackStatus, 3000)
    
    // Clear interval on cleanup
    return () => clearInterval(interval)
  }, [currentSong, isPlaying, lastErrorTime, audioRef])
  
  // Function to force playback when needed
  const forcePlay = () => {
    if (audioRef.current && currentSong) {
      setLastErrorTime(Date.now())
      
      // Set volume and start playback
      audioRef.current.volume = audioRef.current.volume || 0.5
      
      // Force load if needed
      if (audioRef.current.readyState === 0) {
        audioRef.current.load()
      }
      
      // Try to play with error handling
      audioRef.current.play()
        .then(() => {
          console.log('Forced playback started')
          setHasPlaybackIssue(false)
        })
        .catch(err => {
          console.error('Force play failed:', err)
          // If we still can't play, try a full sync
          syncFromServer()
        })
    }
  }
  
  // Check if there are next songs available or if there's a current song to clear
  // Nút Next có thể dùng để: 
  // 1. Chuyển sang bài kế tiếp trong hàng đợi
  // 2. Hoặc xóa bài hiện tại nếu không có bài nào trong hàng đợi
  const canSkipOrClear = queue.length > 0 || currentSong;
  
  return (
    <div className="playback-controls">
      {/* Removed previous button as per requirements */}
      
      <button 
        className="control-button play-button"
        onClick={togglePlayback}
        disabled={!currentSong}
      >
        {isPlaying ? (
          <svg viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"></path>
          </svg>
        )}
      </button>
      
      <button
        className="control-button next-button"
        onClick={playNext}
        disabled={!canSkipOrClear}
        title={queue.length > 0 ? "Play next song" : (currentSong ? "Clear current song" : "No songs available")}
      >
        <svg viewBox="0 0 24 24">
          <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"></path>
        </svg>
      </button>

      {/* Force play button shows only when there are issues */}
      {currentSong && hasPlaybackIssue && (
        <button
          className="control-button force-play-button"
          onClick={forcePlay}
          title="Fix playback (if sound isn't working)"
          style={{ color: '#f59e0b' }}
        >
          <svg viewBox="0 0 24 24" fill="#f59e0b">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1.5-5h2v2h-2zm0-8h2v6h-2z"></path>
          </svg>
        </button>
      )}

      {/* Sync button - shows animation when syncing */}
      <button
        className={`control-button sync-button ${isSyncing ? 'syncing' : ''}`}
        onClick={syncFromServer}
        disabled={isSyncing}
        title="Sync with server"
      >
        <svg viewBox="0 0 24 24">
          <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"></path>
        </svg>
      </button>
    </div>
  )
}

export default Controls
