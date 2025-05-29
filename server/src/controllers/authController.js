import { exchangeCodeForToken } from '../services/discordService.js';

export const tokenExchange = async (req, res) => {
  try {
    console.log('Received request to exchange code for access_token');
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }
    
    const tokenData = await exchangeCodeForToken(code);
    
    res.json({
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in
    });
  } catch (error) {
    console.error('Error in token exchange:', error);
    res.status(500).json({ error: 'Failed to exchange code for token' });
  }
};
