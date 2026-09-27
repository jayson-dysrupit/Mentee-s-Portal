<script setup lang="ts">
import { ref, watch } from 'vue'

import { fmtClock, fmtDate } from '@/lib/format'
import type { LogAdjustment } from '@/types/db'

const props = defineProps<{ open: boolean; adjustments: LogAdjustment[] }>()
const emit = defineEmits<{ close: [] }>()

// A native <dialog> again: focus trap, Escape and page inertness for free.
// Positioned as a right-hand sheet rather than the default centred box.
const el = ref<HTMLDialogElement | null>(null)

watch(
  () => props.open,
  (open) => {
    if (open) el.value?.showModal()
    else el.value?.close()
  },
)

const FIELD_LABELS: Record<string, string> = {
  clock_in: 'Clock in',
  clock_out: 'Clock out',
  break_minutes: 'Break',
}

/** '2026-09-24 09:02:00+00' is not reliably parseable; normalise it first. */
function fmtValue(a: LogAdjustment, raw: string | null): string {
  if (!raw) return '—'
  if (a.field === 'break_minutes') return `${raw}m`
  const iso = raw.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleString()
}

/** What the deleted day held, read back out of the snapshot. */
function snapshotSummary(a: LogAdjustment): string {
  const snap = a.snapshot
  if (!snap) return 'no snapshot'
  const inAt = snap.clock_in ? fmtClock(String(snap.clock_in)) : '—'
  const outAt = snap.clock_out ? fmtClock(String(snap.clock_out)) : 'still open'
  return `${inAt}–${outAt}, ${snap.break_minutes ?? 0}m break`
}
</script>

<template>
  <dialog
    ref="el"
    class="sheet m-0 h-full max-h-full w-[min(30rem,100vw)] border-l border-line bg-surface p-0 text-ink backdrop:bg-ink/40"
    @close="emit('close')"
    @cancel="emit('close')"
  >
    <div class="flex h-full flex-col">
      <div class="flex items-start gap-3 border-b border-line p-5">
        <div class="flex-1">
          <h2 class="card-title">Corrections</h2>
          <p class="body-text mt-1 text-[13px]">
            Every clock time an admin changed and every day they deleted. Written by the database,
            so it covers edits made anywhere.
          </p>
        </div>
        <button
          type="button"
          class="rounded-pill border border-line px-2.5 py-1.5 text-muted transition-colors hover:bg-canvas"
          aria-label="Close corrections"
          @click="emit('close')"
        >
          <svg
            viewBox="0 0 24 24"
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-5">
        <p v-if="!adjustments.length" class="text-[15px] text-faint">
          Nothing has been corrected or deleted yet.
        </p>

        <ol v-else class="space-y-3">
          <li v-for="a in adjustments" :key="a.id" class="border-b border-line pb-3 last:border-0">
            <div class="flex flex-wrap items-baseline gap-x-2">
              <span class="text-[15px] font-medium text-ink">{{ a.intern_name }}</span>
              <span class="text-[13px] text-faint">{{ fmtDate(a.log_date) }}</span>
              <span
                v-if="a.action === 'delete'"
                class="label rounded-pill bg-warnSoft px-2 py-0.5 text-warn"
              >
                Day deleted
              </span>
              <span v-else class="label text-agent">
                {{ a.field ? (FIELD_LABELS[a.field] ?? a.field) : 'Changed' }}
              </span>
            </div>

            <p class="mt-1 font-mono text-[13px]">
              <span class="text-muted line-through">
                {{ a.action === 'delete' ? snapshotSummary(a) : fmtValue(a, a.old_value) }}
              </span>
              <span v-if="a.action !== 'delete'" class="text-ink">
                → {{ fmtValue(a, a.new_value) }}
              </span>
            </p>

            <p v-if="a.reason" class="mt-1 text-[14px] text-muted">"{{ a.reason }}"</p>
            <p class="mt-1 text-[12px] text-faint">
              {{ a.changed_by_name ?? 'Unknown' }} ·
              {{ new Date(a.created_at).toLocaleString() }}
            </p>
          </li>
        </ol>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
/* A dialog is centred by default; pin it to the right edge instead. */
.sheet {
  position: fixed;
  inset: 0 0 0 auto;
  max-width: none;
}
.sheet[open] {
  animation: slide-in 180ms ease-out;
}
@keyframes slide-in {
  from {
    transform: translateX(100%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .sheet[open] {
    animation: none;
  }
}
</style>
