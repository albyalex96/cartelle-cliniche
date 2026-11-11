import type { MeDTO, PatientDTO, SetupStatusDTO } from '@alby/shared';
import { QueryCache, QueryClient, MutationCache } from '@tanstack/react-query';
import { ApiError, api } from './api';

export const queryKeys = {
  setup: ['setup-status'] as const,
  me: ['me'] as const,
  patients: (q = '') => ['patients', q] as const,
  patientsAll: ['patients'] as const,
  patient: (id: string) => ['patient', id] as const,
  users: ['users'] as const,
  audit: (page: number, action: string) => ['audit', page, action] as const,
};

/** Se il server dice che la sessione non è più valida, si torna al login. */
function handleAuthError(err: unknown) {
  if (!(err instanceof ApiError)) return;
  if (err.status === 401) queryClient.setQueryData(queryKeys.me, null);
  if (err.code === 'PASSWORD_CHANGE_REQUIRED') void queryClient.invalidateQueries({ queryKey: queryKeys.me });
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleAuthError }),
  mutationCache: new MutationCache({ onError: handleAuthError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: (count, err) => !(err instanceof ApiError && err.status > 0 && err.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});

export const setupStatusQuery = {
  queryKey: queryKeys.setup,
  queryFn: () => api.get<SetupStatusDTO>('/setup/status'),
  staleTime: Infinity,
};

export const meQuery = {
  queryKey: queryKeys.me,
  queryFn: async (): Promise<MeDTO | null> => {
    try {
      return await api.get<MeDTO>('/auth/me');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },
  staleTime: Infinity,
};

export const patientQuery = (id: string) => ({
  queryKey: queryKeys.patient(id),
  queryFn: () => api.get<PatientDTO>(`/patients/${id}`),
});
