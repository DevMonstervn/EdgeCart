export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  ENVIRONMENT: string;
  APP_URL: string;
  JWT_SECRET: string;
}

export interface JwtPayload {
  sub: string; // userId
  email: string;
  role: string;
  iat: number;
  exp: number;
}
