import fetch from 'node-fetch';
import NodeCache from 'node-cache';

// Create a cache with TTL of 1 hour
const tokenCache = new NodeCache({ stdTTL: 3600 });

/**
 * Verify a Discord token with Discord API
 * @param {string} token - Discord access token
 * @returns {Promise<Object>} User data if token is valid
 */
export const verifyToken = async (token) => {
  // Check if token is in cache
  if (tokenCache.has(token)) {
    return tokenCache.get(token);
  }
  
  try {
    // Verify token with Discord API
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Discord API returned ${response.status}`);
    }
    
    const userData = await response.json();
    
    // Cache the token and user data
    tokenCache.set(token, userData);
    
    return userData;
  } catch (error) {
    console.error('Token verification error:', error);
    throw new Error('Invalid token');
  }
};

/**
 * Clear a token from cache
 * @param {string} token - Discord access token
 */
export const clearTokenCache = (token) => {
  if (tokenCache.has(token)) {
    tokenCache.del(token);
  }
};

/**
 * Get all cached tokens
 * @returns {Array} Array of cached tokens
 */
export const getCachedTokens = () => {
  return tokenCache.keys();
};
