import { useEffect, useState, useRef } from 'react'
import lyricsService from '../../services/lyricsService'

const Lyrics = ({ currentSong, currentPosition, lyrics: providedLyrics, isVisible = true }) => {
  const [lyrics, setLyrics] = useState(null)
  const [activeLyricIndex, setActiveLyricIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const lyricsContainerRef = useRef(null)
  const lastSongIdRef = useRef(null)
  
  // Use provided lyrics if available, otherwise fetch lyrics
  useEffect(() => {
    if (providedLyrics) {
      setLyrics(providedLyrics);
      setLoading(false);
      setError(null);
      lastSongIdRef.current = currentSong?.id;
      return;
    }
    
    if (!currentSong || !isVisible || currentSong.id === lastSongIdRef.current) return;
    
    async function fetchLyrics() {
      setLoading(true)
      setError(null)
      
      try {
        const fetchedLyrics = await lyricsService.getLyrics(currentSong);
        if (fetchedLyrics) {
          // Process lyrics if needed
          if (!fetchedLyrics.lines && fetchedLyrics.plainLyrics) {
            // Convert plain text lyrics to lines format
            fetchedLyrics.lines = fetchedLyrics.plainLyrics
              .split('\n')
              .map((text, index) => ({ 
                time: index * 5000, // Add estimated timestamps (5 sec per line)
                text: text.trim() || " " 
              }));
          }
          
          // Ensure we always have lines array even if empty
          if (!fetchedLyrics.lines) {
            fetchedLyrics.lines = [];
          }
          
          setLyrics(fetchedLyrics);
          console.log('Lyrics found', fetchedLyrics);
        } else {
          setError('No lyrics found');
        }
      } catch (err) {
        console.error('Error loading lyrics:', err);
        setError('Error loading lyrics');
      } finally {
        setLoading(false);
        lastSongIdRef.current = currentSong?.id;
      }
    }
    
    fetchLyrics();
  }, [currentSong, isVisible, providedLyrics])
  
  // Update active lyric based on current playback position
  useEffect(() => {
    if (!lyrics || !lyrics.lines || lyrics.lines.length === 0) return;
    
    // Convert current position to milliseconds for comparison with lyrics timestamps
    const currentTimeMs = currentPosition * 1000;
    let newActiveIndex = 0;
    
    // Find the last line that starts before current position
    for (let i = 0; i < lyrics.lines.length; i++) {
      if (lyrics.lines[i].time <= currentTimeMs) {
        newActiveIndex = i;
      } else {
        break;
      }
    }
    
    if (newActiveIndex !== activeLyricIndex) {
      setActiveLyricIndex(newActiveIndex);
      
      // Scroll active lyric into view with smooth scrolling
      const container = lyricsContainerRef.current;
      if (container) {
        const activeElement = container.querySelector(`.lyric-line-${newActiveIndex}`);
        if (activeElement) {
          // Use smoother scrolling with a slight delay to ensure UI updates
          setTimeout(() => {
            activeElement.scrollIntoView({
              behavior: 'smooth',
              block: 'center'
            });
          }, 100);
        }
      }
    }
  }, [currentPosition, lyrics, activeLyricIndex])
  
  if (loading) {
    return (
      <div className="lyrics-container loading">
        <div className="lyrics-spinner"></div>
        <p>Searching for lyrics...</p>
      </div>
    );
  }
  
  if (error || !lyrics) {
    return (
      <div className="lyrics-container error">
        <p className="no-lyrics">
          <i className="bi bi-music-note-list"></i>
          {error || 'No lyrics found'}
        </p>
        <p className="suggestion">
          Try searching: "{currentSong?.title?.text || currentSong?.title || 'Unknown'}"
        </p>
        
        {/* <button 
          className="youtube-button lyrics-youtube-btn" 
          onClick={() => {
            const url = lyricsService.getYouTubeSearchUrl(currentSong);
            if (url) window.open(url, '_blank');
          }}
        >
          <i className="bi bi-youtube"></i> Find on YouTube
        </button> */}
      </div>
    );
  }
  
  // Safeguard against missing lines
  const hasLines = lyrics && Array.isArray(lyrics.lines) && lyrics.lines.length > 0;
  
  return (
    <div className="lyrics-container" ref={lyricsContainerRef}>
      <div className="lyrics-header">
        <h4>{lyrics.title}</h4>
        <p>{lyrics.artist}</p>
        {lyrics.album && <p className="lyrics-album">{lyrics.album}</p>}
      </div>
      <div className="lyrics-content">
        {hasLines ? (
          lyrics.lines.map((line, index) => (
            <div 
              key={index} 
              className={`lyric-line lyric-line-${index} ${index === activeLyricIndex ? 'active' : ''}`}
            >
              {line.text || " "}
            </div>
          ))
        ) : (
          <div className="lyric-line">
            {lyrics.plainLyrics || "Lyrics format not supported"}
          </div>
        )}
      </div>
    </div>
  );
}

export default Lyrics
