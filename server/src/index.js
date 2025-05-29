import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from 'cors';
import config from './config/base.js';
import SocketService from './services/socketService.js';
import { initializeServices } from './services/serviceInitializer.js';
import app from './app.js';

const port = process.env.PORT || 3001;
const httpServer = createServer(app);

// Create Socket.io server
const io = new Server(httpServer, {
  cors: {
    origin: config.cors.origins,
    methods: config.cors.methods,
    credentials: config.cors.credentials
  },
  path: "/ws/socket.io",
});

// Initialize services and Socket.IO
initializeServices({
  ytdlpOptions: {
    binDir: config.ytdlp?.binDir,
    autoUpdate: config.ytdlp?.autoUpdate ?? true
  }
}).then(() => {
  // Store io in app for controllers to access
  app.set('io', io);
  
  const socketServiceInstance = new SocketService(io);
  io.socketService = socketServiceInstance;

  httpServer.listen(port, () => {
    console.log(`Server running in ${config.server.environment} mode`);
    console.log(`Listening at http://localhost:${port}`);
  });
}).catch(error => {
  console.error('Failed to initialize services:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    console.log('HTTP server closed');
  });
});
