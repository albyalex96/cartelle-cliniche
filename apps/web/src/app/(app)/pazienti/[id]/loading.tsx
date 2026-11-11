import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <Skeleton className="h-5 w-24" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <Skeleton className="h-9 w-80" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
