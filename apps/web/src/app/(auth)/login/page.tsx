import { needsSetup } from '@alby/core';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { LoginForm } from '@/features/auth/login-form';
import { getRequestContext } from '@/server/context';

export const metadata: Metadata = { title: 'Accedi' };

export default async function LoginPage() {
  if (await needsSetup()) redirect('/setup');
  if ((await getRequestContext()).user) redirect('/pazienti');
  return (
    <AuthCard title="Accedi" description="Inserisci le tue credenziali per continuare.">
      <LoginForm />
    </AuthCard>
  );
}
