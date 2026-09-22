import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  // ─── Register ───────────────────────────────────────

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        bio: dto.bio,
        role: 'SUBSCRIBER',
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.createSession(user.id, tokens.refreshToken);

    return {
      user,
      ...tokens,
    };
  }

  // ─── Login ──────────────────────────────────────────

  async login(dto: LoginDto, userAgent?: string, ip?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is inactive');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.createSession(user.id, tokens.refreshToken, userAgent, ip);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
      ...tokens,
    };
  }

  // ─── Refresh ────────────────────────────────────────

  async refresh(refreshToken: string) {
    const session = await this.prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.expiresAt < new Date()) {
      await this.prisma.session.delete({ where: { id: session.id } });
      throw new UnauthorizedException('Refresh token expired');
    }

    if (session.user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is inactive');
    }

    // Rotate: delete old session, create new tokens
    await this.prisma.session.delete({ where: { id: session.id } });

    const tokens = await this.generateTokens(
      session.user.id,
      session.user.email,
      session.user.role,
    );
    await this.createSession(session.user.id, tokens.refreshToken);

    return tokens;
  }

  // ─── Logout ─────────────────────────────────────────

  async logout(refreshToken: string) {
    await this.prisma.session.deleteMany({
      where: { refreshToken },
    });
    return { message: 'Logged out successfully' };
  }

  // ─── Get Profile ────────────────────────────────────

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        bio: true,
        role: true,
        status: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  // ─── Helpers ────────────────────────────────────────

  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        expiresIn: this.config.get('JWT_EXPIRY', '15m'),
      }),
      this.jwt.signAsync(payload, {
        expiresIn: this.config.get('REFRESH_EXPIRY', '7d'),
        secret: this.config.get('JWT_SECRET') + '_refresh',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async createSession(
    userId: string,
    refreshToken: string,
    userAgent?: string,
    ip?: string,
  ) {
    // Parse expiry from refresh token config (e.g. "7d" → 7 days)
    const expiryStr = this.config.get('REFRESH_EXPIRY', '7d');
    const days = parseInt(expiryStr) || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    return this.prisma.session.create({
      data: {
        userId,
        refreshToken,
        userAgent,
        ipAddress: ip,
        expiresAt,
      },
    });
  }
}
