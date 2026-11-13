import { AppError, getPatient, listImagingStudies, listLabTrends, listMedications, listReports } from '@alby/core';
import { SEX_LABELS, type MedicationDTO, type PatientDTO } from '@alby/shared';
import { ArrowLeft, History, IdCard, ScanLine, TrendingUp } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { cache } from 'react';
import { Page, PageHeader } from '@/components/page';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PatientActions } from '@/features/patients/patient-actions';
import { ImagingStudies } from '@/features/imaging/imaging-studies';
import { TherapyCard } from '@/features/medications/medication-list';
import { LabTrends } from '@/features/trends/lab-trends';
import { NewReportMenu } from '@/features/reports/new-report-menu';
import { ReportHistory } from '@/features/reports/report-history';
import { toReportImaging } from '@/features/reports/report-imaging';
import { ageFrom, formatDate, formatDateTime, initials } from '@/lib/format';
import { requirePageUser } from '@/server/context';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> };

const TABS = ['overview', 'storico', 'andamento', 'imaging'] as const;

/** Una sola lettura (e una sola voce nel registro) anche se la chiedono sia metadata sia pagina. */
const loadPatient = cache(async (id: string) => {
  const ctx = await requirePageUser();
  try {
    return { ctx, patient: await getPatient(ctx, id) };
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { patient } = await loadPatient((await params).id);
  return { title: `${patient.firstName} ${patient.lastName}` };
}

function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function Overview({ patient, medications }: { patient: PatientDTO; medications: MedicationDTO[] }) {
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
      <TherapyCard patientId={patient.id} medications={medications} canEdit={patient.canEdit} className="lg:col-span-3" />
      <p className="text-xs text-muted-foreground lg:col-span-3">
        Scheda creata il {formatDateTime(patient.createdAt)} · ultima modifica {formatDateTime(patient.updatedAt)}
      </p>
    </div>
  );
}

export default async function PatientDetailPage({ params, searchParams }: Props) {
  const { ctx, patient } = await loadPatient((await params).id);
  const { tab } = await searchParams;
  const [reports, studies, medications, trends] = await Promise.all([
    listReports(ctx, patient.id),
    listImagingStudies(ctx, patient.id),
    listMedications(ctx, patient.id),
    listLabTrends(ctx, patient.id),
  ]);
  // Al dialog del CD/DVD (client) passano solo i dati per confrontare il disco con il paziente.
  const discPatient = { id: patient.id, firstName: patient.firstName, lastName: patient.lastName, birthDate: patient.birthDate, fiscalCode: patient.fiscalCode };
  // Per il modal "Inserisci referto": studi di immagini da poter collegare al nuovo referto.
  const imaging = toReportImaging(discPatient, studies, null);
  const age = ageFrom(patient.birthDate);
  const isAdmin = ctx.user.role === 'ADMIN';

  return (
    <Page>
      <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" asChild>
        <Link href="/pazienti">
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
        title={`${patient.firstName} ${patient.lastName}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{patient.birthDate ? `${age} anni · nato/a il ${formatDate(patient.birthDate)}` : 'Età non indicata'}</span>
            {patient.bloodType && <Badge variant="outline">Gruppo {patient.bloodType}</Badge>}
            {!patient.canEdit && <Badge variant="secondary">Sola lettura</Badge>}
          </span>
        }
        actions={(patient.canEdit || isAdmin) && <PatientActions patient={patient} canDelete={isAdmin} />}
      />

      {/* Le schede sono interattive (client), ma il loro contenuto è renderizzato qui sul server. */}
      {/* key: cambiando ?tab= nell'indirizzo la scheda selezionata si aggiorna. */}
      <Tabs key={tab} defaultValue={TABS.find((t) => t === tab) ?? (tab === 'esami' ? 'storico' : 'overview')} className="gap-4">
        {/* Schede a sinistra e bottone + a destra, sempre sulla stessa riga. */}
        <div className="flex items-center justify-between gap-2">
          <TabsList className="min-w-0 flex-1 justify-start overflow-x-auto sm:w-fit sm:flex-none">
            <TabsTrigger value="overview">
              <IdCard />
              Panoramica
            </TabsTrigger>
            <TabsTrigger value="storico">
              <History />
              Storico
              {reports.length > 0 && (
                <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 px-1.5 tabular-nums">
                  {reports.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="andamento">
              <TrendingUp />
              Andamento
            </TabsTrigger>
            <TabsTrigger value="imaging">
              <ScanLine />
              Immagini
              {studies.length > 0 && (
                <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 px-1.5 tabular-nums">
                  {studies.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          {patient.canEdit && (
            <div className="shrink-0">
              <NewReportMenu imaging={imaging} />
            </div>
          )}
        </div>
        <TabsContent value="overview">
          <Overview patient={patient} medications={medications} />
        </TabsContent>
        <TabsContent value="storico">
          <ReportHistory patient={discPatient} reports={reports} canEdit={patient.canEdit} imaging={imaging} />
        </TabsContent>
        <TabsContent value="andamento">
          <LabTrends patientId={patient.id} trends={trends} />
        </TabsContent>
        <TabsContent value="imaging">
          <ImagingStudies patient={discPatient} studies={studies} canEdit={patient.canEdit} />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
