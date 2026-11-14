import { listReportTemplates } from '@alby/core';
import type { Metadata } from 'next';
import { Page, PageHeader } from '@/components/page';
import { TemplateEditor } from '@/features/report-templates/template-editor';
import { requirePageAdmin } from '@/server/context';

export const metadata: Metadata = { title: 'Nuovo tipo di referto' };

/** Nuovo tipo, vuoto oppure copia di uno esistente (`?da=<id>`). */
export default async function NewReportTemplatePage({ searchParams }: { searchParams: Promise<{ da?: string }> }) {
  const ctx = await requirePageAdmin();
  const { da } = await searchParams;
  const copyOf = da ? ((await listReportTemplates(ctx)).find((t) => t.id === da) ?? null) : null;
  return (
    <Page>
      <PageHeader
        title="Nuovo tipo di referto"
        description={copyOf ? `Copia di «${copyOf.name}»: cambia il nome e i campi che servono.` : 'Dai un nome al tipo e scegli i campi da compilare.'}
      />
      <TemplateEditor template={null} copyOf={copyOf} />
    </Page>
  );
}
