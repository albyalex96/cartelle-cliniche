import type { MeDTO } from '@alby/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { meQuery, queryKeys } from '@/lib/query';

/** Utente corrente. Da usare solo dentro l'area autenticata. */
export function useMe(): MeDTO {
  const { data } = useQuery(meQuery);
  if (!data) throw new Error('useMe usato fuori dall’area autenticata');
  return data;
}

/** Dopo login/setup: azzera la cache (nessun dato di un altro utente) e imposta l'utente. */
export function useSignedIn() {
  const qc = useQueryClient();
  return (user: MeDTO) => {
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.me[0] && q.queryKey[0] !== queryKeys.setup[0] });
    qc.setQueryData(queryKeys.setup, { needsSetup: false });
    qc.setQueryData(queryKeys.me, user);
  };
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(queryKeys.setup, { needsSetup: false });
      qc.setQueryData(queryKeys.me, null);
    },
  });
}
