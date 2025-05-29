import { getUserFromDiscord } from '../services/discordService.js';

export const getUserInfo = async (req, res) => {
  try {
    const userId = req.user.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Get user information from Discord
    const userInfo = await getUserFromDiscord(userId);
    
    if (!userInfo) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Return user information
    return res.json({
      id: userId,
      username: userInfo.username,
      displayName: userInfo.global_name || userInfo.username,
      avatar: userInfo.avatar ? `https://cdn.discordapp.com/avatars/${userId}/${userInfo.avatar}.png` : null,
      discriminator: userInfo.discriminator
    });
  } catch (error) {
    console.error('Error getting user info:', error);
    return res.status(500).json({ error: 'Failed to get user information' });
  }
};
