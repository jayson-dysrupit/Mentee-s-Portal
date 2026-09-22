<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import CalendarMonth from '@/components/CalendarMonth.vue'
import NoticeBar from '@/components/NoticeBar.vue'
import TimeTable from '@/components/TimeTable.vue'
import { useLogsStore } from '@/stores/logs'
import type { DailyLogDetail } from '@/types/db'

const logs = useLogsStore()
const view = ref<'table' | 'calendar'>('table')

onMounted(() => void logs.loadMine())

/** One record per day is a schema guarantee, so a plain Map is enough. */
const byDate = computed(() => {
  const m = new Map<string, DailyLogDetail>()
  for (const l of logs.mine) m.set(l.log_date, l)
  return m
})

/** Open the calendar on the month of the most recent entry, not always today. */
const anchor = computed(() => logs.mine[0]?.log_date ?? null)
</script>

<template>
  <main class="mx-auto max-w-4xl px-6 py-10">
    <div class="flex flex-wrap items-start gap-4">
      <div class="flex-1">
        <h1 class="text-[34px] font-bold leading-tight tracking-[-0.02em]">
          Time <span class="accent-word">log</span>
        </h1>
        <p class="body-text mt-2">
          {{ logs.daysLogged }} days · {{ logs.totalHours.toFixed(2) }} hours total
        </p>
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
            view === v.key ? 'bg-brandSoft font-medium text-agent' : 'text-muted hover:bg-canvas'
          "
          @click="view = v.key"
        >
          {{ v.label }}
        </button>
      </div>
    </div>

    <NoticeBar :message="logs.error" tone="error" class="mt-5" />

    <div v-if="logs.loading" class="mt-8 text-[14px] text-faint">Loading…</div>

    <p v-else-if="!logs.mine.length" class="card mt-8 p-8 text-center text-[15px] text-faint">
      Nothing logged yet. Clock in from the Today tab and your days will appear here.
    </p>

    <TimeTable v-else-if="view === 'table'" :rows="logs.mine" class="mt-8" />

    <CalendarMonth v-else :anchor="anchor" class="mt-8">
      <template #day="{ iso }">
        <template v-if="byDate.get(iso)">
          <span
            v-if="byDate.get(iso)!.status === 'open'"
            class="mt-1 block rounded-card bg-warnSoft px-1.5 py-1 text-[11px] font-medium text-warn"
          >
            Open
          </span>
          <span
            v-else
            class="mt-1 block rounded-card bg-okSoft px-1.5 py-1 text-center font-mono text-[12px] font-medium text-ok"
          >
            {{ Number(byDate.get(iso)!.hours_worked ?? 0).toFixed(1) }}h
          </span>
        </template>
      </template>
    </CalendarMonth>
  </main>
</template>
