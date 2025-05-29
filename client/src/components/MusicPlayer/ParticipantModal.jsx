import { useMusic } from '../../context/MusicContext'
import { imageProxy } from '../../services/proxy'

const ParticipantModal = ({ isOpen, onClose }) => {
  const { participants } = useMusic()
  
  // Default fallback avatar
  const FALLBACK_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24'%3E%3Cpath fill='%23777' d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
  
  if (!isOpen) return null
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Listening Together ({participants?.length || 0})</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="participants-grid">
            {participants && participants.map((participant) => (
              <div key={participant.id} className="participant-item">
                <img 
                  src={participant.avatarUrl ? imageProxy(participant.avatarUrl) : FALLBACK_AVATAR}
                  alt={participant.name || "Unknown user"}
                  className="participant-item-avatar"
                  onError={(e) => {
                    e.target.src = FALLBACK_AVATAR;
                  }}
                />
                <div className="participant-info">
                  <h4>{participant.global_name || participant.username || participant.name}</h4>
                  <p>Songs added: {participant.songsAdded || 0}</p>
                  <p>Joined: {formatTime(participant.joinedAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const formatTime = (timestamp) => {
  if (!timestamp) return 'Just now'
  
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default ParticipantModal
