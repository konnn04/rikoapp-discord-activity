import fetch from 'node-fetch';

/**
 * Fetches data from a given URL
 * @param {string} url - The URL to fetch
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Object>} The response object with data and headers
 */
export const fetchFromUrl = async (url, options = {}) => {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        ...options.headers
      },
      ...options
    });
    
    if (!response.ok) {
      throw new Error(`Error fetching from URL: ${response.status} ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type');
    let data;
    
    // Handle different content types appropriately
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } 
    else if (contentType?.includes('image/') || 
             contentType?.includes('audio/') ||
             contentType?.includes('video/') ||
             contentType?.includes('application/octet-stream')) {
      data = await response.buffer();
    }
    else {
      data = await response.text();
    }
    
    return {
      data,
      headers: response.headers
    };
  } catch (error) {
    console.error('Proxy service fetch error:', error);
    throw error;
  }
};
