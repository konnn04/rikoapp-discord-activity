import { useEffect, useState, useRef } from 'react'

const Lyrics = ({ currentSong, currentPosition }) => {
  const [lyrics, setLyrics] = useState([])
  const [activeLyricIndex, setActiveLyricIndex] = useState(0)
  const lyricsContainerRef = useRef(null)
  
  // Fetch lyrics or use from song data
  useEffect(() => {
    if (currentSong && currentSong.lyrics) {
      // If lyrics is a string, parse it into timed lyrics
      if (typeof currentSong.lyrics === 'string') {
        // Simple parsing (should be improved for real implementation)
        const parsedLyrics = currentSong.lyrics
          .split('\n')
          .map((line, index) => ({
            text: line,
            time: index * 5 // Simple placeholder timing
          }))
        setLyrics(parsedLyrics)
      } else {
        // If lyrics is already parsed
        setLyrics(currentSong.lyrics)
      }
    } else {
      setLyrics([])
    }
  }, [currentSong])
  
  // Update active lyric based on current position
  useEffect(() => {
    if (!lyrics.length) return
    
    let activeIndex = 0
    
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= currentPosition) {
        activeIndex = i
      } else {
        break
      }
    }
    
    if (activeIndex !== activeLyricIndex) {
      setActiveLyricIndex(activeIndex)
      
      // Scroll the active lyric into view
      const container = lyricsContainerRef.current
      if (container) {
        const activeElement = container.querySelector(`.lyric-line-${activeIndex}`)
        if (activeElement) {
          activeElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          })
        }
      }
    }
  }, [currentPosition, lyrics, activeLyricIndex])
  
  if (!lyrics.length) {
    return (
      <div className="lyrics-container">
        <p className="no-lyrics">No lyrics available</p>
      </div>
    )
  }
  
  return (
    <div className="lyrics-overlay" ref={lyricsContainerRef}>
      {lyrics.map((line, index) => (
        <div 
          key={index} 
          className={`lyric-line lyric-line-${index} ${index === activeLyricIndex ? 'active' : ''}`}
        >
          {line.text}
        </div>
      ))}
    </div>
  )
}

export default Lyrics
