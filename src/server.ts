import express from 'express';
import { DatabaseManager } from './database/DatabaseManager';
import authRoutes from './routes/auth';
import attendanceRoutes from './routes/attendance';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Database health check
app.get('/health/database', async (req, res) => {
  try {
    const dbManager = DatabaseManager.getInstance();
    const isHealthy = await dbManager.checkHealth();
    
    if (isHealthy) {
      res.status(200).json({
        status: 'healthy',
        database: 'connected',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        database: 'disconnected',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database
    const dbManager = DatabaseManager.getInstance();
    await dbManager.initialize();
    console.log('Database initialized successfully');

    // Start server
    app.listen(PORT, () => {
      console.log(`Farm Attendance System server running on port ${PORT}`);
      console.log(`Health check available at http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  const dbManager = DatabaseManager.getInstance();
  await dbManager.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  const dbManager = DatabaseManager.getInstance();
  await dbManager.close();
  process.exit(0);
});

// Only start server if this file is run directly
if (require.main === module) {
  startServer();
}

export default app;