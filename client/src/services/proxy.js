/**
 * Creates a proxied URL for external resources
 * @param {string} url - The original URL to proxy
 * @param {Object} options - Additional options
 * @returns {string} The proxied URL
 */
export function proxy(url, options = {}) {
    // Don't proxy URLs that are already from our domain, data URLs, or undefined
    if (!url || 
        url === 'undefined' || 
        url.startsWith(window.location.origin) || 
        url.startsWith('data:')) {
        return url || '';
    }
    
    try {
        // Validate URL
        new URL(url);
        
        // Build proxy URL with base path
        const proxyUrl = new URL('/.proxy/api/proxy', window.location.origin);
        proxyUrl.searchParams.set('url', encodeURIComponent(url));
        
        // Add any additional options as query parameters
        Object.entries(options).forEach(([key, value]) => {
            if (value !== undefined) {
                proxyUrl.searchParams.set(key, String(value));
            }
        });
        
        return proxyUrl.toString();
    } catch (error) {
        console.error('Invalid URL in proxy function:', url);
        // Return a placeholder for invalid URLs
        return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"%3E%3Cpath fill="%23999" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/%3E%3C/svg%3E';
    }
}

// Specialized function for media streams
export const audioProxy = (url) => {
    if (!url) return '';
    
    if (url.startsWith('data:') || url.includes('/.proxy/api/proxy')) {
        return url;
    }
    
    try {
        const proxyUrl = new URL('/.proxy/api/proxy/media', window.location.origin);
        proxyUrl.searchParams.set('url', encodeURIComponent(url));
        proxyUrl.searchParams.set('_t', Date.now().toString()); // Cache busting for media
        return proxyUrl.toString();
    } catch (error) {
        console.error('Invalid URL in audioProxy function:', url);
        return '';
    }
};

/**
 * Generate a proxied URL for images
 * @param {string} url - The original image URL
 * @returns {string} - The proxied image URL
 */
export const imageProxy = (url) => {
  if (!url) {
    return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"%3E%3Cpath fill="%23777" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"%3E%3C/path%3E%3C/svg%3E';
  }
  
  if (url.startsWith('data:') || url.includes('/.proxy/')) {
    return url;
  }
  
  try {
    // Make sure URL is valid
    new URL(url);
    return `/.proxy/api/proxy/img?url=${encodeURIComponent(url)}`;
  } catch (error) {
    console.error('Invalid URL for proxy:', url);
    return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"%3E%3Cpath fill="%23777" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"%3E%3C/path%3E%3C/svg%3E';
  }
};

/**
 * Generate a proxied URL for media files (audio, video)
 * @param {string} url - The original media URL 
 * @returns {string} - The proxied media URL
 */
export const mediaProxy = (url) => {
  if (!url) return '';
  
  if (url.startsWith('data:') || url.includes('/.proxy/')) {
    return url;
  }
  
  try {
    new URL(url);
    return `/.proxy/api/proxy/media?url=${encodeURIComponent(url)}`;
  } catch (error) {
    console.error('Invalid URL for media proxy:', url);
    return '';
  }
};

/**
 * Generate a proxy URL for any resource type
 */
export const proxy = (url) => {
  if (!url) return '';
  
  if (url.startsWith('data:') || url.includes('/.proxy/')) {
    return url;
  }
  
  try {
    // Check file extension to determine type
    new URL(url);
    if (url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i)) {
      return imageProxy(url);
    } else if (url.match(/\.(mp3|wav|mp4|webm|ogg|m4a|flac)$/i)) {
      return mediaProxy(url);
    } else {
      return `/.proxy/api/proxy?url=${encodeURIComponent(url)}`;
    }
  } catch (error) {
    console.error('Invalid URL for proxy:', url);
    return '';
  }
};

// Add function to detect content type from URL
export const detectContentType = (url) => {
  if (!url) return 'unknown';
  
  try {
    if (url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i)) {
      return 'image';
    } else if (url.match(/\.(mp3|wav|ogg|flac|m4a)$/i)) {
      return 'audio';
    } else if (url.match(/\.(mp4|webm|mkv|avi|mov)$/i)) {
      return 'video';
    } else {
      return 'unknown';
    }
  } catch (error) {
    return 'unknown';
  }
};

export default proxy;