import { requireUser } from '@alby/core';
import { apiRoute } from '@/server/api';

export const GET = apiRoute(async (ctx) => requireUser(ctx, { allowPendingPasswordChange: true }).user);
