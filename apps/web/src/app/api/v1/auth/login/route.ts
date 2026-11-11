import type { MobileLoginResponseDTO } from '@alby/shared';
import { login } from '@alby/core';
import { apiRoute, readJson } from '@/server/api';

export const POST = apiRoute(async (ctx, req): Promise<MobileLoginResponseDTO> => {
  const { user, token, expiresAt } = await login(ctx, await readJson(req), 'mobile');
  return { user, token, expiresAt: expiresAt.toISOString() };
});
