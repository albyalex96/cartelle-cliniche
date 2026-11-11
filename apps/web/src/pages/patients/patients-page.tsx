import { SEX_LABELS, type PatientDTO } from '@alby/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus, Search, SearchX, Users, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useDeferredValue, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/page';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/hooks/use-session';
import { api } from '@/lib/api';
import { ageFrom, formatDate, initials } from '@/lib/format';
import { patientQuery, queryKeys } from '@/lib/query';
import { fullName, useCreatePatient } from './patient-api';
import { PatientFormDialog } from './patient-form-dialog';

function PatientCard({ patient }: { patient: PatientDTO }) {
  const qc = useQueryClient();
  const age = ageFrom(patient.birthDate);

  // Al passaggio del mouse la scheda viene già scaricata: il clic apre la pagina all'istante.
  const prefetch = () => void qc.prefetchQuery({ ...patientQuery(patient.id), staleTime: 30_000 });

  return (
    <Link to={`/pazienti/${patient.id}`} onMouseEnter={prefetch} onFocus={prefetch} className="group block rounded-xl">
      <Card className="flex-row items-center gap-4 p-4 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <Avatar className="size-11">
          <AvatarFallback className="bg-primary/10 font-medium text-primary">
            {initials(patient.firstName, patient.lastName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">
            {patient.lastName} {patient.firstName}
          </div>
          <div className="truncate text-sm text-muted-foreground">
            {patient.birthDate ? `${formatDate(patient.birthDate)} · ${age} anni` : 'Data di nascita non indicata'}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {patient.sex && <Badge variant="secondary">{SEX_LABELS[patient.sex]}</Badge>}
            {patient.bloodType && <Badge variant="outline">{patient.bloodType}</Badge>}
          </div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Card>
    </Link>
  );
}

export default function PatientsPage() {
  const me = useMe();
  const navigate = useNavigate();
  const isAdmin = me.role === 'ADMIN';
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const [creating, setCreating] = useState(false);
  const create = useCreatePatient();

  const { data, isPending, isFetching } = useQuery({
    queryKey: queryKeys.patients(q),
    queryFn: () => api.get<PatientDTO[]>(`/patients${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    placeholderData: keepPreviousData,
  });

  const count = data?.length ?? 0;

  return (
    <Page>
      <PageHeader
        title="Pazienti"
        description={
          isPending ? ' ' : q ? `${count} risultat${count === 1 ? 'o' : 'i'}` : `${count} pazient${count === 1 ? 'e' : 'i'} in archivio`
        }
        actions={
          isAdmin && (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              Nuovo paziente
            </Button>
          )
        }
      />

      <InputGroup className="max-w-md">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Cerca per nome, cognome o codice fiscale…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Cerca pazienti"
        />
        {search && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" aria-label="Cancella ricerca" onClick={() => setSearch('')}>
              <X />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      {isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[92px] rounded-xl" />
          ))}
        </div>
      ) : count === 0 ? (
        q ? (
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
                <Button onClick={() => setCreating(true)}>
                  <Plus />
                  Nuovo paziente
                </Button>
              </EmptyContent>
            )}
          </Empty>
        )
      ) : (
        <div
          className="grid gap-3 transition-opacity sm:grid-cols-2 lg:grid-cols-3 data-[stale=true]:opacity-60"
          data-stale={isFetching && q !== search.trim()}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {data!.map((p) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.15 }}
              >
                <PatientCard patient={p} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <PatientFormDialog
        open={creating}
        onOpenChange={setCreating}
        pending={create.isPending}
        onSubmit={async (data) => {
          const patient = await create.mutateAsync(data);
          toast.success(`${fullName(patient)} aggiunto all’archivio`);
          void navigate(`/pazienti/${patient.id}`);
        }}
      />
    </Page>
  );
}
