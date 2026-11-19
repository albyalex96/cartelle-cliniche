'use client';

import { LOG_LEVEL_LABELS, LOG_LEVELS, LOG_SOURCE_LABELS, type LogEntryDTO, type LogFilter, type LogLevel, type LogListDTO, type LogSource } from '@alby/shared';
import { Bug, CircleX, Download, Info, Pause, Play, Search, Server, Smartphone, Trash2, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { cn } from 'cn';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { clearLogsAction, exportLogsAction, listLogsAction } from '@/server/actions/logs';

const LIVE_EVERY_MS = 3000;
const PAGE = 200;
/** In pagina se ne tengono al massimo tante: le più vecchie escono (si ricaricano con "Carica precedenti"). */
const KEEP = 2000;

const LEVEL_STYLE: Record<LogLevel, { icon: LucideIcon; text: string; row: string }> = {
  debug: { icon: Bug, text: 'text-muted-foreground', row: '' },
  info: { icon: Info, text: 'text-sky-600 dark:text-sky-400', row: '' },
  warn: { icon: TriangleAlert, text: 'text-amber-600 dark:text-amber-400', row: 'bg-amber-500/5' },
  error: { icon: CircleX, text: 'text-red-600 dark:text-red-400', row: 'bg-red-500/5' },
};
const SOURCE_ICON: Record<LogSource, LucideIcon> = { server: Server, mobile: Smartphone };

const time = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'medium' });

function Entry({ e }: { e: LogEntryDTO }) {
  const [open, setOpen] = useState(false);
  const style = LEVEL_STYLE[e.level];
  const LevelIcon = style.icon;
  const SourceIcon = SOURCE_ICON[e.source];
  const hasDetails = !!e.details && Object.keys(e.details).length > 0;
  return (
    <li className={cn('border-b px-4 py-1.5 last:border-b-0', style.row)}>
      <button
        type="button"
        disabled={!hasDetails}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 text-left font-mono text-xs enabled:cursor-pointer"
      >
        <span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">{time.format(new Date(e.createdAt))}</span>
        <span className={cn('flex w-18 shrink-0 items-center gap-1 font-semibold', style.text)}>
          <LevelIcon className="size-3.5" />
          {LOG_LEVEL_LABELS[e.level]}
        </span>
        <SourceIcon className="mt-px size-3.5 shrink-0 text-muted-foreground" aria-label={LOG_SOURCE_LABELS[e.source]} />
        <span className="min-w-0 flex-1 break-words">
          {e.userName && <span className="text-muted-foreground">{e.userName} · </span>}
          {e.message}
        </span>
      </button>
      {open && hasDetails && (
        <pre className="mt-1 ml-4 overflow-x-auto rounded-md bg-muted p-2 font-mono text-[11px] text-muted-foreground">{JSON.stringify(e.details, null, 2)}</pre>
      )}
    </li>
  );
}

function download(text: string) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `log-${stamp}.txt` });
  a.click();
  URL.revokeObjectURL(url);
}

/** Log tecnici con filtri per livello, origine e testo, aggiornamento live, cancellazione ed esportazione. */
export function LogViewer({ initial }: { initial: LogListDTO }) {
  const [levels, setLevels] = useState<LogLevel[]>([...LOG_LEVELS]);
  const [source, setSource] = useState<LogSource | 'all'>('all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState(initial.items);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const first = useRef(true);

  // Tutti i livelli scelti = nessun filtro; nessuno scelto = nessuna voce.
  const filter: LogFilter = {
    levels: levels.length === LOG_LEVELS.length ? undefined : levels,
    source: source === 'all' ? undefined : source,
    q: q || undefined,
  };
  const filterKey = JSON.stringify(filter);
  const filtered = !!(filter.levels || filter.source || filter.q);

  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Filtro cambiato: si ricarica da capo.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (levels.length === 0) {
      setItems([]);
      setHasMore(false);
      return;
    }
    let current = true;
    setLoading(true);
    void listLogsAction({ ...(JSON.parse(filterKey) as LogFilter), limit: PAGE }).then((r) => {
      if (!current) return;
      setLoading(false);
      if (!r.ok) return void toast.error(r.message);
      setItems(r.data.items);
      setHasMore(r.data.hasMore);
    });
    return () => {
      current = false;
    };
  }, [filterKey, levels.length]);

  const newestId = items[0]?.id ?? 0;
  const poll = useCallback(async () => {
    if (levels.length === 0) return;
    const r = await listLogsAction({ ...(JSON.parse(filterKey) as LogFilter), after: newestId, limit: 500 });
    if (r.ok && r.data.items.length) setItems((prev) => [...r.data.items, ...prev].slice(0, KEEP));
  }, [filterKey, newestId, levels.length]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => void poll(), LIVE_EVERY_MS);
    return () => clearInterval(id);
  }, [live, poll]);

  const loadOlder = async () => {
    const oldest = items.at(-1)?.id;
    if (!oldest) return;
    setLoading(true);
    const r = await listLogsAction({ ...filter, before: oldest, limit: PAGE });
    setLoading(false);
    if (!r.ok) return void toast.error(r.message);
    setItems((prev) => [...prev, ...r.data.items]);
    setHasMore(r.data.hasMore);
  };

  const exportAll = () =>
    startTransition(async () => {
      const r = await exportLogsAction(filter);
      if (!r.ok) return void toast.error(r.message);
      if (!r.data.count) return void toast.info('Nessun log da esportare');
      download(r.data.text);
    });

  const clear = () =>
    startTransition(async () => {
      const r = await clearLogsAction(filter);
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.data.deleted === 1 ? '1 voce cancellata' : `${r.data.deleted} voci cancellate`);
      setItems([]);
      setHasMore(false);
      setConfirmOpen(false);
    });

  const toggleLevel = (level: LogLevel, on: boolean) =>
    setLevels((prev) => (on ? LOG_LEVELS.filter((l) => l === level || prev.includes(l)) : prev.filter((l) => l !== level)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <InputGroup className="max-w-sm">
          <InputGroupAddon>{loading ? <Spinner /> : <Search />}</InputGroupAddon>
          <InputGroupInput type="search" placeholder="Cerca nei log" aria-label="Cerca nei log" value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label="Cancella ricerca" onClick={() => setSearch('')}>
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        <fieldset className="flex flex-wrap items-center gap-4">
          <legend className="sr-only">Livelli</legend>
          {LOG_LEVELS.map((level) => {
            const { icon: Icon, text } = LEVEL_STYLE[level];
            return (
              <label key={level} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <Checkbox checked={levels.includes(level)} onCheckedChange={(v) => toggleLevel(level, v === true)} />
                <Icon className={cn('size-4', text)} />
                {LOG_LEVEL_LABELS[level]}
              </label>
            );
          })}
        </fieldset>
        <Select value={source} onValueChange={(v) => setSource(v as LogSource | 'all')}>
          <SelectTrigger className="w-40" aria-label="Origine">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Server e app</SelectItem>
            <SelectItem value="server">Solo server</SelectItem>
            <SelectItem value="mobile">Solo app</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Button variant={live ? 'secondary' : 'outline'} size="sm" onClick={() => setLive((l) => !l)} aria-pressed={live}>
            {live ? <Pause /> : <Play />}
            {live ? (
              <span className="flex items-center gap-1.5">
                <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
                Live
              </span>
            ) : (
              'In pausa'
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={exportAll} disabled={pending}>
            <Download />
            {filtered ? 'Esporta filtrati' : 'Esporta'}
          </Button>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                <Trash2 />
                {filtered ? 'Cancella filtrati' : 'Cancella'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{filtered ? 'Cancellare i log filtrati?' : 'Cancellare tutti i log?'}</AlertDialogTitle>
                <AlertDialogDescription>
                  {filtered
                    ? 'Verranno eliminate tutte le voci che corrispondono ai filtri scelti, anche quelle non mostrate.'
                    : 'Verranno eliminate tutte le voci, del server e delle app.'}{' '}
                  L’operazione non si può annullare.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Annulla</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={pending}
                  onClick={(e) => {
                    e.preventDefault();
                    clear();
                  }}
                >
                  {pending && <Spinner />}
                  Cancella
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Card className="py-0">
        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{levels.length === 0 ? 'Scegli almeno un livello.' : 'Nessun log.'}</p>
        ) : (
          <ul>
            {items.map((e) => (
              <Entry key={e.id} e={e} />
            ))}
          </ul>
        )}
      </Card>
      {hasMore && items.length > 0 && (
        <Button variant="outline" size="sm" className="self-center" onClick={() => void loadOlder()} disabled={loading}>
          {loading && <Spinner />}
          Carica precedenti
        </Button>
      )}
    </div>
  );
}
