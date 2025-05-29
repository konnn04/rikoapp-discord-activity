import { useEffect, useState, useRef } from 'react'
import lyricsService from '../../services/lyricsService'

const Lyrics = ({ currentSong, currentPosition, isVisible = true }) => {
  const [lyrics, setLyrics] = useState(null)
  const [activeLyricIndex, setActiveLyricIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const lyricsContainerRef = useRef(null)
  const lastSongIdRef = useRef(null)
  
  // Fetch lyrics when song changes AND component is visible
  useEffect(() => {
    if (!currentSong || !isVisible || currentSong.id === lastSongIdRef.current) return;
    
    async function fetchLyrics() {
      setLoading(true)
      setError(null)
      
      try {
        const fetchedLyrics = await lyricsService.getLyrics(currentSong);
        if (fetchedLyrics) {
          setLyrics(fetchedLyrics);
          console.log('Đã tìm thấy lời bài hát', fetchedLyrics);
        } else {
          setError('Không tìm thấy lời bài hát');
        }
      } catch (err) {
        console.error('Lỗi khi tải lời bài hát:', err);
        setError('Lỗi khi tải lời bài hát');
      } finally {
        setLoading(false);
        lastSongIdRef.current = currentSong.id;
      }
    }
    
    fetchLyrics();
  }, [currentSong, isVisible])
  
  // Update active lyric based on current playback position
  useEffect(() => {
    if (!lyrics || !lyrics.lines || lyrics.lines.length === 0) return;
    
    let activeIndex = 0;
    
    // Find the last line that starts before current position
    for (let i = 0; i < lyrics.lines.length; i++) {
      if (lyrics.lines[i].time <= currentPosition) {
        activeIndex = i;
      } else {
        break;
      }
    }
    
    if (activeIndex !== activeLyricIndex) {
      setActiveLyricIndex(activeIndex);
      
      // Scroll active lyric into view with smooth scrolling
      const container = lyricsContainerRef.current;
      if (container) {
        const activeElement = container.querySelector(`.lyric-line-${activeIndex}`);
        if (activeElement) {
          activeElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }
      }
    }
  }, [currentPosition, lyrics, activeLyricIndex])
  
  if (loading) {
    return (
      <div className="lyrics-container loading">
        <div className="lyrics-spinner"></div>
        <p>Đang tìm lời bài hát...</p>
      </div>
    );
  }
  
  if (error || !lyrics) {
    return (
      <div className="lyrics-container error">
        <p className="no-lyrics">
          <i className="bi bi-music-note-list"></i>
          {error || 'Không tìm thấy lời bài hát'}
        </p>
        <p className="suggestion">
          Thử tìm kiếm: "{currentSong?.title?.text || currentSong?.title || 'Unknown'}"
        </p>
      </div>
    );
  }
  
  return (
    <div className="lyrics-container" ref={lyricsContainerRef}>
      <div className="lyrics-header">
        <h4>{lyrics.title}</h4>
        <p>{lyrics.artist}</p>
        {lyrics.album && <p className="lyrics-album">{lyrics.album}</p>}
      </div>
      <div className="lyrics-content">
        {lyrics.lines.map((line, index) => (
          <div 
            key={index} 
            className={`lyric-line lyric-line-${index} ${index === activeLyricIndex ? 'active' : ''}`}
          >
            {line.text || " "}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Lyrics
