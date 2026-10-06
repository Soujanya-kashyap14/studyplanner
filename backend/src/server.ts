import mongoose from 'mongoose';
import { config } from './config';
import { createApp } from './app';
import { ensureDemoUser } from './seed';

async function main() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, { dbName: config.mongoDb, serverSelectionTimeoutMS: 8000 });
  console.log(`  ✦ MongoDB connected → ${config.mongoUri.replace(/\/\/[^@]*@/, '//***@')} / ${config.mongoDb}`);
  await mongoose.connection.syncIndexes();
  if (config.seedDemo) await ensureDemoUser();

  const server = createApp().listen(config.port, () => console.log(`  ✦ Orbit API listening on http://localhost:${config.port}/api`));

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down`);
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start Orbit API:', err instanceof Error ? err.message : err);
  process.exit(1);
});
