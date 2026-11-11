import { needsSetup } from '@alby/core';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { SetupForm } from '@/features/auth/setup-form';

export const metadata: Metadata = { title: 'Configurazione iniziale' };

export default async function SetupPage() {
  if (!(await needsSetup())) redirect('/login');
  return (
    <AuthCard
      title="Configurazione iniziale"
      description="Crea l’account amministratore: potrai poi aggiungere i pazienti e gli altri utenti."
      footer="Questo passaggio è disponibile solo al primo avvio."
    >
      <SetupForm />
    </AuthCard>
  );
}
