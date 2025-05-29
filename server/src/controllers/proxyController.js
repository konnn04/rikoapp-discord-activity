import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import fetch from 'node-fetch';

/**
 * Proxies a request to the specified URL
 * Simple and efficient proxy that streams data directly
 */
export const proxyRequest = async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }
  
  try {
    const decodedUrl = decodeURIComponent(url);
    console.log(`Proxying request to: ${decodedUrl}`);
    
    // Add common headers that help with certain services
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    
    // Add range header if it exists in the request (for media streaming)
    if (req.headers.range) {
      headers.Range = req.headers.range;
    }
    
    // Make the fetch request
    const response = await fetch(decodedUrl, { headers });
    
    if (!response.ok) {
      console.error(`Proxy fetch error: ${response.status} ${response.statusText}`);
      return res.status(response.status).json({
        error: 'Upstream resource error',
        status: response.status,
        message: response.statusText
      });
    }
    
    // Copy all headers from the response to our response
    for (const [key, value] of response.headers.entries()) {
      // Exclude headers that might cause issues
      if (!['connection', 'keep-alive', 'transfer-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }
    
    // Always set CORS headers to allow browser access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    
    // Set caching headers to improve performance
    if (!res.getHeader('Cache-Control')) {
      const isMedia = decodedUrl.match(/\.(mp3|mp4|m4a|webm|ogg|wav|jpg|jpeg|png|gif|webp)/i);
      if (isMedia) {
        // Cache media files longer
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
      } else {
        // Cache other resources briefly
        res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
      }
    }
    
    // Set the status code from the proxied response
    res.status(response.status);
    
    // Stream the response directly (most efficient)
    await pipeline(
      response.body,
      res
    );
  } catch (error) {
    console.error('Proxy error:', error.message);
    
    // Only send error if headers haven't been sent yet
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Proxy request failed',
        message: error.message
      });
    }
  }
};
