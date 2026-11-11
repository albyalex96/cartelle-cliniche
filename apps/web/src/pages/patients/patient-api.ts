import type { PatientData, PatientDTO } from '@alby/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query';

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PatientData) => api.post<PatientDTO>('/patients', data),
    onSuccess: (patient) => {
      qc.setQueryData(queryKeys.patient(patient.id), patient);
      void qc.invalidateQueries({ queryKey: queryKeys.patientsAll });
    },
  });
}

/** Modifica con aggiornamento immediato dell'interfaccia (ripristino se il server rifiuta). */
export function useUpdatePatient(id: string) {
  const qc = useQueryClient();
  const key = queryKeys.patient(id);
  return useMutation({
    mutationFn: (data: PatientData) => api.put<PatientDTO>(`/patients/${id}`, data),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<PatientDTO>(key);
      if (previous) qc.setQueryData<PatientDTO>(key, { ...previous, ...data });
      return { previous };
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (patient) => qc.setQueryData(key, patient),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.patientsAll }),
  });
}

export function useDeletePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/patients/${id}`),
    onSuccess: (_r, id) => {
      qc.removeQueries({ queryKey: queryKeys.patient(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.patientsAll });
      void qc.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}

export const fullName = (p: Pick<PatientDTO, 'firstName' | 'lastName'>) => `${p.firstName} ${p.lastName}`;
