import type { Metadata } from 'next';
import { Page, PageHeader } from '@/components/page';
import { TemplateEditor } from '@/features/report-templates/template-editor';
import { requirePageAdmin } from '@/server/context';

export const metadata: Metadata = { title: 'Nuovo tipo di referto' };

export default async function NewReportTemplatePage() {
  await requirePageAdmin();
  return (
    <Page>
      <PageHeader title="Nuovo tipo di referto" description="Dai un nome al tipo e scegli i campi da compilare." />
      <TemplateEditor template={null} />
    </Page>
  );
}
