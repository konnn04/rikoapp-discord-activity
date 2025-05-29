import { useState } from 'react'
import { useMusic } from '../../context/MusicContext'
import QueueItem from './QueueItem'

const QueueManager = ({ onOpenSearch }) => {
  const { queue, clearQueue, removeFromQueue, reorderQueue } = useMusic()
  
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
            disabled={!queue.length}
          >
            <i className="bi bi-trash"></i>
            Clear All
          </button>
        </div>
      </div>
      
      <div className="queue-list">
        {queue.length === 0 ? (
          <div className="empty-queue">
            <i className="bi bi-music-note-list"></i>
            <p>Queue is empty</p>
            <p>Add songs to start listening</p>
          </div>
        ) : (
          queue.map((song, index) => (
            <div
              key={`${song.id}-${index}`}
              className="queue-item-wrapper"
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
            >
              <QueueItem 
                song={song}
                index={index}
                onPlay={() => playSong(song.id)}
                onRemove={() => removeFromQueue && removeFromQueue(index)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default QueueManager
