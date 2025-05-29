import { useState, useEffect, useRef } from 'react'
import { useMusic } from '../../context/MusicContext'

const ProgressBar = () => {
  const { 
    currentSong, 
    isPlaying, 
    currentPosition, 
    seekTo 
  } = useMusic()
  
  const [displayPosition, setDisplayPosition] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const progressRef = useRef(null)
  const updateIntervalRef = useRef(null)
  const currentSongIdRef = useRef(null) // Add reference to track song changes
  
  // Update display position regularly when playing
  useEffect(() => {
    // Clear existing interval
    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
    }
    
    // Reset display position when song changes
    if (currentSong?.id !== currentSongIdRef.current) {
      currentSongIdRef.current = currentSong?.id;
      setDisplayPosition(currentPosition || 0);
    }
    
    // Only set a new interval if we're playing and not dragging
    if (isPlaying && !isDragging && currentSong) {
      // Start from current position
      setDisplayPosition(currentPosition || 0);
      
      // Update position every 100ms
      updateIntervalRef.current = setInterval(() => {
        setDisplayPosition(prev => {
          // Don't exceed song duration
          if (currentSong && prev >= currentSong.duration) {
            clearInterval(updateIntervalRef.current);
            return currentSong.duration;
          }
          return prev + 0.1; // Add 100ms
        });
      }, 100);
    } else if (!isPlaying || !currentSong) {
      // If not playing or no song, sync with the current position
      setDisplayPosition(currentPosition || 0);
    }
    
    // Cleanup
    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [isPlaying, currentSong, isDragging, currentPosition]);
  
  // Force sync position with actual currentPosition when it changes significantly
  useEffect(() => {
    // Only update if not dragging and the difference is significant (>1 second)
    if (!isDragging && Math.abs(displayPosition - currentPosition) > 1) {
      setDisplayPosition(currentPosition || 0);
    }
  }, [currentPosition, isDragging]);
  
  // Reset progress when song changes
  useEffect(() => {
    if (currentSong) {
      setDisplayPosition(currentPosition || 0);
    } else {
      setDisplayPosition(0);
    }
  }, [currentSong?.id]);
  
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }
  
  const handleSeek = (e) => {
    if (!currentSong) return
    
    const progressBar = progressRef.current
    const rect = progressBar.getBoundingClientRect()
    const x = e.clientX - rect.left
    const width = rect.width
    const percentage = Math.max(0, Math.min(1, x / width)) // Ensure between 0 and 1
    const position = percentage * currentSong.duration
    
    setDisplayPosition(position)
    seekTo(position)
  }
  
  const handleDrag = (e) => {
    if (!isDragging || !currentSong) return
    
    const progressBar = progressRef.current
    const rect = progressBar.getBoundingClientRect()
    const x = Math.max(rect.left, Math.min(e.clientX, rect.right)) // Keep within bounds
    const width = rect.width
    const percentage = (x - rect.left) / width
    const position = Math.floor(percentage * currentSong.duration)
    
    setDisplayPosition(position)
  }
  
  const handleDragStart = (e) => {
    setIsDragging(true)
    document.addEventListener('mousemove', handleDrag)
    document.addEventListener('mouseup', handleDragEnd)
  }
  
  const handleDragEnd = () => {
    if (isDragging && currentSong) {
      seekTo(displayPosition)
      setIsDragging(false)
      document.removeEventListener('mousemove', handleDrag)
      document.removeEventListener('mouseup', handleDragEnd)
    }
  }
  
  // Clean up event listeners when component unmounts
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleDrag)
      document.removeEventListener('mouseup', handleDragEnd)
    }
  }, [isDragging])
  
  return (
    <div className="progress-container">
      <div className="progress-controls">
        <span className="time-display">{formatTime(displayPosition)}</span>
        
        <div 
          className="progress-bar"
          ref={progressRef}
          onClick={handleSeek}
          onMouseDown={handleDragStart}
          onMouseUp={handleDragEnd}
          onMouseLeave={handleDragEnd}
        >
          <div 
            className="progress-fill" 
            style={{ 
              width: currentSong 
                ? `${(displayPosition / currentSong.duration) * 100}%` 
                : '0%' 
            }}
          ></div>
          <div 
            className="progress-handle"
            style={{ 
              left: currentSong 
                ? `${(displayPosition / currentSong.duration) * 100}%` 
                : '0%' 
            }}
          ></div>
        </div>
        
        <span className="time-display">
          {currentSong ? formatTime(currentSong.duration) : '0:00'}
        </span>
      </div>
    </div>
  )
}

export default ProgressBar
