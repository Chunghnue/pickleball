import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const EffectiveOwnerId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.effectiveOwnerId as string;
  },
);
