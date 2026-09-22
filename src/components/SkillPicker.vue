<script setup lang="ts">
import { computed } from 'vue'

import type { Skill } from '@/types/db'

const props = defineProps<{ skills: Skill[]; modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const grouped = computed(() => {
  const by = new Map<string, Skill[]>()
  for (const s of props.skills) {
    const list = by.get(s.category) ?? []
    list.push(s)
    by.set(s.category, list)
  }
  return [...by.entries()]
})

function toggle(name: string) {
  const next = props.modelValue.includes(name)
    ? props.modelValue.filter((n) => n !== name)
    : [...props.modelValue, name]
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="space-y-3">
    <div v-for="[category, items] in grouped" :key="category">
      <p class="label mb-1.5 text-faint">{{ category }}</p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="s in items"
          :key="s.id"
          type="button"
          class="rounded-pill border px-3 py-1.5 text-[13px] transition-colors"
          :class="
            modelValue.includes(s.name)
              ? 'border-brand bg-brandSoft font-medium text-agent'
              : 'border-line bg-surface text-muted hover:bg-canvas'
          "
          :aria-pressed="modelValue.includes(s.name)"
          @click="toggle(s.name)"
        >
          {{ s.name }}
        </button>
      </div>
    </div>
  </div>
</template>
