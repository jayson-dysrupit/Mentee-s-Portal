<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { fmtDayLabel, toLocalInput } from '@/lib/format'
import type { DailyLogDetail, TimeAdjustment } from '@/types/db'

const props = defineProps<{ log: DailyLogDetail | null; busy?: boolean }>()
const emit = defineEmits<{ save: [TimeAdjustment]; remove: [string]; close: [] }>()

// A native <dialog> rather than a hand-rolled overlay: it traps focus, closes
// on Escape and marks the rest of the page inert, all without us maintaining
// any of it.
const el = ref<HTMLDialogElement | null>(null)

const clockIn = ref('')
const clockOut = ref('')
const breakMinutes = ref(60)
const reason = ref('')
const localError = ref('')
const confirmingDelete = ref(false)

watch(
  () => props.log,
  (log) => {
    if (!log) {
      el.value?.close()
      return
    }
    clockIn.value = toLocalInput(new Date(log.clock_in))
    clockOut.value = log.clock_out ? toLocalInput(new Date(log.clock_out)) : ''
    breakMinutes.value = log.break_minutes
    reason.value = ''
    localError.value = ''
    confirmingDelete.value = false
    if (!el.value?.open) el.value?.showModal()
  },
)

const changed = computed(() => {
  const log = props.log
  if (!log) return false
  const outNow = log.clock_out ? toLocalInput(new Date(log.clock_out)) : ''
  return (
    clockIn.value !== toLocalInput(new Date(log.clock_in)) ||
    clockOut.value !== outNow ||
    breakMinutes.value !== log.break_minutes
  )
})

function askDelete() {
  localError.value = ''
  if (!reason.value.trim()) {
    localError.value = 'Give a reason first — it is kept after the day is gone.'
    return
  }
  confirmingDelete.value = true
}

function submit() {
  localError.value = ''
  if (!changed.value) {
    localError.value = 'Nothing has been changed yet.'
    return
  }
  if (clockOut.value && new Date(clockOut.value) <= new Date(clockIn.value)) {
    localError.value = 'Clock-out has to be after clock-in.'
    return
  }
  if (!reason.value.trim()) {
    localError.value = 'Give a reason — it is stored with the change.'
    return
  }
  emit('save', {
    clock_in: new Date(clockIn.value).toISOString(),
    clock_out: clockOut.value ? new Date(clockOut.value).toISOString() : null,
    break_minutes: breakMinutes.value,
    reason: reason.value,
  })
}
</script>

<template>
  <dialog
    ref="el"
    class="w-[min(30rem,calc(100vw-2rem))] rounded-panel border border-line bg-surface p-0 text-ink shadow-bar backdrop:bg-ink/40"
    @close="emit('close')"
    @cancel="emit('close')"
  >
    <form v-if="log" class="p-6" @submit.prevent="submit">
      <h2 class="card-title">Correct clock times</h2>
      <p class="body-text mt-1 text-[14px]">
        {{ log.intern_name }} · {{ fmtDayLabel(log.log_date) }}
      </p>

      <label class="mt-5 block">
        <span class="label text-muted">Clock in</span>
        <input v-model="clockIn" type="datetime-local" required class="field mt-1.5" />
      </label>

      <label class="mt-3 block">
        <span class="label text-muted">Clock out</span>
        <input v-model="clockOut" type="datetime-local" class="field mt-1.5" />
        <span v-if="!log.clock_out" class="mt-1 block text-[13px] text-faint">
          This day is still open. Setting a clock-out closes it, which the database only allows once
          the reflection is written.
        </span>
      </label>

      <label class="mt-3 block">
        <span class="label text-muted">Break (minutes)</span>
        <input
          v-model.number="breakMinutes"
          type="number"
          min="0"
          max="480"
          required
          class="field mt-1.5"
        />
      </label>

      <label class="mt-3 block">
        <span class="label text-muted">Reason</span>
        <input
          v-model="reason"
          type="text"
          placeholder="Forgot to clock in after the standup"
          class="field mt-1.5"
        />
        <span class="mt-1 block text-[13px] text-faint">
          Kept with the change, alongside your name and the old value.
        </span>
      </label>

      <p v-if="localError" class="mt-4 text-[14px] text-warn">{{ localError }}</p>

      <div class="mt-6 flex gap-2">
        <button type="submit" class="btn-brand !py-2.5 !text-[15px]" :disabled="busy">
          {{ busy ? 'Saving…' : 'Save correction' }}
        </button>
        <button type="button" class="btn-ghost !py-2.5 !text-[15px]" @click="emit('close')">
          Cancel
        </button>
      </div>

      <div class="mt-6 border-t border-line pt-4">
        <template v-if="!confirmingDelete">
          <button
            type="button"
            class="text-[14px] font-medium text-warn transition-colors hover:underline"
            @click="askDelete"
          >
            Delete this day instead
          </button>
          <p class="mt-1 text-[13px] text-faint">
            Removes the attendance and the reflection. The record that you deleted it, and why, is
            kept.
          </p>
        </template>

        <template v-else>
          <p class="text-[15px] font-medium text-ink">
            Delete {{ log.intern_name }}'s {{ fmtDayLabel(log.log_date) }}?
          </p>
          <p class="mt-1 text-[13px] text-muted">
            The hours and everything they wrote go for good. This cannot be undone.
          </p>
          <div class="mt-3 flex gap-2">
            <button
              type="button"
              class="btn !bg-warn !py-2 !text-[14px] !text-white hover:!brightness-95"
              :disabled="busy"
              @click="emit('remove', reason)"
            >
              {{ busy ? 'Deleting…' : 'Yes, delete it' }}
            </button>
            <button
              type="button"
              class="btn-ghost !py-2 !text-[14px]"
              @click="confirmingDelete = false"
            >
              Keep it
            </button>
          </div>
        </template>
      </div>
    </form>
  </dialog>
</template>
