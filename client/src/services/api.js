const API_URL = '/.proxy/api'
import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests if available
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('discord_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle response errors
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export const setAuthToken = (token) => {
  axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

export const exchangeToken = async (code) => {
  const response = await axiosInstance.post('/token', {
    code: code
  })
  const { access_token } = response.data;
  setAuthToken(access_token);
  return response.data
}

export const getUserInfo = async () => {
  const response = await axiosInstance.get('/users/@me');
  return response.data
}

// Join room
export const joinRoom = async (roomId, userData) => {
  const response = await axiosInstance.post(`/rooms/${roomId}/join`, {
    user: userData
  })
  return response.data
}

// Improved proxy function with better URL validation and error handling
export const byProxy = (url) => {
  if (!url) {
    return '';
  }
  
  if (url.startsWith('data:') || url.includes('/.proxy/api')) {
    return url;
  }
  
  try {
    // Make sure URL is valid
    new URL(url);
    
    // Detect media type for appropriate proxy
    if (url.match(/\.(mp3|mp4|m4a|wav|ogg|webm)(\?.*)?$/i) ||
        url.includes('googlevideo.com') ||
        url.includes('/audioplayback/')) {
      // Audio proxy with cache busting
      return `/.proxy/api/proxy/media?url=${encodeURIComponent(url)}&_t=${Date.now()}`;
    }
    
    if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i) ||
        url.includes('i.ytimg.com') ||
        url.includes('discord')) {
      // Image proxy without cache busting
      return `/.proxy/api/proxy/img?url=${encodeURIComponent(url)}`;
    }
    
    // Default proxy
    return `/.proxy/api/proxy?url=${encodeURIComponent(url)}`;
  } catch (error) {
    console.error('Invalid URL in byProxy function:', url);
    return '';
  }
};

// MUSIC API
export const searchSong = async (query) => {
  const response = await axiosInstance.get(`/music/search`, {
    params: { query }
  });
  return response.data;
}

// Add song to queue
export const addToQueueApi = async (roomId, song) => {
  const response = await axiosInstance.post(`/queue/${roomId}/add`, {
    song: song
  });
  return response.data;
};

// Get queue for a room
export const getQueueApi = async (roomId) => {
  const response = await axiosInstance.get(`/queue/${roomId}`);
  return response.data;
};

// Room APIs
export const leaveRoom = async (roomId) => {
  const response = await axiosInstance.post(`/rooms/${roomId}/leave`);
  return response.data;
};

export const getMusic = async (musicId) => {
  const response = await axiosInstance.get(`/music/${musicId}`);
  return response.data;
};

// Default export
export default axiosInstance;