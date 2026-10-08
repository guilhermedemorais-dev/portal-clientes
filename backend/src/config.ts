import { z } from 'zod';
const schema = z.object({
  PORT: z.coerce.number().default(8080), HOST: z.string().default('0.0.0.0'), DATABASE_URL: z.string().min(1),
  PROJECT_ID: z.string().min(1), FRONTEND_ORIGINS: z.string().default('http://localhost:5173'),
  FRONTEND_CALLBACK_URL: z.string().url().default('http://localhost:5173/auth/callback'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:8080'),
  GITHUB_CLIENT_ID: z.string().optional(), GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_REPOSITORY: z.string().optional(), GITHUB_TOKEN: z.string().optional(),
  ACCESS_MAP_JSON: z.string().default('{}'), STORAGE_DIR: z.string().default('./private-uploads'), MAX_UPLOAD_BYTES: z.coerce.number().default(5_000_000),
  SESSION_TTL_SECONDS: z.coerce.number().default(3600), LOG_LEVEL: z.string().default('info'), METRICS_BEARER_TOKEN: z.string().optional()
});
export type Config = z.infer<typeof schema> & { accessMap: Record<string, 'owner' | 'client'>; origins: string[] };
export function loadConfig(env = process.env): Config {
  const parsed = schema.parse(env);
  const accessMap = JSON.parse(parsed.ACCESS_MAP_JSON) as Record<string, 'owner' | 'client'>;
  for (const role of Object.values(accessMap)) if (!['owner','client'].includes(role)) throw new Error('ACCESS_MAP_JSON roles must be owner or client');
  return { ...parsed, accessMap, origins: parsed.FRONTEND_ORIGINS.split(',').map(v=>v.trim()).filter(Boolean) };
}
