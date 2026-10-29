import { UserRepository } from '../repositories/user.repo.js';
import { hashPassword, verifyPassword } from '../utils/crypto.js';
import { signJwt } from '../utils/jwt.js';
import type { Env } from '../types/env.js';
import type { RegisterInput, LoginInput, User, UserRole, UserStatus } from '@edgecart/shared';

const REFRESH_SESSION_TTL_SECONDS = 604800; // 7 days
const ACCESS_TOKEN_TTL_SECONDS = 86400; // 24 hours
const MAX_LEGACY_SESSION_SCAN_PAGES = 50; // Safe upper bound when scanning legacy unindexed sessions

export class AuthService {
  private userRepo: UserRepository;

  constructor(private env: Env) {
    this.userRepo = new UserRepository(env.DB);
  }

  private async persistRefreshSession(userId: string, email: string, refreshToken: string): Promise<void> {
    if (!this.env.KV) return;
    await Promise.all([
      // Primary session record partitioned by userId so Admin account lock can revoke all user sessions by prefix
      this.env.KV.put(`session:${userId}:${refreshToken}`, JSON.stringify({ userId, email }), {
        expirationTtl: REFRESH_SESSION_TTL_SECONDS,
      }),
      // O(1) reverse index avoiding Cloudflare KV's 1,000-key single-page list limit
      this.env.KV.put(`refresh_idx:${refreshToken}`, userId, {
        expirationTtl: REFRESH_SESSION_TTL_SECONDS,
      }),
    ]);
  }

  async register(input: RegisterInput): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const existing = await this.userRepo.findByEmail(input.email);
    if (existing) {
      throw new Error('Email này đã được sử dụng');
    }

    const passwordHash = await hashPassword(input.password);
    const userId = crypto.randomUUID();

    const dbUser = await this.userRepo.create({
      id: userId,
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      phone: input.phone,
      role: 'CUSTOMER',
    });

    const accessToken = await signJwt(
      { sub: dbUser.id, email: dbUser.email, role: dbUser.role },
      this.env.JWT_SECRET,
      ACCESS_TOKEN_TTL_SECONDS
    );

    const refreshToken = crypto.randomUUID();
    await this.persistRefreshSession(dbUser.id, dbUser.email, refreshToken);

    const user: User = {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.full_name,
      phone: dbUser.phone,
      avatarUrl: dbUser.avatar_url || null,
      role: dbUser.role as UserRole,
      isSeller: dbUser.is_seller === 1,
      status: dbUser.status as UserStatus,
      createdAt: dbUser.created_at,
      updatedAt: dbUser.updated_at,
    };

    return { user, accessToken, refreshToken };
  }

  async login(input: LoginInput): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const dbUser = await this.userRepo.findByEmail(input.email);
    if (!dbUser) {
      throw new Error('Email hoặc mật khẩu không chính xác');
    }

    const isMatch = await verifyPassword(input.password, dbUser.password_hash);
    if (!isMatch) {
      throw new Error('Email hoặc mật khẩu không chính xác');
    }

    if (dbUser.status !== 'ACTIVE') {
      throw new Error('Tài khoản của bạn đã bị khóa');
    }

    const accessToken = await signJwt(
      { sub: dbUser.id, email: dbUser.email, role: dbUser.role },
      this.env.JWT_SECRET,
      ACCESS_TOKEN_TTL_SECONDS
    );

    const refreshToken = crypto.randomUUID();
    await this.persistRefreshSession(dbUser.id, dbUser.email, refreshToken);

    const user: User = {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.full_name,
      phone: dbUser.phone,
      avatarUrl: dbUser.avatar_url || null,
      role: dbUser.role as UserRole,
      isSeller: dbUser.is_seller === 1,
      status: dbUser.status as UserStatus,
      createdAt: dbUser.created_at,
      updatedAt: dbUser.updated_at,
    };

    return { user, accessToken, refreshToken };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    if (!this.env.KV) {
      throw new Error('Hệ thống phiên không khả dụng');
    }

    const normalizedToken = refreshToken.trim();
    if (!normalizedToken || normalizedToken.includes(':')) {
      throw new Error('Phiên đăng nhập đã hết hạn');
    }

    let sessionData: { userId: string; email: string } | null = null;

    // 1. Fast path: O(1) lookup via refresh_idx:<token> verified against primary session:<userId>:<token>
    const indexedUserId = await this.env.KV.get(`refresh_idx:${normalizedToken}`);
    if (indexedUserId) {
      const primaryVal = await this.env.KV.get(`session:${indexedUserId}:${normalizedToken}`);
      if (primaryVal) {
        sessionData = JSON.parse(primaryVal);
      } else {
        // Primary session was expired or revoked by Admin; purge stale index
        await this.env.KV.delete(`refresh_idx:${normalizedToken}`);
      }
    } else {
      // 2. Backward-compatible fallback: cursor-paginated KV.list for pre-existing sessions without refresh_idx:
      let cursor: string | undefined = undefined;
      const suffix = `:${normalizedToken}`;

      for (let page = 0; page < MAX_LEGACY_SESSION_SCAN_PAGES; page++) {
        const listResult: KVNamespaceListResult<unknown, string> = await this.env.KV.list({
          prefix: 'session:',
          cursor,
        });
        const matched = listResult.keys.find((k) => k.name.endsWith(suffix));
        if (matched) {
          const val = await this.env.KV.get(matched.name);
          if (val) {
            sessionData = JSON.parse(val);
            if (sessionData?.userId) {
              // Backfill O(1) index so future refreshes skip KV.list
              await this.env.KV.put(`refresh_idx:${normalizedToken}`, sessionData.userId, {
                expirationTtl: REFRESH_SESSION_TTL_SECONDS,
              });
            }
          }
          break;
        }
        if (listResult.list_complete) {
          break;
        }
        cursor = listResult.cursor;
      }
    }

    if (!sessionData) {
      throw new Error('Phiên đăng nhập đã hết hạn');
    }

    const dbUser = await this.userRepo.findById(sessionData.userId);
    if (!dbUser || dbUser.status !== 'ACTIVE') {
      throw new Error('Tài khoản không hợp lệ');
    }

    const newAccessToken = await signJwt(
      { sub: dbUser.id, email: dbUser.email, role: dbUser.role },
      this.env.JWT_SECRET,
      ACCESS_TOKEN_TTL_SECONDS
    );

    return { accessToken: newAccessToken };
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (this.env.KV && refreshToken) {
      const normalizedToken = refreshToken.trim();
      await Promise.all([
        this.env.KV.delete(`session:${userId}:${normalizedToken}`),
        this.env.KV.delete(`refresh_idx:${normalizedToken}`),
      ]);
    }
  }

  async getProfile(userId: string): Promise<User> {
    const dbUser = await this.userRepo.findById(userId);
    if (!dbUser) {
      throw new Error('Không tìm thấy người dùng');
    }

    return {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.full_name,
      phone: dbUser.phone,
      avatarUrl: dbUser.avatar_url || null,
      role: dbUser.role as UserRole,
      isSeller: dbUser.is_seller === 1,
      status: dbUser.status as UserStatus,
      createdAt: dbUser.created_at,
      updatedAt: dbUser.updated_at,
    };
  }

  async updateProfile(userId: string, input: { fullName?: string; phone?: string | null; avatarUrl?: string | null }): Promise<User> {
    const dbUser = await this.userRepo.updateProfile(userId, input);
    return {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.full_name,
      phone: dbUser.phone,
      avatarUrl: dbUser.avatar_url || null,
      role: dbUser.role as UserRole,
      isSeller: dbUser.is_seller === 1,
      status: dbUser.status as UserStatus,
      createdAt: dbUser.created_at,
      updatedAt: dbUser.updated_at,
    };
  }
}
