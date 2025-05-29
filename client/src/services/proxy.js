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

// Specialized function for images with better error handling
export const imageProxy = (url) => {
    if (!url) return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"%3E%3Cpath fill="%23aaa" d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm0 16H5V5h14v14zm-5-7l-3 4h-4l3-4-2-3h4l2 3z"/%3E%3C/svg%3E';
    
    if (url.startsWith('data:')) return url;
    
    try {
        const proxyUrl = new URL('/.proxy/api/proxy/img', window.location.origin);
        proxyUrl.searchParams.set('url', encodeURIComponent(url));
        return proxyUrl.toString();
    } catch (error) {
        console.error('Invalid URL in imageProxy function:', url);
        return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"%3E%3Cpath fill="%23aaa" d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm0 16H5V5h14v14zm-5-7l-3 4h-4l3-4-2-3h4l2 3z"/%3E%3C/svg%3E';
    }
};

// General function for determining the right proxy to use
export const byProxy = (url) => {
    if (!url || url === 'undefined') {
        return '';
    }
  
    // If URL is already a proxy or is a data URI, return as is
    if (url.startsWith('data:') || url.includes('/.proxy/api/proxy')) {
        return url;
    }

    // If URL is relative, return as is
    if (!url.startsWith('http')) {
        return url;
    }

    // For audio streams, use the audio-optimized proxy
    if (url.includes('.mp3') || 
        url.includes('.m4a') || 
        url.includes('/audioplayback/') || 
        url.includes('googlevideo.com')) {
        return audioProxy(url);
    }

    // For images, use the image-optimized proxy
    if (url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i) || 
        url.includes('i.ytimg.com') || 
        url.includes('discordapp.com/')) {
        return imageProxy(url);
    }

    // For other resources, use the general proxy
    return proxy(url);
};

export default proxy;