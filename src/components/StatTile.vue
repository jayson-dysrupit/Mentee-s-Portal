<script setup lang="ts">
defineProps<{ label: string; value: string; hint?: string }>()
</script>

<template>
  <div class="card px-5 py-4">
    <p class="label text-faint">{{ label }}</p>
    <p class="mt-1 font-mono text-[26px] font-medium leading-none text-ink">{{ value }}</p>
    <p v-if="hint" class="mt-1.5 text-[13px] text-faint">{{ hint }}</p>
  </div>
</template>
