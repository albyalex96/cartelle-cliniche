import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

export function FullScreenLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

/** Segnaposto mostrato mentre si scarica il codice di una pagina. */
export function PageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-9 w-full max-w-sm" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
