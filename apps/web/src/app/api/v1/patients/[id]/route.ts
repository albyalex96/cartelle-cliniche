import { getPatient } from '@alby/core';
import { apiRoute } from '@/server/api';

export const GET = apiRoute<{ id: string }>(async (ctx, _req, { id }) => getPatient(ctx, id));
