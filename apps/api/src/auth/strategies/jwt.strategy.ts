import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { StaffRole, UserRole } from '../../users/entities/user.entity';

export interface JwtPayload {
  sub: string;
  role: UserRole;
  ownerId: string | null;
  staffRole: StaffRole | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>(
        'JWT_ACCESS_SECRET',
        'change-me-access-secret',
      ),
    });
  }

  validate(payload: JwtPayload): {
    userId: string;
    role: UserRole;
    ownerId: string | null;
    staffRole: StaffRole | null;
  } {
    return {
      userId: payload.sub,
      role: payload.role,
      ownerId: payload.ownerId,
      staffRole: payload.staffRole,
    };
  }
}
