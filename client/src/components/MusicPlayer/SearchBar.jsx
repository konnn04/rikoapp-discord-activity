import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useMusic } from '../../context/MusicContext'
import { proxy } from '../../services/proxy'

const SearchBar = () => {
  const { token, channelId } = useAuth()
  const { addToQueue } = useMusic()
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  
  const handleSearch = async () => {
    if (!query.trim() || !token) return;
    
    setIsSearching(true);
    try {
      const response = await fetch(`/api/music/search?q=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) throw new Error('Search failed');
      
      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }
  
  const handleAddToQueue = (song) => {
    if (addToQueue && song) {
      addToQueue(song);
    }
  }
  
  return (
    <div className="search-container">
      <div className="search-form">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for songs..."
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button 
          className="search-button"
          onClick={handleSearch}
          disabled={isSearching}
        >
          {isSearching ? 
            <span className="search-spinner"></span> : 
            <i className="bi bi-search"></i>
          }
        </button>
      </div>
      
      {searchResults.length > 0 && (
        <div className="search-results">
          {searchResults.filter(e => e.id).map((song) => (
            <div key={song.id} className="search-result-item">
              <div className="song-info">
                <img src={proxy(song.thumbnail)} alt={song?.title?.text || song.title} />
                <div>
                  <h4>{song?.title?.text || song.title}</h4>
                  <p>{song?.artist || 'Unknown Artist'}</p>
                </div>
              </div>
              <button onClick={() => handleAddToQueue(song)}>
                <i className="bi bi-plus"></i> Add
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SearchBar
