<script setup lang="ts">
import { fmtDate } from '@/lib/format'
import type { InternProgress } from '@/types/db'

defineProps<{
  interns: InternProgress[]
  /** The mentee currently drilled into, if any. */
  selected: string | null
}>()

const emit = defineEmits<{ select: [string] }>()

function pct(i: InternProgress): number | null {
  if (!i.required_hours) return null
  return Math.min(100, (Number(i.hours_logged) / Number(i.required_hours)) * 100)
}
</script>

<template>
  <div class="card">
    <div class="overflow-x-auto">
      <table class="min-w-full text-left text-[14px]">
        <caption class="sr-only">
          Mentees, with hours against target
        </caption>
        <thead class="border-b border-line">
          <tr class="label text-faint">
            <th scope="col" class="px-4 py-3 font-semibold">Intern</th>
            <th scope="col" class="px-4 py-3 font-semibold">Hours</th>
            <th scope="col" class="hidden px-4 py-3 text-right font-semibold sm:table-cell">
              Days
            </th>
            <th scope="col" class="px-4 py-3 text-right font-semibold">Open</th>
            <th scope="col" class="px-4 py-3 text-right font-semibold">Needs reply</th>
            <th scope="col" class="hidden px-4 py-3 font-semibold md:table-cell">Last log</th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="i in interns"
            :key="i.id"
            class="border-b border-line transition-colors last:border-0"
            :class="selected === i.id ? 'bg-brandSoft' : ''"
          >
            <!-- The control is the name, not the row: a clickable <tr> has no
                 honest ARIA role and stops the table being a table. -->
            <td class="px-4 py-2.5">
              <button
                type="button"
                :aria-pressed="selected === i.id"
                class="text-left transition-colors"
                @click="emit('select', i.id)"
              >
                <span
                  class="block font-medium"
                  :class="selected === i.id ? 'text-agent' : 'text-ink hover:text-brand'"
                >
                  {{ i.full_name }}
                </span>
                <span class="block text-[12px] text-faint">{{ i.email }}</span>
              </button>
            </td>

            <td class="min-w-[9rem] px-4 py-2.5">
              <span class="font-mono text-[14px] text-ink">
                {{ Number(i.hours_logged).toFixed(1) }}
              </span>
              <span v-if="i.required_hours" class="text-[13px] text-faint">
                / {{ Number(i.required_hours).toFixed(0) }}
              </span>
              <span v-else class="text-[13px] text-faint">h</span>
              <span
                v-if="pct(i) !== null"
                class="mt-1 block h-1 overflow-hidden rounded-pill bg-line"
                role="img"
                :aria-label="`${pct(i)!.toFixed(0)} per cent of target`"
              >
                <span class="block h-full rounded-pill bg-brand" :style="{ width: `${pct(i)}%` }" />
              </span>
              <span v-else class="mt-1 block text-[11px] text-faint">no target</span>
            </td>

            <td class="hidden px-4 py-2.5 text-right font-mono text-muted sm:table-cell">
              {{ i.days_logged }}
            </td>
            <td
              class="px-4 py-2.5 text-right font-mono"
              :class="i.days_open ? 'text-warn' : 'text-faint'"
            >
              {{ i.days_open }}
            </td>
            <td
              class="px-4 py-2.5 text-right font-mono"
              :class="i.awaiting_reply ? 'text-ink' : 'text-faint'"
            >
              {{ i.awaiting_reply }}
            </td>
            <td class="hidden px-4 py-2.5 text-muted md:table-cell">
              {{ fmtDate(i.last_log_date) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
