import 'dotenv/config';

const required = (name: string, fallback?: string) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing environment variable ${name}`);
  return v;
};

export const config = {
  port: Number(process.env.PORT ?? 8000),
  mongoUri: required('MONGODB_URI', 'mongodb://localhost:27017'),
  mongoDb: process.env.MONGODB_DB ?? 'orbit',
  jwtSecret: required('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-only-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigins: (process.env.CORS_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  seedDemo: (process.env.SEED_DEMO ?? 'true') !== 'false',
  frontendDist: process.env.FRONTEND_DIST ?? '../frontend/dist',
  isProd: process.env.NODE_ENV === 'production',
  /** Optional: lets Orbit read syllabi (incl. scanned PDFs and photos) with Claude. Without it, the built-in parser is used. */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
};
