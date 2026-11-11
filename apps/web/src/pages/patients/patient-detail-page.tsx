import { SEX_LABELS, type PatientDTO } from '@alby/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  FlaskConical,
  IdCard,
  MoreHorizontal,
  Pencil,
  Pill,
  ScanLine,
  Trash2,
  UserRoundX,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/page';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMe } from '@/hooks/use-session';
import { ApiError, errorMessage } from '@/lib/api';
import { ageFrom, formatDate, formatDateTime, initials } from '@/lib/format';
import { patientQuery, queryKeys } from '@/lib/query';
import { fullName, useDeletePatient, useUpdatePatient } from './patient-api';
import { PatientFormDialog } from './patient-form-dialog';

function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function ComingSoon({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Badge variant="secondary">In arrivo</Badge>
      </EmptyContent>
    </Empty>
  );
}

function Overview({ patient }: { patient: PatientDTO }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Dati anagrafici</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <InfoItem label="Nome">{patient.firstName}</InfoItem>
            <InfoItem label="Cognome">{patient.lastName}</InfoItem>
            <InfoItem label="Data di nascita">
              {patient.birthDate && `${formatDate(patient.birthDate)} (${ageFrom(patient.birthDate)} anni)`}
            </InfoItem>
            <InfoItem label="Sesso">{patient.sex && SEX_LABELS[patient.sex]}</InfoItem>
            <InfoItem label="Codice fiscale">
              {patient.fiscalCode && <span className="font-mono">{patient.fiscalCode}</span>}
            </InfoItem>
            <InfoItem label="Gruppo sanguigno">{patient.bloodType}</InfoItem>
            <InfoItem label="Telefono">
              {patient.phone && (
                <a className="underline-offset-4 hover:underline" href={`tel:${patient.phone}`}>
                  {patient.phone}
                </a>
              )}
            </InfoItem>
            <InfoItem label="Email">
              {patient.email && (
                <a className="underline-offset-4 hover:underline" href={`mailto:${patient.email}`}>
                  {patient.email}
                </a>
              )}
            </InfoItem>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Note</CardTitle>
          <CardDescription>Allergie, patologie, informazioni utili</CardDescription>
        </CardHeader>
        <CardContent>
          {patient.notes ? (
            <p className="whitespace-pre-wrap text-sm">{patient.notes}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Nessuna nota.</p>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground lg:col-span-3">
        Scheda creata il {formatDateTime(patient.createdAt)} · ultima modifica {formatDateTime(patient.updatedAt)}
      </p>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <Page>
      <Skeleton className="h-5 w-24" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <Skeleton className="h-9 w-80" />
      <Skeleton className="h-64 rounded-xl" />
    </Page>
  );
}

export default function PatientDetailPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: patient, isPending, error } = useQuery({
    ...patientQuery(id),
    // Mostra subito i dati già presenti nell'elenco, poi aggiorna in background.
    placeholderData: () =>
      qc
        .getQueriesData<PatientDTO[]>({ queryKey: queryKeys.patientsAll })
        .flatMap(([, list]) => list ?? [])
        .find((p) => p.id === id),
  });
  const update = useUpdatePatient(id);
  const remove = useDeletePatient();

  if (isPending) return <DetailSkeleton />;

  if (error || !patient) {
    const notFound = error instanceof ApiError && (error.status === 404 || error.status === 400);
    return (
      <Page>
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UserRoundX />
            </EmptyMedia>
            <EmptyTitle>{notFound ? 'Paziente non trovato' : 'Impossibile caricare il paziente'}</EmptyTitle>
            <EmptyDescription>
              {notFound ? 'Il paziente non esiste o non hai accesso alla sua scheda.' : errorMessage(error)}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" asChild>
              <Link to="/pazienti">Torna ai pazienti</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </Page>
    );
  }

  const age = ageFrom(patient.birthDate);
  const isAdmin = me.role === 'ADMIN';

  return (
    <Page>
      <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" asChild>
        <Link to="/pazienti">
          <ArrowLeft />
          Pazienti
        </Link>
      </Button>

      <PageHeader
        leading={
          <Avatar className="size-14">
            <AvatarFallback className="bg-primary/10 text-lg font-medium text-primary">
              {initials(patient.firstName, patient.lastName)}
            </AvatarFallback>
          </Avatar>
        }
        title={fullName(patient)}
        description={
          <div className="flex flex-wrap items-center gap-2">
            <span>{patient.birthDate ? `${age} anni · nato/a il ${formatDate(patient.birthDate)}` : 'Età non indicata'}</span>
            {patient.bloodType && <Badge variant="outline">Gruppo {patient.bloodType}</Badge>}
            {!patient.canEdit && <Badge variant="secondary">Sola lettura</Badge>}
          </div>
        }
        actions={
          <>
            {patient.canEdit && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil />
                Modifica
              </Button>
            )}
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Altre azioni">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                    <Trash2 />
                    Elimina paziente
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="overview">
            <IdCard />
            Panoramica
          </TabsTrigger>
          <TabsTrigger value="labs">
            <FlaskConical />
            Esami
          </TabsTrigger>
          <TabsTrigger value="therapy">
            <Pill />
            Terapie
          </TabsTrigger>
          <TabsTrigger value="imaging">
            <ScanLine />
            Immagini
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Overview patient={patient} />
        </TabsContent>
        <TabsContent value="labs">
          <ComingSoon
            icon={FlaskConical}
            title="Esami di laboratorio"
            description="Qui troverai i referti, lo storico dei valori con i grafici e l’importazione automatica dai PDF."
          />
        </TabsContent>
        <TabsContent value="therapy">
          <ComingSoon
            icon={Pill}
            title="Terapie"
            description="Elenco dei farmaci con ricerca per nome o principio attivo, dosaggi e frequenze."
          />
        </TabsContent>
        <TabsContent value="imaging">
          <ComingSoon
            icon={ScanLine}
            title="Immagini diagnostiche"
            description="Caricamento dei CD di ecografie, TAC e risonanze con visualizzatore integrato."
          />
        </TabsContent>
      </Tabs>

      <PatientFormDialog
        open={editing}
        onOpenChange={setEditing}
        patient={patient}
        pending={update.isPending}
        onSubmit={async (data) => {
          await update.mutateAsync(data);
          toast.success('Modifiche salvate');
        }}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare {fullName(patient)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno eliminati definitivamente la scheda e tutti i dati collegati. L’operazione non si può annullare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                remove.mutate(patient.id, {
                  onSuccess: () => {
                    toast.success(`${fullName(patient)} eliminato`);
                    void navigate('/pazienti', { replace: true });
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                })
              }
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
