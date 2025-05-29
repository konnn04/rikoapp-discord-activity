import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useMusic } from '../context/MusicContext'
import ProgressBar from '../components/MusicPlayer/ProgressBar'
import SearchModal from '../components/MusicPlayer/SearchModal'
import QueueManager from '../components/MusicPlayer/QueueManager'
import NowPlaying from '../components/MusicPlayer/NowPlaying'
import ParticipantModal from '../components/MusicPlayer/ParticipantModal'
import Controls from '../components/MusicPlayer/Controls'
import Volume from '../components/MusicPlayer/Volume'
import '../styles/player.css'

const PlayerPage = () => {
    const { user } = useAuth()
    const { isConnected, joinRoomHandle, participants } = useMusic()
    const [showParticipantModal, setShowParticipantModal] = useState(false)
    const [showSearchModal, setShowSearchModal] = useState(false)
    const joinAttemptedRef = useRef(false)

    useEffect(() => {
        if (!isConnected && !joinAttemptedRef.current) {
            console.log('User is not connected, attempting to join room...')
            joinAttemptedRef.current = true
            joinRoomHandle()
        }
    }, [isConnected, joinRoomHandle])

    const displayedParticipants = participants?.slice(0, 5) || []
    const remainingCount = Math.max(0, (participants?.length || 0) - 5)

    return (
        <div className="player-page">
            <header className="player-header-new">
                <h1>RikoMusic</h1>
                
                <div className="participants-box" onClick={() => setShowParticipantModal(true)}>
                    <div className="participants-avatars">
                        {displayedParticipants.map((participant, index) => (
                            <img
                                key={participant.id}
                                src={participant.avatarUrl || `https://cdn.discordapp.com/embed/avatars/0.png`}
                                alt={participant.name || "Unknown user"}
                                className="participant-mini-avatar"
                                style={{ zIndex: displayedParticipants.length - index }}
                                onError={(e) => {
                                    e.target.src = `https://cdn.discordapp.com/embed/avatars/0.png`;
                                }}
                            />
                        ))}
                        {remainingCount > 0 && (
                            <div className="participant-count">+{remainingCount}</div>
                        )}
                    </div>
                    <span className="participants-text">
                        {participants?.length || 0} listening
                    </span>
                </div>
            </header>

            {!isConnected ? (
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p className="loading-text">Joining channel...</p>
                </div>
            ) : (
                <div className="player-container-new">
                    <div className="main-content">
                        <div className="unified-section">
                            <div className="now-playing-side">
                                <NowPlaying />
                            </div>
                            <div className="queue-side">
                                <QueueManager onOpenSearch={() => setShowSearchModal(true)} />
                            </div>
                        </div>
                    </div>

                    <div className="player-footer">
                        <Controls />
                        <ProgressBar />
                        <Volume />
                    </div>
                </div>
            )}

            <ParticipantModal 
                isOpen={showParticipantModal}
                onClose={() => setShowParticipantModal(false)}
            />

            <SearchModal 
                isOpen={showSearchModal}
                onClose={() => setShowSearchModal(false)}
            />
        </div>
    )
}

export default PlayerPage
