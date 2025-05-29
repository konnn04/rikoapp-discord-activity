import express from 'express';
import cors from 'cors';
import config from './config/base.js';
import authRoutes from './routes/authRoutes.js';
import musicRoutes from './routes/musicRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import proxyRoutes from './routes/proxyRoutes.js';
import queueRoutes from './routes/queueRoutes.js';
import playbackRoutes from './routes/playbackRoutes.js';
import lyricsRoutes from './routes/lyricsRoutes.js';

const app = express();
app.use(cors({
  origin: config.cors.origins,
  methods: config.cors.methods,
  credentials: config.cors.credentials
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the Music Room API',
    version: '1.0.0',
    environment: config.server.environment
  });
});

app.use('/api/token', authRoutes);
app.use('/api/music', musicRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/playback', playbackRoutes);
app.use('/api/proxy', proxyRoutes);
app.use('/api/lyrics', lyricsRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

export default app;