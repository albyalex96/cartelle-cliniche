import { SEX_LABELS, type PatientDTO } from '@alby/shared';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ageFrom, formatDate, initials } from '@/lib/format';

/** Server Component: la scheda arriva al browser come HTML, senza JavaScript. */
export function PatientCard({ patient }: { patient: PatientDTO }) {
  const age = ageFrom(patient.birthDate);
  return (
    <Link href={`/pazienti/${patient.id}`} className="group block rounded-xl outline-none">
      <Card className="flex-row items-center gap-4 p-4 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
        <Avatar className="size-11">
          <AvatarFallback className="bg-primary/10 font-medium text-primary">
            {initials(patient.firstName, patient.lastName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">
            {patient.lastName} {patient.firstName}
          </div>
          <div className="truncate text-sm text-muted-foreground">
            {patient.birthDate ? `${formatDate(patient.birthDate)} · ${age} anni` : 'Data di nascita non indicata'}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {patient.sex && <Badge variant="secondary">{SEX_LABELS[patient.sex]}</Badge>}
            {patient.bloodType && <Badge variant="outline">{patient.bloodType}</Badge>}
          </div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Card>
    </Link>
  );
}
