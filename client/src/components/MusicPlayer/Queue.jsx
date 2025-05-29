import { useMusic } from '../../context/MusicContext'
import QueueItem from './QueueItem'

const Queue = () => {
  const { 
    queue, 
    currentSong, 
    playSong, 
    clearQueue 
  } = useMusic()
  
  return (
    <div className="queue-container">
      <div className="queue-header">
        <h3>Queue ({queue.length})</h3>
        <button 
          className="clear-queue-btn"
          onClick={clearQueue}
          disabled={!queue.length}
        >
          Clear Queue
        </button>
      </div>
      
      <div className="queue-list">
        {currentSong && (
          <div className="now-playing">
            <h4>Now Playing</h4>
            <QueueItem 
              song={currentSong} 
              isPlaying={true}
              isCurrent={true}
            />
          </div>
        )}
        
        <div className="upcoming-songs">
          <h4>Up Next</h4>
          {queue.length === 0 ? (
            <p className="empty-queue">Queue is empty</p>
          ) : (
            queue.map((song, index) => (
              <QueueItem 
                key={`${song.id}-${index}`}
                song={song}
                index={index}
                onPlay={() => playSong(song.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default Queue
