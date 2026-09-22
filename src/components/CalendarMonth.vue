<script setup lang="ts">
import { computed, ref } from 'vue'

import { monthGrid, monthLabel, monthOf, shiftMonth, WEEKDAYS } from '@/lib/calendar'
import { todayISO } from '@/lib/format'

const props = withDefaults(
  defineProps<{
    /** Days that carry data, so the grid can open on a month worth looking at. */
    anchor?: string | null
    selectable?: boolean
  }>(),
  { anchor: null, selectable: false },
)

const selected = defineModel<string | null>('selected', { default: null })

const start = monthOf(props.anchor ?? todayISO())
const year = ref(start.year)
const month = ref(start.month)

const weeks = computed(() => monthGrid(year.value, month.value))
const label = computed(() => monthLabel(year.value, month.value))

function step(delta: number) {
  const next = shiftMonth(year.value, month.value, delta)
  year.value = next.year
  month.value = next.month
}

function toToday() {
  const now = monthOf(todayISO())
  year.value = now.year
  month.value = now.month
}

function pick(iso: string, inMonth: boolean) {
  if (!props.selectable || !inMonth) return
  selected.value = selected.value === iso ? null : iso
}
</script>

<template>
  <div class="card p-4 sm:p-5">
    <div class="flex items-center gap-2">
      <h3 class="card-title flex-1">{{ label }}</h3>
      <button
        type="button"
        class="rounded-pill px-3 py-1.5 text-[13px] text-muted transition-colors hover:bg-canvas"
        @click="toToday"
      >
        Today
      </button>
      <button
        type="button"
        class="rounded-pill border border-line px-2.5 py-1.5 text-muted transition-colors hover:bg-canvas"
        aria-label="Previous month"
        @click="step(-1)"
      >
        <svg
          viewBox="0 0 24 24"
          class="h-4 w-4"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        class="rounded-pill border border-line px-2.5 py-1.5 text-muted transition-colors hover:bg-canvas"
        aria-label="Next month"
        @click="step(1)"
      >
        <svg
          viewBox="0 0 24 24"
          class="h-4 w-4"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    </div>

    <div class="mt-4 grid grid-cols-7 gap-1">
      <div v-for="w in WEEKDAYS" :key="w" class="label pb-1 text-center text-faint">
        {{ w.slice(0, 1) }}<span class="hidden sm:inline">{{ w.slice(1) }}</span>
      </div>

      <template v-for="(week, wi) in weeks" :key="wi">
        <component
          :is="selectable ? 'button' : 'div'"
          v-for="cell in week"
          :key="cell.iso"
          :type="selectable ? 'button' : undefined"
          :aria-pressed="selectable && cell.inMonth ? selected === cell.iso : undefined"
          :disabled="selectable && !cell.inMonth ? true : undefined"
          class="min-h-[64px] rounded-card border p-1.5 text-left transition-colors sm:min-h-[76px]"
          :class="[
            cell.inMonth ? 'border-line bg-surface' : 'border-transparent bg-transparent',
            cell.inMonth && cell.isWeekend ? 'bg-canvas' : '',
            selected === cell.iso && cell.inMonth ? '!border-brand ring-1 ring-brand' : '',
            selectable && cell.inMonth ? 'hover:border-faint/50' : '',
          ]"
          @click="pick(cell.iso, cell.inMonth)"
        >
          <span
            class="inline-flex h-5 w-5 items-center justify-center rounded-pill text-[12px]"
            :class="[
              cell.isToday ? 'bg-brand font-semibold text-white' : '',
              cell.inMonth ? 'text-muted' : 'text-faint/50',
            ]"
          >
            {{ cell.day }}
          </span>
          <slot v-if="cell.inMonth" name="day" :iso="cell.iso" :cell="cell" />
        </component>
      </template>
    </div>
  </div>
</template>
