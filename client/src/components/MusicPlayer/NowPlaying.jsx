import { useState } from 'react'
import { useMusic } from '../../context/MusicContext'
import Lyrics from './Lyrics'
import { imageProxy } from '../../services/proxy'

const NowPlaying = () => {
  const { currentSong, currentPosition } = useMusic()
  const [activeTab, setActiveTab] = useState('thumbnail')
  const [imageError, setImageError] = useState(false)
  
  // Default fallback image
  const fallbackImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 24 24'%3E%3Cpath fill='%23777' d='M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'/%3E%3C/svg%3E";
  
  // Get safe title and thumbnail
  const safeTitle = currentSong?.title?.text || currentSong?.title || "Unknown Title";
  const safeThumbnail = imageError ? fallbackImage : 
                       (currentSong?.thumbnail ? imageProxy(currentSong.thumbnail) : fallbackImage);
  
  if (!currentSong) {
    return (
      <div className="now-playing-container">
        <div className="no-song-playing">
          <div className="no-song-placeholder">
            <i className="bi bi-music-note-beamed"></i>
            <h3>No song playing</h3>
            <p>Search and add songs to get started</p>
          </div>
        </div>
      </div>
    )
  }
  
  return (
    <div className="now-playing-container">
      <div className="now-playing-header">
        <h3>Now Playing</h3>
        <div className="now-playing-tabs">
          <button 
            className={`tab-button ${activeTab === 'thumbnail' ? 'active' : ''}`}
            onClick={() => setActiveTab('thumbnail')}
          >
            <i className="bi bi-image"></i>
            Thumbnail
          </button>
          <button 
            className={`tab-button ${activeTab === 'lyrics' ? 'active' : ''}`}
            onClick={() => setActiveTab('lyrics')}
          >
            <i className="bi bi-chat-quote"></i>
            Lyrics
          </button>
        </div>
      </div>
      
      <div className="now-playing-content">
        {activeTab === 'thumbnail' ? (
          <div className="thumbnail-view">
            <img 
              src={safeThumbnail}
              alt={safeTitle}
              className="song-thumbnail-large"
              onError={() => setImageError(true)}
            />
            <div className="song-details">
              <h2>{safeTitle}</h2>
              <p>{currentSong.artist || "Unknown Artist"}</p>
              <div className="song-meta">
                <span>Duration: {formatDuration(currentSong.duration || 0)}</span>
                {currentSong.addedBy && (
                  <span>Added by: {currentSong.addedBy}</span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="lyrics-view">
            <Lyrics 
              currentSong={currentSong}
              currentPosition={currentPosition}
            />
          </div>
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

export default NowPlaying
