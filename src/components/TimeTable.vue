<script setup lang="ts">
import { computed, ref } from 'vue'

import { fmtClock, fmtDayLabel, fmtHours, WORK_MODE_LABELS } from '@/lib/format'
import type { DailyLogDetail } from '@/types/db'

const props = defineProps<{
  rows: DailyLogDetail[]
  /** Adds the "Who" column — used on the admin's screens. */
  showIntern?: boolean
  /** Adds a per-row Edit control. Admin only; the database enforces that. */
  editable?: boolean
}>()

const emit = defineEmits<{ edit: [DailyLogDetail] }>()

type SortKey =
  | 'log_date'
  | 'intern_name'
  | 'clock_in'
  | 'clock_out'
  | 'break_minutes'
  | 'work_mode'
  | 'hours_worked'
  | 'status'

const sortKey = ref<SortKey>('log_date')
const sortDir = ref<'asc' | 'desc'>('desc')

type Column = {
  key: SortKey
  label: string
  align: 'left' | 'right'
  /** Secondary columns fold away before the ones people came to read. */
  cls?: string
}

/**
 * Eight columns do not fit a laptop pane. Rather than let Hours and Status —
 * the two anyone opens this table for — slide off the right edge, Break and
 * Where drop out below `lg` and come back when there is room. Sorting by a
 * hidden column still works; it is the header that is gone, not the data.
 */
const MINOR = 'hidden lg:table-cell'

const columns = computed(() =>
  (
    [
      { key: 'log_date', label: 'Day', align: 'left' },
      props.showIntern ? { key: 'intern_name', label: 'Who', align: 'left' } : null,
      { key: 'clock_in', label: 'In', align: 'left' },
      { key: 'clock_out', label: 'Out', align: 'left' },
      { key: 'break_minutes', label: 'Break', align: 'left', cls: MINOR },
      { key: 'work_mode', label: 'Where', align: 'left', cls: MINOR },
      { key: 'hours_worked', label: 'Hours', align: 'right' },
      { key: 'status', label: 'Status', align: 'left' },
    ] as (Column | null)[]
  ).filter((c): c is Column => c !== null),
)

function statusRank(row: DailyLogDetail): number {
  if (row.status === 'open') return 0
  return row.reviewed_at ? 2 : 1
}

function statusLabel(row: DailyLogDetail): string {
  if (row.status === 'open') return 'Open'
  return row.reviewed_at ? 'Reviewed' : 'Submitted'
}

/** Minutes since local midnight. */
function timeOfDay(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * Sorting In/Out by time of day rather than by absolute instant. Absolute
 * order would just reproduce the Day column; time of day answers the question
 * someone actually opens this table with — who starts late, who runs long.
 */
function valueOf(row: DailyLogDetail, key: SortKey): number | string | null {
  switch (key) {
    case 'intern_name':
      return row.intern_name ?? ''
    case 'clock_in':
      return timeOfDay(row.clock_in)
    case 'clock_out':
      return timeOfDay(row.clock_out)
    case 'break_minutes':
      return row.break_minutes
    case 'work_mode':
      return WORK_MODE_LABELS[row.work_mode] ?? row.work_mode
    case 'hours_worked':
      return row.hours_worked === null ? null : Number(row.hours_worked)
    case 'status':
      return statusRank(row)
    default:
      return row.log_date
  }
}

const sorted = computed(() => {
  const dir = sortDir.value === 'asc' ? 1 : -1
  // Copy first: Array.prototype.sort mutates, and these rows belong to a store.
  return [...props.rows].sort((a, b) => {
    const x = valueOf(a, sortKey.value)
    const y = valueOf(b, sortKey.value)
    // A day that is still open has no clock-out and no hours. Those rows sink
    // to the bottom either way rather than pretending to be zero.
    if (x === null && y === null) return 0
    if (x === null) return 1
    if (y === null) return -1
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir
    return String(x).localeCompare(String(y)) * dir
  })
})

const total = computed(() => props.rows.reduce((sum, r) => sum + Number(r.hours_worked ?? 0), 0))

function toggle(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = key
  // Dates and hours read most usefully largest-first; names do not.
  sortDir.value = key === 'log_date' || key === 'hours_worked' ? 'desc' : 'asc'
}

function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
  if (sortKey.value !== key) return 'none'
  return sortDir.value === 'asc' ? 'ascending' : 'descending'
}
</script>

<template>
  <div class="card">
    <div class="overflow-x-auto">
      <table class="min-w-full whitespace-nowrap text-left text-[14px]">
        <caption class="sr-only">
          Time rendered, sortable by any column
        </caption>
        <thead class="border-b border-line">
          <tr class="label text-faint">
            <th
              v-for="c in columns"
              :key="c.key"
              scope="col"
              :aria-sort="ariaSort(c.key)"
              class="font-semibold"
              :class="[c.align === 'right' ? 'text-right' : 'text-left', c.cls]"
            >
              <button
                type="button"
                class="inline-flex w-full items-center gap-1 px-3 py-3 transition-colors hover:text-ink lg:px-4"
                :class="[
                  c.align === 'right' ? 'justify-end' : 'justify-start',
                  sortKey === c.key ? 'text-agent' : '',
                ]"
                @click="toggle(c.key)"
              >
                {{ c.label }}
                <svg
                  v-if="sortKey === c.key"
                  viewBox="0 0 24 24"
                  class="h-3 w-3 shrink-0"
                  :class="sortDir === 'asc' ? '' : 'rotate-180'"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 15 6-6 6 6" />
                </svg>
              </button>
            </th>
            <th v-if="editable" scope="col" class="px-3 py-3 text-right">
              <span class="sr-only">Actions</span>
            </th>
          </tr>
        </thead>

        <tbody>
          <tr v-for="l in sorted" :key="l.id" class="border-b border-line last:border-0">
            <td class="px-3 py-3 font-medium text-ink lg:px-4">{{ fmtDayLabel(l.log_date) }}</td>
            <td v-if="showIntern" class="px-3 py-3 text-muted lg:px-4">{{ l.intern_name }}</td>
            <td class="px-3 py-3 font-mono text-muted lg:px-4">{{ fmtClock(l.clock_in) }}</td>
            <td class="px-3 py-3 font-mono text-muted lg:px-4">{{ fmtClock(l.clock_out) }}</td>
            <td class="hidden px-3 py-3 text-muted lg:table-cell lg:px-4">
              {{ l.break_minutes }}m
            </td>
            <td class="hidden px-3 py-3 text-muted lg:table-cell lg:px-4">
              {{ WORK_MODE_LABELS[l.work_mode] }}
            </td>
            <td class="px-3 py-3 text-right font-mono text-ink lg:px-4">
              {{ fmtHours(l.hours_worked) }}
            </td>
            <td class="px-3 py-3 lg:px-4">
              <span
                class="whitespace-nowrap rounded-pill px-2.5 py-1 text-[12px] font-medium"
                :class="
                  l.status === 'open'
                    ? 'bg-warnSoft text-warn'
                    : l.reviewed_at
                      ? 'bg-accentSoft text-ink'
                      : 'bg-okSoft text-ok'
                "
              >
                {{ statusLabel(l) }}
              </span>
            </td>
            <td v-if="editable" class="px-3 py-3 text-right lg:px-4">
              <button
                type="button"
                class="rounded-pill border border-line px-3 py-1 text-[13px] text-muted transition-colors hover:border-brand hover:text-brand"
                @click="emit('edit', l)"
              >
                Edit
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Outside the scroll area on purpose: the total should not be something
         you have to scroll sideways to discover. A colspan cannot follow
         columns that come and go with the breakpoint, either. -->
    <div class="flex items-baseline justify-between border-t border-line px-3 py-3 lg:px-4">
      <span class="text-[14px] font-semibold text-ink">
        {{ rows.length }} {{ rows.length === 1 ? 'day' : 'days' }}
      </span>
      <span class="font-mono text-[14px] font-semibold text-ink">{{ total.toFixed(2) }} h</span>
    </div>
  </div>
</template>
