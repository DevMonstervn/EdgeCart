import { UserRepository } from '../repositories/user.repo.js';
import { hashPassword, verifyPassword } from '../utils/crypto.js';
import { signJwt, verifyJwt } from '../utils/jwt.js';
import type { Env } from '../types/env.js';
import type { RegisterInput, LoginInput, User } from '@edgecart/shared';

export class AuthService {
  private userRepo: UserRepository;

  constructor(private env: Env) {
    this.userRepo = new UserRepository(env.DB);
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
      900 // 15 mins
    );

    const refreshToken = crypto.randomUUID();
    // Save session in KV with 7 days TTL (604800s)
    if (this.env.KV) {
      await this.env.KV.put(`session:${dbUser.id}:${refreshToken}`, JSON.stringify({ userId: dbUser.id, email: dbUser.email }), {
        expirationTtl: 604800,
      });
    }

    const user: User = {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.full_name,
      phone: dbUser.phone,
      role: dbUser.role as any,
      status: dbUser.status as any,
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
      900 // 15 mins
    );

    const refreshToken = crypto.randomUUID();
    if (this.env.KV) {
      await this.env.KV.put(`session:${dbUser.id}:${refreshToken}`, JSON.stringify({ userId: dbUser.id, email: dbUser.email }), {
        expirationTtl: 604800,
      });
    }

    const user: User = {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.full_name,
      phone: dbUser.phone,
      role: dbUser.role as any,
      status: dbUser.status as any,
      createdAt: dbUser.created_at,
      updatedAt: dbUser.updated_at,
    };

    return { user, accessToken, refreshToken };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    if (!this.env.KV) {
      throw new Error('Hệ thống phiên không khả dụng');
    }

    // In local tests or production, KV can be used to validate refresh token
    // Search session key
    // For fast verification, we can prefix or decode
    let sessionData: { userId: string; email: string } | null = null;
    const list = await this.env.KV.list({ prefix: 'session:' });
    for (const key of list.keys) {
      if (key.name.endsWith(`:${refreshToken}`)) {
        const val = await this.env.KV.get(key.name);
        if (val) {
          sessionData = JSON.parse(val);
          break;
        }
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
      900
    );

    return { accessToken: newAccessToken };
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (this.env.KV && refreshToken) {
      await this.env.KV.delete(`session:${userId}:${refreshToken}`);
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
      role: dbUser.role as any,
      status: dbUser.status as any,
      createdAt: dbUser.created_at,
      updatedAt: dbUser.updated_at,
    };
  }
}
