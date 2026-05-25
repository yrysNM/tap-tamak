import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { Role, User } from '@prisma/client';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AccessTokenPayload } from './strategies/access-token.strategy';

const SALT_ROUNDS = 10;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    firstName: string;
    role: string;
    phone: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const normalizedPhone = this.normalizePhone(dto.phone);
    const existingPhone = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });
    if (existingPhone) {
      throw new ConflictException('User with this phone already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const firstName = dto.firstName.trim();
    const user = await this.prisma.user.create({
      data: {
        phone: normalizedPhone,
        passwordHash,
        firstName,
        role: dto.role,
        ...(dto.role === Role.COOK
          ? {
              cook: {
                create: {
                  businessName: firstName || 'Cook',
                },
              },
            }
          : {}),
      },
    });
    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const normalizedPhone = this.normalizePhone(dto.phone);
    const user = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials not found user');
    }
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials not valid password');
    }
    return this.issueTokens(user);
  }

  async refresh(userId: string, rawRefreshToken: string): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || !user.isActive || !user.refreshToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    const tokenMatches = await bcrypt.compare(
      rawRefreshToken,
      user.refreshToken,
    );
    if (!tokenMatches) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    return this.issueTokens(user);
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const accessExpiresIn = this.configService.get<string>(
      'jwt.accessExpiresIn',
      '15m',
    );
    const refreshExpiresIn = this.configService.get<string>(
      'jwt.refreshExpiresIn',
      '7d',
    );

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      phone: user.phone,
      role: user.role,
    };
    const refreshPayload = { sub: user.id };

    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.configService.get<string>('jwt.accessSecret'),
      expiresIn: accessExpiresIn,
    });

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: refreshExpiresIn,
    });

    const hashedRefresh = await bcrypt.hash(refreshToken, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: hashedRefresh },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        firstName: user.firstName,
        role: user.role,
        phone: user.phone,
      },
    };
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/\s/g, '').trim();
  }
}
