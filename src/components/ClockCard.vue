<script setup lang="ts">
import { computed, ref } from 'vue'

import { useElapsed } from '@/composables/useElapsed'
import { fmtClock, fmtDuration, WORK_MODE_LABELS } from '@/lib/format'
import { WORK_MODES, type DailyLogDetail, type WorkMode } from '@/types/db'

const props = defineProps<{ log: DailyLogDetail | null; busy: boolean }>()
const emit = defineEmits<{ clockIn: [WorkMode]; clockOut: [] }>()

const mode = ref<WorkMode>('office')
const clockedIn = computed(() => props.log?.status === 'open')
const elapsed = useElapsed(computed(() => (clockedIn.value ? (props.log?.clock_in ?? null) : null)))
</script>

<template>
  <section class="card overflow-hidden">
    <!-- Clocked in: the live counter is the whole point of the screen. -->
    <div v-if="clockedIn && log" class="p-7">
      <div class="flex items-center gap-2">
        <span class="relative flex h-2 w-2">
          <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok" />
          <span class="relative inline-flex h-2 w-2 rounded-full bg-ok" />
        </span>
        <p class="label text-ok">On the clock</p>
      </div>

      <p class="mt-4 font-mono text-[56px] font-medium leading-none tracking-tight text-ink">
        {{ fmtDuration(elapsed) }}
      </p>
      <p class="body-text mt-2">
        Since {{ fmtClock(log.clock_in) }} · {{ WORK_MODE_LABELS[log.work_mode] }}
      </p>

      <button type="button" class="btn-arrow mt-7" :disabled="busy" @click="emit('clockOut')">
        {{ busy ? 'Saving…' : 'Clock out & log learning' }}
      </button>
      <p class="mt-3 text-[13px] text-faint">
        You will be asked what you worked on and what you learned. The day cannot close without it.
      </p>
    </div>

    <!-- Already done for the day. -->
    <div v-else-if="log" class="p-7">
      <p class="label text-accent">Day complete</p>
      <p class="mt-4 font-mono text-[56px] font-medium leading-none tracking-tight text-ink">
        {{ Number(log.hours_worked ?? 0).toFixed(2) }}<span class="text-[28px] text-faint">h</span>
      </p>
      <p class="body-text mt-2">
        {{ fmtClock(log.clock_in) }} – {{ fmtClock(log.clock_out) }} · {{ log.break_minutes }} min
        break
      </p>
      <p v-if="log.reviewed_at" class="mt-4 text-[14px] text-ok">Reviewed by your supervisor.</p>
    </div>

    <!-- Not started. -->
    <div v-else class="p-7">
      <p class="label text-faint">Not clocked in</p>
      <p class="mt-3 text-[28px] font-semibold tracking-[-0.01em] text-ink">
        Ready to start your day?
      </p>

      <fieldset class="mt-6">
        <legend class="label mb-2 text-faint">Where are you working?</legend>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="m in WORK_MODES"
            :key="m.value"
            type="button"
            class="rounded-pill border px-4 py-2 text-[14px] transition-colors"
            :class="
              mode === m.value
                ? 'border-brand bg-brandSoft font-medium text-agent'
                : 'border-line bg-surface text-muted hover:bg-canvas'
            "
            :aria-pressed="mode === m.value"
            @click="mode = m.value"
          >
            {{ m.label }}
          </button>
        </div>
      </fieldset>

      <button type="button" class="btn-arrow mt-7" :disabled="busy" @click="emit('clockIn', mode)">
        {{ busy ? 'Clocking in…' : 'Clock in' }}
      </button>
    </div>
  </section>
</template>
