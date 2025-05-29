import React, { useState, useCallback, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useMusic } from '../../context/MusicContext'
import { searchSong } from "../../services/api";
import { imageProxy } from "../../services/proxy";


const SearchModal = ({ isOpen, onClose }) => {
  const { token } = useAuth()
  const { addToQueue } = useMusic()
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [waitingAdded, setWaitingAdded] = useState(false)
  const searchTimeoutRef = useRef(null)
  
  const handleSearch = async () => {
    if (!query.trim() || !token) return
    
    setIsSearching(true)
    try {
      const data = await searchSong(query);
      setSearchResults(data.results || [])
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const debouncedSearch = useCallback((searchQuery) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      handleSearch(searchQuery)
    }, 500) // 500ms delay
  }, [])

  const handleQueryChange = (e) => {
    const newQuery = e.target.value
    setQuery(newQuery)
    debouncedSearch(newQuery)
  }
  
  const handleAddToQueue = async (song) => {
    setWaitingAdded(true)
    try {
        if (addToQueue && song) {
            await addToQueue(song)
        }
    } catch (error) {
        console.error('Error adding song to queue:', error)
    } finally {
        setWaitingAdded(false)
    }
  }
  
  if (!isOpen) return null
  
  // Default fallback image for invalid image URLs
  const FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24'%3E%3Cpath fill='%23777' d='M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'/%3E%3C/svg%3E";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="search-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Search for Music</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="search-form">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for songs, artists, or albums..."
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button 
              className="search-button"
              onClick={handleSearch}
              disabled={isSearching || !query.trim()}
            >
              {isSearching ? (
                <div className="search-spinner"></div>
              ) : (
                <>Search</>
              )}
            </button>
          </div>
          
          {searchResults.length > 0 ? (
            <div className="search-results">
              {searchResults.map((song) => (
                <div key={song.id} className="search-result-item">
                  <div className="song-info">
                    <img 
                      src={song.thumbnail ? imageProxy(song.thumbnail) : FALLBACK_IMAGE} 
                      alt={song.title ? (song.title.text || "Unknown Title") : "Unknown Title"} 
                      onError={(e) => {
                        e.target.src = FALLBACK_IMAGE;
                      }}
                    />
                    <div className="song-details">
                      <h4>{song.title?.text || song.title || "Unknown Title"}</h4>
                      <p>{song.artist || 'Unknown Artist'}</p>
                    </div>
                  </div>
                  <button 
                    className="add-button"
                    onClick={() => handleAddToQueue(song)}
                    disabled={waitingAdded}
                  >
                    {waitingAdded ? (
                      <div className="loading-spinner" style={{ width: '1em', height: '1em' }}></div>
                    ) : (
                      <><i className="bi bi-plus"></i> Add</>
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : query && !isSearching ? (
            <div className="no-results">
              <i className="bi bi-search"></i>
              <p>No results found for "{query}"</p>
              <p>Try different keywords or check your spelling</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default SearchModal
