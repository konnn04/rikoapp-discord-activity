import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'
import { MusicProvider } from './context/MusicContext'
import { BrowserRouter } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'

// Import styles
import 'bootstrap-icons/font/bootstrap-icons.css'
import './styles/index.css'
import './styles/loading.css'
import './styles/player.css'
import 'react-toastify/dist/ReactToastify.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <MusicProvider>
          <App />
          <ToastContainer position="bottom-right" theme="dark" />
        </MusicProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
