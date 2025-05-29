import { verifyToken } from '../services/authService.js';

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Authentication token required' });
    }
    
    const userData = await verifyToken(token);
    
    if (!userData) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    
    req.user = userData;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(403).json({ message: 'Authentication failed' });
  }
};
