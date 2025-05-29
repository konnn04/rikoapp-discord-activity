import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Get __dirname equivalent in ES6 modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '../../.env') })

export default {
  server: {
    port: process.env.PORT || 3001,
    environment: process.env.NODE_ENV || 'development'
  },
  cors: {
    origins: [
      'https://www.konnn04.live', 
      'https://1327233181904146482.discordsays.com',
      'http://localhost:3000',
      'http://localhost:5173', // Vite default port
      '*' // Allow all origins in development (remove in production)
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
  },
  discord: {
    clientId: process.env.VITE_DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    botToken: process.env.DISCORD_BOT_TOKEN,
    redirectUri: process.env.DISCORD_REDIRECT_URI
  },
  ytdlp: {
    binDir: process.env.YTDLP_BIN_DIR || path.join(__dirname, '../../bin'),
    autoUpdate: process.env.YTDLP_AUTO_UPDATE !== 'false' // Default to true unless explicitly set to false
  }
};