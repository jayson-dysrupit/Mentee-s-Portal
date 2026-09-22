<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import ClockCard from '@/components/ClockCard.vue'
import NoticeBar from '@/components/NoticeBar.vue'
import ReflectionForm from '@/components/ReflectionForm.vue'
import StatTile from '@/components/StatTile.vue'
import { fmtDayLabel, todayISO } from '@/lib/format'
import { useAuthStore } from '@/stores/auth'
import { useLogsStore } from '@/stores/logs'
import type { DailyLogDetail, ReflectionDraft, WorkMode } from '@/types/db'

const auth = useAuthStore()
const logs = useLogsStore()

/** The log currently being written up; null means show the clock instead. */
const target = ref<DailyLogDetail | null>(null)
const amending = ref(false)

onMounted(() => {
  void logs.loadMine()
  void logs.loadSkills()
})

const remaining = computed(() => {
  const required = auth.profile?.required_hours
  if (!required) return null
  return Math.max(0, Number(required) - logs.totalHours)
})

function beginClockOut(log: DailyLogDetail, isAmend = false) {
  amending.value = isAmend
  target.value = log
}

async function onClockIn(mode: WorkMode) {
  await logs.clockIn(mode)
}

async function onSubmit(draft: ReflectionDraft) {
  if (!target.value) return
  const ok = await logs.clockOut(target.value.id, draft)
  if (ok) target.value = null
}
</script>

<template>
  <main class="mx-auto max-w-3xl px-6 py-10">
    <p class="label text-faint">{{ fmtDayLabel(todayISO()) }}</p>
    <h1 class="mt-2 text-[34px] font-bold leading-tight tracking-[-0.02em]">
      Hello, {{ auth.profile?.full_name?.split(' ')[0] || 'there' }}
    </h1>

    <NoticeBar :message="logs.error" tone="error" class="mt-5" />

    <!-- A day left open overnight is the one thing worth interrupting for. -->
    <button
      v-if="logs.yesterdayOpen && !target"
      type="button"
      class="mt-6 flex w-full items-center gap-3 rounded-card border border-warnSoft bg-warnSoft px-5 py-4 text-left transition-colors hover:brightness-[0.98]"
      @click="beginClockOut(logs.yesterdayOpen)"
    >
      <span class="flex-1">
        <span class="label block text-warn">Yesterday is still open</span>
        <span class="mt-0.5 block text-[15px] text-ink">
          You clocked in but never clocked out. Close it out — you have until end of today.
        </span>
      </span>
      <span class="text-[15px] font-medium text-warn">Fix it →</span>
    </button>

    <div class="mt-6">
      <ReflectionForm
        v-if="target"
        :log="target"
        :skills="logs.skills"
        :busy="logs.busy"
        :amending="amending"
        @submit="onSubmit"
        @cancel="target = null"
      />
      <ClockCard
        v-else
        :log="logs.today"
        :busy="logs.busy"
        @clock-in="onClockIn"
        @clock-out="logs.today && beginClockOut(logs.today)"
      />
    </div>

    <button
      v-if="logs.today?.status === 'submitted' && !target"
      type="button"
      class="mt-3 text-[14px] font-medium text-brand hover:text-brandHover"
      @click="logs.today && beginClockOut(logs.today, true)"
    >
      Edit today's entry
    </button>

    <div class="mt-8 grid gap-3 sm:grid-cols-3">
      <StatTile
        label="Hours logged"
        :value="logs.totalHours.toFixed(1)"
        :hint="
          auth.profile?.required_hours ? `of ${auth.profile.required_hours} required` : undefined
        "
      />
      <StatTile label="Days logged" :value="String(logs.daysLogged)" />
      <StatTile
        label="Hours remaining"
        :value="remaining === null ? '—' : remaining.toFixed(1)"
        :hint="remaining === null ? 'No target set' : undefined"
      />
    </div>
  </main>
</template>
