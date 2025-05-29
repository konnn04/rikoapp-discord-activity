import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Loading from '../components/Loading'

const LoadingPage = () => {
    const { isAuthenticated, loginDiscordSDK } = useAuth()
    const navigate = useNavigate()

    useEffect(() => {
        loginDiscordSDK()
    }, [])


    useEffect(() => {
        if (isAuthenticated) {
            navigate('/player')
        }
    }, [isAuthenticated, navigate])

    return (
        <div className="auth-page">
            <div className="auth-container">
                <h1>RikoMusic</h1>
                <Loading />
            </div>
        </div>
    )
}

export default LoadingPage
