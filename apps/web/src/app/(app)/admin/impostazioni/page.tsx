import { getCatalogAutoUpdates, getServerSettings, getServerStatus, getStorageUsage, listReportTemplates, type AuthedContext } from '@alby/core';
import { reportDateFields, type AutoUpdateCatalog, type CatalogAutoUpdateDTO } from '@alby/shared';
import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import { Page, PageHeader } from '@/components/page';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ImportServicesButton } from '@/features/health-services/import-services-button';
import { ImportCatalogButton } from '@/features/medications/import-catalog-button';
import { AutoUpdateBadge } from '@/features/settings/auto-update-badge';
import { RevokeSessionsButton, RunMaintenanceButton } from '@/features/settings/maintenance-buttons';
import { AuditSettingsForm, CatalogUpdateForm, SessionSettingsForm, TherapyPlanSettingsForm } from '@/features/settings/settings-forms';
import { formatBytes, formatDateTime, formatRelative } from '@/lib/format';
import { requirePageAdmin } from '@/server/context';

export const metadata: Metadata = { title: 'Impostazioni' };

const ENVIRONMENT_LABELS = { development: 'Sviluppo', production: 'Produzione', test: 'Test' } as const;
const number = (n: number) => n.toLocaleString('it-IT');

export default async function SettingsPage() {
  const ctx = await requirePageAdmin();
  const [settings, status, catalogs, templates] = await Promise.all([
    getServerSettings(ctx),
    getServerStatus(ctx),
    getCatalogAutoUpdates(ctx),
    listReportTemplates(ctx),
  ]);
  const { values, defaults } = settings;

  return (
    <Page>
      <PageHeader title="Impostazioni" description="Funzionamento del server: sessioni, audit log, pulizia, piano terapeutico, elenchi pubblici e stato." />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Sessioni</CardTitle>
              <CardDescription>Per quanto tempo si resta collegati dopo l’accesso. Vale per tutti gli utenti, dalla prossima attività.</CardDescription>
            </CardHeader>
            <CardContent>
              <SessionSettingsForm
                values={{ sessionIdleDays: values.sessionIdleDays, sessionMaxDays: values.sessionMaxDays }}
                defaults={{ sessionIdleDays: defaults.sessionIdleDays, sessionMaxDays: defaults.sessionMaxDays }}
              />
            </CardContent>
            <CardFooter className="flex-wrap justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                {status.activeSessions === 1 ? '1 sessione aperta (la tua)' : `${number(status.activeSessions)} sessioni aperte`}
              </span>
              <RevokeSessionsButton />
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audit Log</CardTitle>
              <CardDescription>
                {status.auditEntries === 0
                  ? 'L’audit log è vuoto.'
                  : `${number(status.auditEntries)} voci, la più vecchia del ${formatDateTime(status.oldestAuditAt)}.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AuditSettingsForm values={{ auditRetentionMonths: values.auditRetentionMonths }} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pulizia</CardTitle>
              <CardDescription>
                Una volta al giorno il server elimina da solo le sessioni scadute e le voci dell’audit log più vecchie del periodo di conservazione. Qui
                puoi farlo subito.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <RunMaintenanceButton />
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Piano terapeutico</CardTitle>
              <CardDescription>
                Nella panoramica di ogni paziente una card mostra se ha un piano terapeutico e quando scade: scegli il tipo di referto con cui i
                piani vengono inseriti e il campo che ne riporta la scadenza.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TherapyPlanSettingsForm
                templates={templates.map((t) => ({ id: t.id, name: t.name, dateFields: reportDateFields(t.fields) }))}
                values={
                  // Se il tipo scelto è stato eliminato si riparte da "Nessuno".
                  templates.some((t) => t.id === values.therapyPlanTemplateId)
                    ? { therapyPlanTemplateId: values.therapyPlanTemplateId, therapyPlanDateField: values.therapyPlanDateField }
                    : { therapyPlanTemplateId: null, therapyPlanDateField: null }
                }
              />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Stato del server</CardTitle>
              <CardDescription>Avviato {formatRelative(status.startedAt)}.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-2.5">
                <Row label="Modalità">{ENVIRONMENT_LABELS[status.environment]}</Row>
                <Row label="Utenti attivi">{number(status.users)}</Row>
                <Row label="Database">
                  {formatBytes(status.databaseBytes)} · PostgreSQL {status.databaseVersion}
                </Row>
                <Suspense
                  fallback={
                    <Row label="Archivio dei file">
                      <Skeleton className="ml-auto h-4 w-32" />
                    </Row>
                  }
                >
                  <StorageRows ctx={ctx} />
                </Suspense>
                <Row label="Sistema">
                  Node.js {status.nodeVersion} · {status.platform}
                </Row>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configurazione di avvio</CardTitle>
              <CardDescription>
                Queste voci si leggono all’avvio dal file <code>.env</code> (o dalle variabili del contenitore Docker): per cambiarle bisogna modificarle
                lì e riavviare il server.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-2.5">
                <Row label="Cartella dell’archivio">
                  <span className="font-mono text-xs break-all">{status.storageDir}</span>
                </Row>
                <Row label="Cookie solo su HTTPS">{status.cookieSecure ? 'Sì' : 'No'}</Row>
                <Row label="Dietro un reverse proxy">{status.trustProxy ? 'Sì' : 'No'}</Row>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <CatalogUpdateCard catalog="drugs" status={catalogs.drugs} />
        <CatalogUpdateCard catalog="services" status={catalogs.services} />
      </div>
    </Page>
  );
}

const CATALOG_CARDS: Record<AutoUpdateCatalog, { title: string; description: string }> = {
  drugs: {
    title: 'Elenco farmaci',
    description: 'Scarica dal sito dell’AIFA la lista aggiornata dei farmaci (un file di circa 80 MB). Nessun dato dei pazienti viene inviato.',
  },
  services: {
    title: 'Elenco prestazioni',
    description:
      'Scarica dal portale SIST della Regione Puglia il Catalogo Unico Regionale e il Nomenclatore tariffario (circa 1 MB). Nessun dato dei pazienti viene inviato.',
  },
};

/** Aggiornamento automatico di un elenco pubblico: programmazione, ultimo aggiornamento e prossimo. */
function CatalogUpdateCard({ catalog, status }: { catalog: AutoUpdateCatalog; status: CatalogAutoUpdateDTO }) {
  const { title, description } = CATALOG_CARDS[catalog];
  const overdue = status.nextRunAt !== null && new Date(status.nextRunAt).getTime() <= Date.now();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {title}
          <AutoUpdateBadge enabled={status.enabled} />
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <dl className="grid gap-2.5">
          <Row label="Ultimo aggiornamento">
            {status.importedAt ? `${formatDateTime(status.importedAt)} (${formatRelative(status.importedAt)})` : 'Mai scaricato'}
          </Row>
          <Row label="Prossimo aggiornamento">
            {!status.enabled ? '—' : status.running ? 'In corso…' : overdue ? 'Entro pochi minuti' : formatDateTime(status.nextRunAt)}
          </Row>
          {status.lastError && status.lastAttemptAt && (
            <Row label="Ultimo tentativo automatico">
              <span className="text-destructive">
                Non riuscito il {formatDateTime(status.lastAttemptAt)}: {status.lastError}
              </span>
            </Row>
          )}
        </dl>
        <CatalogUpdateForm catalog={catalog} values={{ enabled: status.enabled, days: status.days, hour: status.hour }} />
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-3">
        <span className="text-sm text-muted-foreground">Se il server è spento all’ora prevista, l’aggiornamento parte appena si riaccende.</span>
        {catalog === 'drugs' ? <ImportCatalogButton firstTime={!status.importedAt} /> : <ImportServicesButton firstTime={!status.importedAt} />}
      </CardFooter>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

/** Contare i file dell'archivio può richiedere qualche secondo: arriva dopo il resto della pagina. */
async function StorageRows({ ctx }: { ctx: AuthedContext }) {
  const usage = await getStorageUsage(ctx);
  return (
    <>
      <Row label="Archivio dei file">
        {formatBytes(usage.bytes)} · {usage.files === 1 ? '1 file' : `${number(usage.files)} file`}
      </Row>
      {usage.diskFreeBytes !== null && usage.diskTotalBytes !== null && (
        <Row label="Spazio libero sul disco">
          {formatBytes(usage.diskFreeBytes)} su {formatBytes(usage.diskTotalBytes)}
        </Row>
      )}
    </>
  );
}
