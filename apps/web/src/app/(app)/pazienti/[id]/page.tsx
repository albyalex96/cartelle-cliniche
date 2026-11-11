import { AppError, getPatient } from '@alby/core';
import { SEX_LABELS, type PatientDTO } from '@alby/shared';
import { ArrowLeft, FlaskConical, IdCard, Pill, ScanLine, type LucideIcon } from 'lucide-react';
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
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PatientActions } from '@/features/patients/patient-actions';
import { ageFrom, formatDate, formatDateTime, initials } from '@/lib/format';
import { requirePageUser } from '@/server/context';

type Props = { params: Promise<{ id: string }> };

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

export default async function PatientDetailPage({ params }: Props) {
  const { ctx, patient } = await loadPatient((await params).id);
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
    </Page>
  );
}
