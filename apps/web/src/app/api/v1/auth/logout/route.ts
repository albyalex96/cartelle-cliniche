import { logout } from '@alby/core';
import { apiRoute } from '@/server/api';

export const POST = apiRoute(async (ctx) => {
  await logout(ctx);
});
