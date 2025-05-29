import { useState, useEffect, useCallback } from 'react'
import { useMusic } from '../../context/MusicContext'
import QueueItem from './QueueItem'

const QueueManager = ({ onOpenSearch }) => {
  const { queue, currentSong, clearQueue, reorderQueue, removeFromQueue } = useMusic()
  const [lastQueueUpdate, setLastQueueUpdate] = useState(Date.now())
  
  // Theo dõi thay đổi của queue để làm mới UI
  useEffect(() => {
    setLastQueueUpdate(Date.now())
  }, [queue])
  
  const handleDragStart = (e, index) => {
    e.dataTransfer.setData('songIndex', index)
  }
  
  const handleDragOver = (e) => {
    e.preventDefault()
  }
  
  const handleDrop = (e, dropIndex) => {
    e.preventDefault()
    const dragIndex = parseInt(e.dataTransfer.getData('songIndex'))
    if (dragIndex !== dropIndex && reorderQueue) {
      reorderQueue(dragIndex, dropIndex)
    }
  }
  
  const handleRemoveItem = useCallback((index) => {
    if (removeFromQueue) {
      removeFromQueue(index);
    }
  }, [removeFromQueue]);
  
  return (
    <div className="queue-manager">
      <div className="queue-header">
        <h3>Queue ({queue.length})</h3>
        <div className="queue-controls">
          <button 
            className="add-songs-btn"
            onClick={onOpenSearch}
          >
            <i className="bi bi-plus-circle"></i>
            Add Songs
          </button>
          <button 
            className="clear-queue-btn"
            onClick={clearQueue}
            disabled={!queue.length && !currentSong}
          >
            <i className="bi bi-trash"></i>
            Clear All
          </button>
        </div>
      </div>
      
      <div className="queue-list" key={`queue-list-${lastQueueUpdate}`}>
        {queue.length === 0 ? (
          <div className="empty-queue">
            <i className="bi bi-music-note-list"></i>
            <p>Queue is empty</p>
            <p>Add songs to start listening</p>
          </div>
        ) : (
          queue.map((song, index) => (
            <div
              key={`${song.id}-${index}-${lastQueueUpdate}`}
              className="queue-item-wrapper"
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
            >
              <QueueItem 
                song={song}
                index={index}
                onPlay={() => reorderQueue && reorderQueue(index, 0)} // Move to next to play
                onRemove={() => handleRemoveItem(index)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default QueueManager
