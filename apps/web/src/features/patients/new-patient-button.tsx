'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createPatientAction } from '@/server/actions/patients';
import { PatientFormDialog } from './patient-form-dialog';

export function NewPatientButton({ label = 'Nuovo paziente' }: { label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {label}
      </Button>
      <PatientFormDialog
        open={open}
        onOpenChange={setOpen}
        save={createPatientAction}
        onSaved={({ id }) => {
          toast.success('Paziente aggiunto all’archivio');
          router.push(`/pazienti/${id}`);
        }}
      />
    </>
  );
}
