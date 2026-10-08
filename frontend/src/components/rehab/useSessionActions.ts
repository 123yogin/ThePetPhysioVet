import { useMutation, useQueryClient } from '@tanstack/react-query';
import { markSessionDone, skipSession, undoSession } from '../../api/treatment';
import { useFlash } from '../../lib/flash';

type Vars =
  | { kind: 'done'; id: string; doneOn?: string }
  | { kind: 'skip'; id: string; reason: string }
  | { kind: 'undo'; id: string };

/** One mutation for every tick/skip/undo control; refreshes every view that shows sessions. */
export function useSessionActions(onChanged?: () => void) {
  const qc = useQueryClient();
  const { addFlash } = useFlash();
  const mutation = useMutation({
    mutationFn: (v: Vars) => {
      if (v.kind === 'done') return markSessionDone(v.id, v.doneOn);
      if (v.kind === 'skip') return skipSession(v.id, v.reason);
      return undoSession(v.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treatmentPlans'] });
      qc.invalidateQueries({ queryKey: ['rehabToday'] });
      onChanged?.();
    },
    onError: (err: Error) => addFlash(err.message || 'Could not update the session', 'error'),
  });
  return {
    pending: mutation.isPending,
    pendingId: mutation.isPending ? mutation.variables?.id : undefined,
    done: (id: string, doneOn?: string) => mutation.mutate({ kind: 'done', id, doneOn }),
    skip: (id: string, reason: string) => mutation.mutate({ kind: 'skip', id, reason }),
    undo: (id: string) => mutation.mutate({ kind: 'undo', id }),
  };
}
