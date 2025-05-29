import { useState } from 'react'
import { useMusic } from '../../context/MusicContext'
import { byProxy } from '../../services/api'

const QueueItem = ({ song, index, isPlaying, isCurrent, onPlay }) => {
  const { participants } = useMusic()
  const [isReordering, setIsReordering] = useState(false)
  
  // Find the participant who added this song
  const addedBy = song.addedBy ? participants.find(p => p.id === song.addedBy) : null
  
  const handleDragStart = (e) => {
    e.dataTransfer.setData('songIndex', index)
    setIsReordering(true)
  }
  
  const handleDragOver = (e) => {
    e.preventDefault()
  }
  
  const handleDrop = (e) => {
    e.preventDefault()
    setIsReordering(false)
    
    const draggedIndex = parseInt(e.dataTransfer.getData('songIndex'))
    // In a real implementation, you'd call a function to reorder queue
    // reorderQueue(draggedIndex, index)
  }
  
  const handleDragEnd = () => {
    setIsReordering(false)
  }

  // Default fallback image
  const fallbackImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24'%3E%3Cpath fill='%23777' d='M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'/%3E%3C/svg%3E";
  
  // Get safe title
  const title = song.title?.text || song.title || "Unknown Title";
  const artist = song.artist || "Unknown Artist";
  
  return (
    <div 
      className={`queue-item ${isPlaying ? 'playing' : ''} ${isReordering ? 'reordering' : ''}`}
      draggable={!isCurrent}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
    >
      <div className="song-thumbnail">
        <img 
          src={song.thumbnail ? byProxy(song.thumbnail) : fallbackImage} 
          alt={title}
          onError={(e) => {
            e.target.src = fallbackImage;
          }}
        />
        {isPlaying && (
          <div className="playing-indicator">
            <div className="playing-bar"></div>
            <div className="playing-bar"></div>
            <div className="playing-bar"></div>
          </div>
        )}
      </div>
      
      <div className="song-info">
        <h4>{title}</h4>
        <p>{artist}</p>
        {addedBy && (
          <span className="added-by">Added by: {addedBy.name}</span>
        )}
      </div>
      
      <div className="song-actions">
        <div className="song-duration">{formatDuration(song.duration || 0)}</div>
        
        {!isCurrent && (
          <button className="play-now-btn" onClick={onPlay}>
            <i className="bi bi-play-fill"></i>
          </button>
        )}
      </div>
    </div>
  )
}

const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

export default QueueItem
