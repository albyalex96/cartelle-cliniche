import { listPatients } from '@alby/core';
import { SearchX, Users } from 'lucide-react';
import type { Metadata } from 'next';
import { Page, PageHeader } from '@/components/page';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { NewPatientButton } from '@/features/patients/new-patient-button';
import { PatientCard } from '@/features/patients/patient-card';
import { PatientSearch } from '@/features/patients/patient-search';
import { requirePageUser } from '@/server/context';

export const metadata: Metadata = { title: 'Pazienti' };

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const ctx = await requirePageUser();
  const raw = (await searchParams).q;
  const q = (typeof raw === 'string' ? raw : '').trim().slice(0, 100);
  const patients = await listPatients(ctx, { q });
  const isAdmin = ctx.user.role === 'ADMIN';
  const n = patients.length;

  return (
    <Page>
      <PageHeader
        title="Pazienti"
        description={q ? `${n} risultat${n === 1 ? 'o' : 'i'}` : `${n} pazient${n === 1 ? 'e' : 'i'} in archivio`}
        actions={isAdmin && <NewPatientButton />}
      />

      <PatientSearch defaultValue={q} />

      {n > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {patients.map((p) => (
            <PatientCard key={p.id} patient={p} />
          ))}
        </div>
      ) : q ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>Nessun risultato</EmptyTitle>
            <EmptyDescription>Nessun paziente corrisponde a “{q}”.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>Nessun paziente</EmptyTitle>
            <EmptyDescription>
              {isAdmin
                ? 'Aggiungi il primo paziente per iniziare a raccogliere esami, terapie e immagini.'
                : 'Non hai ancora accesso a nessun paziente. Chiedi all’amministratore.'}
            </EmptyDescription>
          </EmptyHeader>
          {isAdmin && (
            <EmptyContent>
              <NewPatientButton />
            </EmptyContent>
          )}
        </Empty>
      )}
    </Page>
  );
}
