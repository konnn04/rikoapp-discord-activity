import fetch from 'node-fetch';
import config from '../config/base.js';

// Simple cache for user data to avoid repeated API calls
const userCache = new Map();
const CACHE_TTL = 3600000; // 1 hour in milliseconds

// Rate limiting variables
let isRateLimited = false;
let rateLimitResetTime = 0;
const rateLimitRetryDelay = 5000; // 5 seconds

export const getUserFromDiscord = async (userId) => {
  try {
    // Check cache first
    if (userCache.has(userId)) {
      const cachedData = userCache.get(userId);
      if (cachedData.expiry > Date.now()) {
        return cachedData.data;
      } else {
        userCache.delete(userId); // Expired cache entry
      }
    }

    // Check if we're currently rate limited
    if (isRateLimited && Date.now() < rateLimitResetTime) {
      console.log(`Discord API is rate limited. Returning fallback user data for ${userId}`);
      return createFallbackUserData(userId);
    }

    const response = await fetch(`https://discord.com/api/v10/users/${userId}`, {
      headers: {
        Authorization: `Bot ${config.discord.botToken}`
      }
    });
    
    if (response.status === 429) {
      // Handle rate limiting
      const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
      isRateLimited = true;
      rateLimitResetTime = Date.now() + (retryAfter * 1000);
      console.warn(`Discord API rate limited. Retry after ${retryAfter} seconds.`);
      
      // Return fallback data instead of throwing
      return createFallbackUserData(userId);
    }
    
    if (!response.ok) {
      throw new Error(`Discord API returned ${response.status}`);
    }
    
    const userData = await response.json();
    
    // Cache the result
    userCache.set(userId, {
      data: userData,
      expiry: Date.now() + CACHE_TTL
    });
    
    return userData;
  } catch (error) {
    console.error('Failed to fetch user from Discord API:', error);
    // Instead of throwing, return a fallback user object
    return createFallbackUserData(userId);
  }
};

// Create a fallback user object when API calls fail
function createFallbackUserData(userId) {
  return {
    id: userId,
    username: `User_${userId.substring(0, 5)}`,
    avatar: null,
    global_name: `User ${userId.substring(0, 5)}`
  };
}

export const exchangeCodeForToken = async (code) => {
  try {
    console.log('Exchanging code for Discord token:', config.discord.clientId);
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.discord.clientId,
        client_secret: config.discord.clientSecret,
        grant_type: 'authorization_code',
        code,
      }),
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(`Discord token exchange failed: ${JSON.stringify(data)}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error exchanging code for token:', error);
    throw error;
  }
};
