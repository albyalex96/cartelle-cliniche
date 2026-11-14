import { listReportTemplates } from '@alby/core';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '@/components/page';
import { TemplateEditor } from '@/features/report-templates/template-editor';
import { requirePageAdmin } from '@/server/context';

export const metadata: Metadata = { title: 'Modifica tipo di referto' };

export default async function EditReportTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageAdmin();
  const { id } = await params;
  const template = (await listReportTemplates(ctx)).find((t) => t.id === id);
  if (!template) notFound();
  return (
    <Page>
      <PageHeader title={template.name} description="Modifica il nome e i campi di questo tipo di referto." />
      <TemplateEditor template={template} />
    </Page>
  );
}
