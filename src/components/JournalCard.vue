<script setup lang="ts">
import { ref } from 'vue'

import { fmtClock, fmtDayLabel, fmtHours } from '@/lib/format'
import type { DailyLogDetail } from '@/types/db'

const props = defineProps<{
  log: DailyLogDetail
  /** Show whose entry this is — used on the supervisor's screens. */
  showIntern?: boolean
  reviewable?: boolean
}>()
const emit = defineEmits<{ review: [string] }>()

const comment = ref(props.log.supervisor_comment ?? '')
const open = ref(false)
</script>

<template>
  <article class="card p-6">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h3 class="card-title">{{ fmtDayLabel(log.log_date) }}</h3>
      <span v-if="showIntern" class="text-[14px] font-medium text-agent">{{
        log.intern_name
      }}</span>
      <span class="flex-1" />
      <span class="font-mono text-[14px] text-muted">{{ fmtHours(log.hours_worked) }}</span>
      <span class="text-[13px] text-faint">
        {{ fmtClock(log.clock_in) }}–{{ fmtClock(log.clock_out) }}
      </span>
    </div>

    <dl class="mt-4 space-y-3.5">
      <div v-if="log.worked_on">
        <dt class="label text-faint">Worked on</dt>
        <dd class="body-text mt-0.5 whitespace-pre-line">{{ log.worked_on }}</dd>
      </div>
      <div v-if="log.learned">
        <dt class="label text-agent">Learned</dt>
        <dd class="mt-0.5 whitespace-pre-line text-[16px] text-ink">{{ log.learned }}</dd>
      </div>
      <div v-if="log.blockers">
        <dt class="label text-warn">Blockers</dt>
        <dd class="body-text mt-0.5 whitespace-pre-line">{{ log.blockers }}</dd>
      </div>
      <div v-if="log.plan_tomorrow">
        <dt class="label text-faint">Next</dt>
        <dd class="body-text mt-0.5 whitespace-pre-line">{{ log.plan_tomorrow }}</dd>
      </div>
    </dl>

    <div v-if="log.skills.length" class="mt-4 flex flex-wrap gap-1.5">
      <span
        v-for="s in log.skills"
        :key="s"
        class="rounded-pill bg-agentSoft px-2.5 py-1 text-[12px] font-medium text-agent"
      >
        {{ s }}
      </span>
      <span
        v-if="log.confidence"
        class="rounded-pill bg-accentSoft px-2.5 py-1 text-[12px] font-medium text-ink"
      >
        Confidence {{ log.confidence }}/5
      </span>
    </div>

    <p
      v-if="log.supervisor_comment"
      class="mt-5 rounded-card border-l-2 border-accent bg-accentSoft px-4 py-3 text-[15px] text-ink"
    >
      <span class="label mb-1 block text-faint">Supervisor</span>
      {{ log.supervisor_comment }}
    </p>

    <div v-if="reviewable" class="mt-5 border-t border-line pt-4">
      <button
        v-if="!open"
        type="button"
        class="text-[14px] font-medium text-brand hover:text-brandHover"
        @click="open = true"
      >
        {{ log.reviewed_at ? 'Edit feedback' : 'Leave feedback' }}
      </button>
      <div v-else>
        <textarea
          v-model="comment"
          rows="3"
          class="w-full rounded-card border border-line bg-surface px-3.5 py-2.5 text-[15px]"
          placeholder="What to reinforce, what to redirect."
        />
        <div class="mt-3 flex gap-2">
          <button
            type="button"
            class="btn-brand !py-2 !text-[14px]"
            @click="emit('review', comment)"
          >
            Save feedback
          </button>
          <button type="button" class="btn-ghost !py-2 !text-[14px]" @click="open = false">
            Cancel
          </button>
        </div>
      </div>
    </div>
  </article>
</template>
