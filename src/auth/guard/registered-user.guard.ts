import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthUser } from '../auth-user';

// Runs after JwtGuard. Rejects a valid token whose user row does not exist yet,
// so handlers can treat AuthUser.userId as non-null.
@Injectable()
export class RegisteredUserGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user: AuthUser = ctx.switchToHttp().getRequest().user;
    if (!user?.userId) {
      throw new UnauthorizedException('No account exists for this token');
    }
    return true;
  }
}
