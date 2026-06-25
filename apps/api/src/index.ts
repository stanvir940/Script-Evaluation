import { createApp } from './app';
import { connectDatabase } from './lib/db';
import { config } from './config';

async function main() {
  await connectDatabase();
  const app = createApp();

  app.listen(config.port, () => {
    console.log(`API server running on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
