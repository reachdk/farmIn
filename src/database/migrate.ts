#!/usr/bin/env ts-node

import { DatabaseManager } from './DatabaseManager';

async function runMigrations() {
  console.log('Starting database migrations...');
  
  try {
    const dbManager = DatabaseManager.getInstance();
    await dbManager.initialize();
    console.log('Database migrations completed successfully');
    await dbManager.close();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations();
}