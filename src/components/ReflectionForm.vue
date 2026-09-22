<script setup lang="ts">
import { computed, ref } from 'vue'

import SkillPicker from '@/components/SkillPicker.vue'
import { fmtDayLabel, toLocalInput } from '@/lib/format'
import type { DailyLogDetail, ReflectionDraft, Skill } from '@/types/db'

const props = defineProps<{
  log: DailyLogDetail
  skills: Skill[]
  busy: boolean
  /** Amending an already-closed day rather than closing an open one. */
  amending?: boolean
}>()
const emit = defineEmits<{ submit: [ReflectionDraft]; cancel: [] }>()

// For today the default clock-out is now. For a day left open overnight, a
// sensible end-of-day so the intern only has to correct it, never invent it.
const defaultClockOut = () => {
  if (props.log.clock_out) return toLocalInput(new Date(props.log.clock_out))
  const today = new Date().toISOString().slice(0, 10)
  if (props.log.log_date === today) return toLocalInput(new Date())
  return `${props.log.log_date}T18:00`
}

const draft = ref<ReflectionDraft>({
  clock_out: defaultClockOut(),
  break_minutes: props.log.break_minutes,
  worked_on: props.log.worked_on ?? '',
  learned: props.log.learned ?? '',
  blockers: props.log.blockers ?? '',
  plan_tomorrow: props.log.plan_tomorrow ?? '',
  skills: [...props.log.skills],
  confidence: props.log.confidence,
})

const touched = ref(false)
const missingWorkedOn = computed(() => draft.value.worked_on.trim().length === 0)
const missingLearned = computed(() => draft.value.learned.trim().length === 0)
const valid = computed(() => !missingWorkedOn.value && !missingLearned.value)

function submit() {
  touched.value = true
  if (!valid.value) return
  emit('submit', draft.value)
}

const field =
  'mt-1.5 w-full rounded-card border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-faint'
</script>

<template>
  <form class="card p-7" @submit.prevent="submit">
    <p class="label text-faint">{{ fmtDayLabel(log.log_date) }}</p>
    <h2 class="mt-2 text-[28px] font-semibold tracking-[-0.01em]">
      {{ amending ? 'Edit your' : 'Wrap up your' }} <span class="accent-word">day</span>
    </h2>

    <div class="mt-6 grid gap-5 sm:grid-cols-2">
      <label class="block">
        <span class="label text-muted">Clocked out at</span>
        <input v-model="draft.clock_out" type="datetime-local" :class="field" required />
      </label>
      <label class="block">
        <span class="label text-muted">Break (minutes)</span>
        <input
          v-model.number="draft.break_minutes"
          type="number"
          min="0"
          max="480"
          :class="field"
        />
      </label>
    </div>

    <label class="mt-5 block">
      <span class="label text-muted">What did you work on?</span>
      <textarea
        v-model="draft.worked_on"
        rows="3"
        :class="field"
        placeholder="The tasks, tickets or meetings that took your day."
      />
      <span v-if="touched && missingWorkedOn" class="mt-1 block text-[13px] text-warn">
        Required — the day cannot close without it.
      </span>
    </label>

    <label class="mt-5 block">
      <span class="label text-muted">What did you learn today?</span>
      <textarea
        v-model="draft.learned"
        rows="4"
        :class="field"
        placeholder="One thing you understand now that you did not this morning."
      />
      <span v-if="touched && missingLearned" class="mt-1 block text-[13px] text-warn">
        Required — this is the part your supervisor actually reads.
      </span>
    </label>

    <div class="mt-5 grid gap-5 sm:grid-cols-2">
      <label class="block">
        <span class="label text-muted">Blockers or questions</span>
        <textarea
          v-model="draft.blockers"
          rows="2"
          :class="field"
          placeholder="Optional. Anything you are stuck on."
        />
      </label>
      <label class="block">
        <span class="label text-muted">Plan for tomorrow</span>
        <textarea v-model="draft.plan_tomorrow" rows="2" :class="field" placeholder="Optional." />
      </label>
    </div>

    <fieldset class="mt-6">
      <legend class="label mb-2 text-muted">Skills you practised</legend>
      <SkillPicker v-model="draft.skills" :skills="skills" />
    </fieldset>

    <fieldset class="mt-6">
      <legend class="label mb-2 text-muted">How confident did today leave you?</legend>
      <div class="flex gap-1.5">
        <button
          v-for="n in 5"
          :key="n"
          type="button"
          class="h-10 w-10 rounded-card border font-mono text-[15px] transition-colors"
          :class="
            draft.confidence === n
              ? 'border-brand bg-brandSoft font-medium text-agent'
              : 'border-line bg-surface text-muted hover:bg-canvas'
          "
          :aria-label="`${n} out of 5`"
          :aria-pressed="draft.confidence === n"
          @click="draft.confidence = draft.confidence === n ? null : n"
        >
          {{ n }}
        </button>
      </div>
    </fieldset>

    <div class="mt-8 flex flex-wrap items-center gap-3">
      <button type="submit" class="btn-brand" :disabled="busy">
        {{ busy ? 'Saving…' : amending ? 'Save changes' : 'Clock out' }}
      </button>
      <button type="button" class="btn-ghost" :disabled="busy" @click="emit('cancel')">
        Cancel
      </button>
    </div>
  </form>
</template>
