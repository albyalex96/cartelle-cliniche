import { listLogs } from '@alby/core';
import type { Metadata } from 'next';
import { Page, PageHeader } from '@/components/page';
import { LogViewer } from '@/features/logs/log-viewer';
import { requirePageAdmin } from '@/server/context';

export const metadata: Metadata = { title: 'Log' };

export default async function LogPage() {
  const ctx = await requirePageAdmin();
  const initial = await listLogs(ctx, { limit: 200 });
  return (
    <Page>
      <PageHeader
        title="Log"
        description="Richieste all’API, errori del server e log inviati dalle app. Solo dati tecnici, tenuti per 30 giorni."
      />
      <LogViewer initial={initial} />
    </Page>
  );
}
