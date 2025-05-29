import { useState, useEffect, useRef } from 'react'
import { useMusic } from '../../context/MusicContext'

const Volume = () => {
    const { volume, setVolume, audioRef } = useMusic()
    const [isHovering, setIsHovering] = useState(false)
    const [isMuted, setIsMuted] = useState(false)
    const [previousVolume, setPreviousVolume] = useState(0.5)
    const [localVolume, setLocalVolume] = useState(volume) // Local state for smooth UI
    const updateTimeoutRef = useRef(null)

    useEffect(() => {
        // Initialize previous volume with current volume
        setPreviousVolume(volume > 0 ? volume : 0.5)
        setLocalVolume(volume)
    }, [])

    // Sync with external volume changes
    useEffect(() => {
        setLocalVolume(volume)
    }, [volume])

    const handleVolumeChange = (e) => {
        const newVolume = parseFloat(e.target.value)
        
        // Update local state immediately for smooth UI
        setLocalVolume(newVolume)
        
        // If the audio element exists, update it directly
        if (audioRef.current) {
            audioRef.current.volume = newVolume
        }
        
        // Update mute state based on volume
        if (newVolume === 0) {
            setIsMuted(true)
        } else {
            setIsMuted(false)
            setPreviousVolume(newVolume)
        }
        
        // Debounce the actual context update to avoid excessive state changes
        if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current)
        }
        
        updateTimeoutRef.current = setTimeout(() => {
            setVolume(newVolume)
        }, 100)
    }

    const toggleMute = () => {
        if (isMuted) {
            // Unmute
            const unmuteVolume = previousVolume
            setLocalVolume(unmuteVolume)
            setIsMuted(false)
            
            // Update audio element directly
            if (audioRef.current) {
                audioRef.current.volume = unmuteVolume
            }
            
            // Update context after slight delay
            setTimeout(() => {
                setVolume(unmuteVolume)
            }, 0)
        } else {
            // Mute
            setPreviousVolume(localVolume > 0 ? localVolume : 0.5)
            setLocalVolume(0)
            setIsMuted(true)
            
            // Update audio element directly
            if (audioRef.current) {
                audioRef.current.volume = 0
            }
            
            // Update context after slight delay
            setTimeout(() => {
                setVolume(0)
            }, 0)
        }
    }

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current)
            }
        }
    }, [])

    return (
        <div
            className="volume-container"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            style={{
                width: isHovering ? '150px' : '50px',
                transition: 'width 0.3s ease',
            }}
        >
            <div className="volume-icon" onClick={toggleMute}>
                {localVolume === 0 ? (
                    <svg viewBox="0 0 24 24">
                        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"></path>
                    </svg>
                ) : localVolume < 0.5 ? (
                    <svg viewBox="0 0 24 24">
                        <path d="M7 9v6h4l5 5V4l-5 5H7z"></path>
                    </svg>
                ) : (
                    <svg viewBox="0 0 24 24">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path>
                    </svg>
                )}
            </div>
            <input
                style={{
                    width: isHovering ? '100%' : '0',
                    opacity: isHovering ? 1 : 0,
                }}
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={localVolume}
                onChange={handleVolumeChange}
                className="volume-range"
            />
        </div>
    )
}

export default Volume
