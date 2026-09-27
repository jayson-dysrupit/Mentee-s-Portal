<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import CalendarMonth from '@/components/CalendarMonth.vue'
import CorrectionsPanel from '@/components/CorrectionsPanel.vue'
import JournalCard from '@/components/JournalCard.vue'
import MenteeTable from '@/components/MenteeTable.vue'
import NoticeBar from '@/components/NoticeBar.vue'
import TimeEditDialog from '@/components/TimeEditDialog.vue'
import TimeTable from '@/components/TimeTable.vue'
import { downloadCsv, toCsv } from '@/lib/csv'
import { fmtClock, fmtDayLabel, fmtHours, toLocalInput, WORK_MODE_LABELS } from '@/lib/format'
import { useTeamStore } from '@/stores/team'
import type { DailyLogDetail, TimeAdjustment } from '@/types/db'

const team = useTeamStore()
/** Mentee id being drilled into; null means everyone. */
const selected = ref<string | null>(null)
const view = ref<'table' | 'calendar'>('table')
const selectedDay = ref<string | null>(null)
const editing = ref<DailyLogDetail | null>(null)
const saving = ref(false)
const correctionsOpen = ref(false)
const exportMonth = ref(new Date().toISOString().slice(0, 7))

/**
 * Defaults to everything. Replying is a reading habit, not an approval queue —
 * nothing is gated on it and hours count either way — so opening on a filtered
 * subset overstated the obligation.
 */
const entryFilter = ref<'all' | 'needs-reply'>('all')

onMounted(() => {
  void team.load()
  void team.loadAdjustments()
})

const selectedMentee = computed(() => team.interns.find((i) => i.id === selected.value) ?? null)

/** Every row for whoever is in scope — the time table wants open days too. */
const scoped = computed(() =>
  selected.value ? team.logs.filter((l) => l.intern_id === selected.value) : team.logs,
)

/** The journal is the subset that actually carries a reflection. */
const entries = computed(() => {
  const written = scoped.value.filter((l) => (l.learned ?? '').trim().length > 0)
  return entryFilter.value === 'needs-reply'
    ? written.filter((l) => l.status === 'submitted' && !l.replied_at)
    : written
})

/** Grouped by day, newest first — a flat list of twenty cards reads as noise. */
const entryDays = computed(() => {
  const m = new Map<string, DailyLogDetail[]>()
  for (const l of entries.value) {
    const list = m.get(l.log_date)
    if (list) list.push(l)
    else m.set(l.log_date, [l])
  }
  return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
})

function select(id: string) {
  selected.value = selected.value === id ? null : id
}

/** Several interns share a date, so each day holds a list rather than a row. */
const byDay = computed(() => {
  const m = new Map<string, DailyLogDetail[]>()
  for (const l of scoped.value) {
    const list = m.get(l.log_date)
    if (list) list.push(l)
    else m.set(l.log_date, [l])
  }
  return m
})

const anchor = computed(() => scoped.value[0]?.log_date ?? null)

/** How many people could have turned up — the denominator in each cell. */
const expected = computed(() => (selected.value ? 1 : team.interns.length))

function dayHours(iso: string): number {
  return (byDay.value.get(iso) ?? []).reduce((sum, l) => sum + Number(l.hours_worked ?? 0), 0)
}

const present = computed(() =>
  selectedDay.value ? (byDay.value.get(selectedDay.value) ?? []) : [],
)

/** Named, not just counted: "who is missing" is the useful half of attendance. */
const absent = computed(() => {
  if (!selectedDay.value) return []
  const here = new Set(present.value.map((l) => l.intern_id))
  const roster = selected.value ? team.interns.filter((i) => i.id === selected.value) : team.interns
  return roster.filter((i) => !here.has(i.id))
})

async function onReply(logId: string, comment: string) {
  await team.reply(logId, comment)
}

async function onDeleteLog(reason: string) {
  if (!editing.value) return
  saving.value = true
  const ok = await team.deleteLog(editing.value.id, reason)
  saving.value = false
  if (ok) editing.value = null
}

async function onSaveAdjustment(patch: TimeAdjustment) {
  if (!editing.value) return
  saving.value = true
  const ok = await team.adjustTimes(editing.value.id, patch)
  saving.value = false
  if (ok) editing.value = null
}

/** Local 'YYYY-MM-DD HH:MM' — a spreadsheet parses it, unlike an ISO Z string. */
function csvStamp(iso: string | null): string {
  return iso ? toLocalInput(new Date(iso)).replace('T', ' ') : ''
}

const exportRows = computed(() =>
  scoped.value
    .filter((l) => l.log_date.startsWith(exportMonth.value))
    .slice()
    .sort(
      (a, b) => a.log_date.localeCompare(b.log_date) || a.intern_name.localeCompare(b.intern_name),
    ),
)

function exportCsv() {
  const headers = [
    'Intern',
    'Email',
    'Date',
    'Clock in',
    'Clock out',
    'Break (min)',
    'Mode',
    'Hours',
    'Status',
    'Replied',
    'Skills',
    'Worked on',
    'Learned',
  ]
  const rows = exportRows.value.map((l) => [
    l.intern_name,
    l.intern_email,
    l.log_date,
    csvStamp(l.clock_in),
    csvStamp(l.clock_out),
    l.break_minutes,
    WORK_MODE_LABELS[l.work_mode] ?? l.work_mode,
    // Bare number, not "8.13 h" — the column has to sum in a spreadsheet.
    l.hours_worked === null ? '' : Number(l.hours_worked).toFixed(2),
    l.status === 'open' ? 'Open' : 'Closed',
    l.replied_at ? csvStamp(l.replied_at) : '',
    l.skills.join('; '),
    l.worked_on ?? '',
    l.learned ?? '',
  ])
  const who = selectedMentee.value
    ? selectedMentee.value.full_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    : 'all-interns'
  downloadCsv(`time-log-${exportMonth.value}-${who}.csv`, toCsv(headers, rows))
}
</script>

<template>
  <main class="mx-auto max-w-5xl px-6 py-10">
    <div class="flex flex-wrap items-start gap-4">
      <div class="min-w-[14rem] flex-1">
        <h1 class="text-[34px] font-bold leading-tight tracking-[-0.02em]">
          Your <span class="accent-word">mentees</span>
        </h1>
        <p class="body-text mt-2">
          {{ team.interns.length }} {{ team.interns.length === 1 ? 'intern' : 'interns' }} ·
          {{ team.needsReply.length }} entries with no reply yet
        </p>
      </div>

      <button
        type="button"
        class="btn-ghost !px-4 !py-2 !text-[14px]"
        :aria-expanded="correctionsOpen"
        aria-controls="corrections-panel"
        @click="correctionsOpen = true"
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
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
        Corrections
        <span v-if="team.adjustments.length" class="text-faint">
          ({{ team.adjustments.length }})
        </span>
      </button>
    </div>

    <NoticeBar :message="team.error" tone="error" class="mt-5" />

    <div v-if="team.loading" class="mt-8 text-[14px] text-faint">Loading…</div>

    <template v-else>
      <p v-if="!team.interns.length" class="card mt-8 p-8 text-center text-[15px] text-faint">
        No interns have signed up yet. Every admin sees every intern — new accounts arrive as
        interns on their first sign-in, and appear here once they do.
      </p>

      <MenteeTable
        v-else
        :interns="team.interns"
        :selected="selected"
        class="mt-8"
        @select="select"
      />

      <!-- Scope banner, so it is never ambiguous whose numbers are on screen. -->
      <div
        v-if="selectedMentee"
        class="mt-5 flex flex-wrap items-center gap-3 rounded-card border border-brand bg-brandSoft px-5 py-3"
      >
        <span class="label text-agent">Filtered</span>
        <span class="text-[15px] text-ink">
          Showing {{ selectedMentee.full_name }} only — {{ scoped.length }}
          {{ scoped.length === 1 ? 'day' : 'days' }} logged.
        </span>
        <span class="flex-1" />
        <button
          type="button"
          class="text-[14px] font-medium text-brand hover:text-brandHover"
          @click="selected = null"
        >
          Show everyone
        </button>
      </div>

      <section class="mt-10">
        <div class="flex flex-wrap items-start gap-4">
          <div class="min-w-[14rem] flex-1">
            <h2 class="text-[24px] font-semibold tracking-[-0.01em]">Time rendered</h2>
            <p class="body-text mt-1 text-[14px]">
              {{
                view === 'table'
                  ? 'Click any column heading to sort. Edit corrects a clock time.'
                  : 'Each day shows how many turned up. Pick a day for the roster.'
              }}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-2">
              <span class="sr-only">Month to export</span>
              <input v-model="exportMonth" type="month" class="field !w-auto !py-2 !text-[14px]" />
            </label>
            <button
              type="button"
              class="btn-ghost !px-4 !py-2 !text-[14px]"
              :disabled="!exportRows.length"
              @click="exportCsv"
            >
              Export CSV
              <span v-if="exportRows.length" class="text-faint">({{ exportRows.length }})</span>
            </button>
          </div>

          <div class="flex gap-1 rounded-pill border border-line bg-surface p-1">
            <button
              v-for="v in [
                { key: 'table' as const, label: 'Table' },
                { key: 'calendar' as const, label: 'Calendar' },
              ]"
              :key="v.key"
              type="button"
              class="rounded-pill px-4 py-1.5 text-[14px] transition-colors"
              :class="
                view === v.key
                  ? 'bg-brandSoft font-medium text-agent'
                  : 'text-muted hover:bg-canvas'
              "
              @click="view = v.key"
            >
              {{ v.label }}
            </button>
          </div>
        </div>

        <p v-if="!scoped.length" class="card mt-5 p-8 text-center text-[15px] text-faint">
          No days logged yet.
        </p>

        <TimeTable
          v-else-if="view === 'table'"
          :rows="scoped"
          show-intern
          editable
          class="mt-5"
          @edit="editing = $event"
        />

        <template v-else>
          <CalendarMonth v-model:selected="selectedDay" :anchor="anchor" selectable class="mt-5">
            <template #day="{ iso }">
              <template v-if="byDay.get(iso)?.length">
                <span
                  class="mt-1 block rounded-card bg-brandSoft px-1.5 py-0.5 text-center text-[11px] font-semibold text-agent"
                >
                  {{ byDay.get(iso)!.length }}/{{ expected }} in
                </span>
                <span class="mt-0.5 block text-center font-mono text-[11px] text-muted">
                  {{ dayHours(iso).toFixed(1) }}h
                </span>
              </template>
            </template>
          </CalendarMonth>

          <div v-if="selectedDay" class="card mt-4 p-5">
            <div class="flex flex-wrap items-baseline gap-x-3">
              <h3 class="card-title">{{ fmtDayLabel(selectedDay) }}</h3>
              <span class="text-[14px] text-muted">
                {{ present.length }} of {{ expected }} present ·
                {{ dayHours(selectedDay).toFixed(2) }} h logged
              </span>
              <span class="flex-1" />
              <button
                type="button"
                class="text-[14px] font-medium text-brand hover:text-brandHover"
                @click="selectedDay = null"
              >
                Clear day
              </button>
            </div>

            <ul v-if="present.length" class="mt-4 space-y-2">
              <li
                v-for="l in present"
                :key="l.id"
                class="flex flex-wrap items-baseline gap-x-3 border-b border-line pb-2 last:border-0 last:pb-0"
              >
                <span class="text-[15px] font-medium text-ink">{{ l.intern_name }}</span>
                <span class="font-mono text-[13px] text-faint">
                  {{ fmtClock(l.clock_in) }}–{{ fmtClock(l.clock_out) }}
                </span>
                <span class="flex-1" />
                <span
                  v-if="l.status === 'open'"
                  class="rounded-pill bg-warnSoft px-2.5 py-1 text-[12px] font-medium text-warn"
                >
                  Still clocked in
                </span>
                <span v-else class="font-mono text-[14px] text-ink">
                  {{ fmtHours(l.hours_worked) }}
                </span>
              </li>
            </ul>
            <p v-else class="mt-3 text-[15px] text-faint">Nobody logged time on this day.</p>

            <div v-if="absent.length" class="mt-4 border-t border-line pt-3">
              <p class="label text-faint">Not in</p>
              <p class="mt-1 text-[15px] text-muted">
                {{ absent.map((i) => i.full_name).join(', ') }}
              </p>
            </div>
          </div>
        </template>
      </section>

      <section class="mt-12">
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="text-[24px] font-semibold tracking-[-0.01em]">Learning entries</h2>
          <span class="flex-1" />
          <div class="flex gap-1 rounded-pill border border-line bg-surface p-1">
            <button
              v-for="f in [
                { key: 'all' as const, label: 'All' },
                { key: 'needs-reply' as const, label: `No reply (${team.needsReply.length})` },
              ]"
              :key="f.key"
              type="button"
              class="rounded-pill px-3.5 py-1.5 text-[13px] transition-colors"
              :class="
                entryFilter === f.key
                  ? 'bg-brandSoft font-medium text-agent'
                  : 'text-muted hover:bg-canvas'
              "
              @click="entryFilter = f.key"
            >
              {{ f.label }}
            </button>
          </div>
        </div>

        <p v-if="!entryDays.length" class="card mt-5 p-8 text-center text-[15px] text-faint">
          {{
            entryFilter === 'needs-reply'
              ? 'You have replied to everything. Nice.'
              : 'No entries yet.'
          }}
        </p>

        <!-- Grouped by day: a flat run of cards gives no sense of when. -->
        <div v-else class="mt-5 space-y-8">
          <section v-for="[date, dayEntries] in entryDays" :key="date">
            <div class="mb-3 flex items-baseline gap-2 border-b border-line pb-1.5">
              <h3 class="text-[15px] font-semibold text-ink">{{ fmtDayLabel(date) }}</h3>
              <span class="text-[13px] text-faint">
                {{ dayEntries.length }} {{ dayEntries.length === 1 ? 'entry' : 'entries' }}
              </span>
            </div>
            <div class="space-y-3">
              <JournalCard
                v-for="l in dayEntries"
                :key="l.id"
                :log="l"
                show-intern
                hide-date
                replyable
                @reply="(c) => onReply(l.id, c)"
              />
            </div>
          </section>
        </div>
      </section>
    </template>

    <CorrectionsPanel
      id="corrections-panel"
      :open="correctionsOpen"
      :adjustments="team.adjustments"
      @close="correctionsOpen = false"
    />

    <TimeEditDialog
      :log="editing"
      :busy="saving"
      @save="onSaveAdjustment"
      @remove="onDeleteLog"
      @close="editing = null"
    />
  </main>
</template>
