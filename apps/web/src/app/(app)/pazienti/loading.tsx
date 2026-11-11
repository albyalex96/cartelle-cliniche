import { Skeleton } from '@/components/ui/skeleton';

/** Mostrato all'istante mentre il server prepara la pagina. */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-9 w-full max-w-md" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
