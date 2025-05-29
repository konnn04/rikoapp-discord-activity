import { AuthProvider, useAuth } from './context/AuthContext'
import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import LoadingPage from './pages/LoadingPage'
import PlayerPage from './pages/PlayerPage'

function App() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <LoadingPage />
  }

  return (
    <AuthProvider>
      <Routes>
        <Route path="/auth" element={<LoadingPage />} />
        <Route 
          path="/player" 
          element={isAuthenticated ? <PlayerPage /> : <Navigate to="/auth" />} 
        />
        <Route path="*" element={<Navigate to={isAuthenticated ? "/player" : "/auth"} />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
