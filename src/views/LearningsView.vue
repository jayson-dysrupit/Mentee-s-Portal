<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import JournalCard from '@/components/JournalCard.vue'
import NoticeBar from '@/components/NoticeBar.vue'
import { useLogsStore } from '@/stores/logs'

const logs = useLogsStore()
const filter = ref<string | null>(null)

onMounted(() => void logs.loadMine())

/** Only the skills that actually appear in this intern's own entries. */
const tags = computed(() => {
  const seen = new Set<string>()
  for (const l of logs.withLearnings) for (const s of l.skills) seen.add(s)
  return [...seen].sort()
})

const shown = computed(() =>
  filter.value
    ? logs.withLearnings.filter((l) => l.skills.includes(filter.value!))
    : logs.withLearnings,
)
</script>

<template>
  <main class="mx-auto max-w-3xl px-6 py-10">
    <h1 class="text-[34px] font-bold leading-tight tracking-[-0.02em]">
      What you've <span class="accent-word">learned</span>
    </h1>
    <p class="body-text mt-2">
      {{ logs.withLearnings.length }}
      {{ logs.withLearnings.length === 1 ? 'entry' : 'entries' }}, newest first.
    </p>

    <NoticeBar :message="logs.error" tone="error" class="mt-5" />

    <div v-if="tags.length" class="mt-6 flex flex-wrap gap-1.5">
      <button
        type="button"
        class="rounded-pill border px-3 py-1.5 text-[13px] transition-colors"
        :class="
          filter === null
            ? 'border-brand bg-brandSoft font-medium text-agent'
            : 'border-line bg-surface text-muted hover:bg-canvas'
        "
        @click="filter = null"
      >
        All
      </button>
      <button
        v-for="t in tags"
        :key="t"
        type="button"
        class="rounded-pill border px-3 py-1.5 text-[13px] transition-colors"
        :class="
          filter === t
            ? 'border-brand bg-brandSoft font-medium text-agent'
            : 'border-line bg-surface text-muted hover:bg-canvas'
        "
        @click="filter = t"
      >
        {{ t }}
      </button>
    </div>

    <p v-if="!shown.length" class="card mt-8 p-8 text-center text-[15px] text-faint">
      No entries yet. They are written when you clock out.
    </p>

    <div v-else class="mt-6 space-y-4">
      <JournalCard v-for="l in shown" :key="l.id" :log="l" />
    </div>
  </main>
</template>
