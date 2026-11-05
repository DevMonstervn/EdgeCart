export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  ENVIRONMENT: string;
  APP_URL: string;
  ALLOWED_ORIGINS?: string;
  R2_PUBLIC_BASE_URL?: string;
  JWT_SECRET: string;
  GEMINI_API_KEY?: string;
  AI_PROVIDER?: string;
  AI_MODEL?: string;
}

export interface JwtPayload {
  sub: string; // userId
  email: string;
  role: string;
  iat: number;
  exp: number;
}
