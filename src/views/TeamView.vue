<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import CalendarMonth from '@/components/CalendarMonth.vue'
import JournalCard from '@/components/JournalCard.vue'
import NoticeBar from '@/components/NoticeBar.vue'
import TimeEditDialog from '@/components/TimeEditDialog.vue'
import TimeTable from '@/components/TimeTable.vue'
import { downloadCsv, toCsv } from '@/lib/csv'
import { fmtClock, fmtDate, fmtDayLabel, fmtHours, toLocalInput } from '@/lib/format'
import { WORK_MODE_LABELS } from '@/lib/format'
import { useTeamStore } from '@/stores/team'
import type { DailyLogDetail, LogAdjustment, TimeAdjustment } from '@/types/db'

const team = useTeamStore()
const onlyUnreviewed = ref(true)
/** Mentee id being drilled into; null means everyone. */
const selected = ref<string | null>(null)
const view = ref<'table' | 'calendar'>('table')
const selectedDay = ref<string | null>(null)
const editing = ref<DailyLogDetail | null>(null)
const saving = ref(false)
const exportMonth = ref(new Date().toISOString().slice(0, 7))

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
  return onlyUnreviewed.value
    ? written.filter((l) => l.status === 'submitted' && !l.reviewed_at)
    : written
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

async function onReview(logId: string, comment: string) {
  await team.review(logId, comment)
}

async function onSaveAdjustment(patch: TimeAdjustment) {
  if (!editing.value) return
  saving.value = true
  const ok = await team.adjustTimes(editing.value.id, patch)
  saving.value = false
  if (ok) editing.value = null
}

/** '2026-09-24 09:02:00+00' is not reliably parseable; normalise it first. */
function fmtAuditValue(a: LogAdjustment, raw: string | null): string {
  if (!raw) return '—'
  if (a.field === 'break_minutes') return `${raw}m`
  const iso = raw.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleString()
}

const FIELD_LABELS: Record<string, string> = {
  clock_in: 'Clock in',
  clock_out: 'Clock out',
  break_minutes: 'Break',
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
    'Reviewed',
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
    l.status === 'open' ? 'Open' : l.reviewed_at ? 'Reviewed' : 'Submitted',
    l.reviewed_at ? csvStamp(l.reviewed_at) : '',
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
    <h1 class="text-[34px] font-bold leading-tight tracking-[-0.02em]">
      Your <span class="accent-word">mentees</span>
    </h1>
    <p class="body-text mt-2">
      {{ team.interns.length }} assigned · {{ team.unreviewed.length }} entries awaiting review
    </p>

    <NoticeBar :message="team.error" tone="error" class="mt-5" />

    <div v-if="team.loading" class="mt-8 text-[14px] text-faint">Loading…</div>

    <template v-else>
      <p v-if="!team.interns.length" class="card mt-8 p-8 text-center text-[15px] text-faint">
        No mentees are visible to you yet. A supervisor sees only the people whose
        <span class="font-mono">profiles.supervisor_id</span> points at them; an admin sees
        everyone.
      </p>

      <div v-else class="mt-8 grid gap-3 sm:grid-cols-2">
        <!-- A button, not a div: selecting a mentee is a real control and
             should be reachable by keyboard like any other. -->
        <button
          v-for="i in team.interns"
          :key="i.id"
          type="button"
          :aria-pressed="selected === i.id"
          class="card p-5 text-left transition-colors"
          :class="selected === i.id ? 'border-brand ring-1 ring-brand' : 'hover:border-faint/40'"
          @click="select(i.id)"
        >
          <div class="flex items-baseline justify-between gap-3">
            <p class="card-title">{{ i.full_name }}</p>
            <span v-if="i.days_open" class="label text-warn">{{ i.days_open }} open</span>
          </div>
          <p class="mt-0.5 text-[13px] text-faint">{{ i.email }}</p>

          <div class="mt-4 flex items-end gap-1.5">
            <span class="font-mono text-[24px] font-medium leading-none text-ink">
              {{ Number(i.hours_logged).toFixed(1) }}
            </span>
            <span v-if="i.required_hours" class="text-[14px] text-faint">
              / {{ Number(i.required_hours).toFixed(0) }} h
            </span>
            <span v-else class="text-[14px] text-faint">h</span>
          </div>

          <div v-if="i.required_hours" class="mt-2 h-1.5 overflow-hidden rounded-pill bg-line">
            <div
              class="h-full rounded-pill bg-brand"
              :style="{
                width: `${Math.min(100, (Number(i.hours_logged) / Number(i.required_hours)) * 100)}%`,
              }"
            />
          </div>
          <p v-else class="mt-2 text-[12px] text-faint">No hour target set</p>

          <dl class="mt-4 flex gap-5 text-[13px]">
            <div>
              <dt class="text-faint">Days</dt>
              <dd class="font-mono text-ink">{{ i.days_logged }}</dd>
            </div>
            <div>
              <dt class="text-faint">To review</dt>
              <dd class="font-mono" :class="i.awaiting_review ? 'text-warn' : 'text-ink'">
                {{ i.awaiting_review }}
              </dd>
            </div>
            <div>
              <dt class="text-faint">Last log</dt>
              <dd class="text-ink">{{ fmtDate(i.last_log_date) }}</dd>
            </div>
          </dl>

          <p class="mt-3 text-[13px] font-medium text-brand">
            {{
              selected === i.id
                ? 'Showing only this mentee — click to clear'
                : 'View only this mentee →'
            }}
          </p>
        </button>
      </div>

      <!-- Scope banner, so it is never ambiguous whose numbers are on screen. -->
      <div
        v-if="selectedMentee"
        class="mt-10 flex flex-wrap items-center gap-3 rounded-card border border-brand bg-brandSoft px-5 py-3"
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
          <!-- min-w stops the controls squeezing the heading until it wraps
               mid-phrase; below that width they take a line of their own. -->
          <div class="min-w-[14rem] flex-1">
            <h2 class="text-[24px] font-semibold tracking-[-0.01em]">Time rendered</h2>
            <p class="body-text mt-1 text-[14px]">
              {{
                view === 'table'
                  ? 'Click any column heading to sort.'
                  : 'Each day shows how many turned up and the hours they logged. Pick a day for the roster.'
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
              :title="
                exportRows.length
                  ? `Export ${exportRows.length} rows as CSV`
                  : 'Nothing logged in that month'
              "
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

      <section v-if="team.adjustments.length" class="mt-12">
        <h2 class="text-[24px] font-semibold tracking-[-0.01em]">Corrections</h2>
        <p class="body-text mt-1 text-[14px]">
          Every change an admin made to a clock time. Written by the database, so it covers edits
          made anywhere — not only the ones made on this page.
        </p>

        <ul class="mt-5 space-y-2">
          <li
            v-for="a in team.adjustments"
            :key="a.id"
            class="card flex flex-wrap items-baseline gap-x-3 gap-y-1 p-4"
          >
            <span class="text-[15px] font-medium text-ink">{{ a.intern_name }}</span>
            <span class="text-[14px] text-faint">{{ fmtDate(a.log_date) }}</span>
            <span class="label text-agent">{{ FIELD_LABELS[a.field] ?? a.field }}</span>
            <span class="font-mono text-[13px] text-muted line-through">
              {{ fmtAuditValue(a, a.old_value) }}
            </span>
            <span class="font-mono text-[13px] text-ink"
              >→ {{ fmtAuditValue(a, a.new_value) }}</span
            >
            <span class="flex-1" />
            <span class="text-[13px] text-faint">
              {{ a.changed_by_name }} · {{ new Date(a.created_at).toLocaleString() }}
            </span>
            <p v-if="a.reason" class="w-full text-[14px] text-muted">"{{ a.reason }}"</p>
          </li>
        </ul>
      </section>

      <section class="mt-12">
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="text-[24px] font-semibold tracking-[-0.01em]">Learning entries</h2>
          <span class="flex-1" />
          <button
            type="button"
            class="rounded-pill border px-3.5 py-1.5 text-[13px] transition-colors"
            :class="
              onlyUnreviewed
                ? 'border-brand bg-brandSoft font-medium text-agent'
                : 'border-line bg-surface text-muted hover:bg-canvas'
            "
            @click="onlyUnreviewed = !onlyUnreviewed"
          >
            {{ onlyUnreviewed ? 'Awaiting review' : 'All entries' }}
          </button>
        </div>

        <p v-if="!entries.length" class="card mt-5 p-8 text-center text-[15px] text-faint">
          {{ onlyUnreviewed ? 'Nothing waiting on you. Nice.' : 'No entries yet.' }}
        </p>

        <div v-else class="mt-5 space-y-4">
          <JournalCard
            v-for="l in entries"
            :key="l.id"
            :log="l"
            show-intern
            reviewable
            @review="(c) => onReview(l.id, c)"
          />
        </div>
      </section>
    </template>

    <TimeEditDialog
      :log="editing"
      :busy="saving"
      @save="onSaveAdjustment"
      @close="editing = null"
    />
  </main>
</template>
