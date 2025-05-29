import React from 'react'
import '../styles/loading.css'

const LoadingPage = () => {
  return (
    <div className="loading-container">
      <div className="loading-spinner"></div>
      <p className="loading-text">Connecting to RikoMusic...<br /><small>Please wait while we establish a secure connection</small></p>
    </div>
  )
}

export default LoadingPage
