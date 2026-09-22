<script setup lang="ts">
defineProps<{ message?: string; tone?: 'error' | 'warn' | 'info' }>()
</script>

<template>
  <p
    v-if="message"
    role="status"
    class="rounded-card border px-4 py-3 text-[14px]"
    :class="{
      'border-warnSoft bg-warnSoft text-warn': tone === 'error' || tone === 'warn',
      'border-line bg-infoSoft text-agent': tone === 'info' || !tone,
    }"
  >
    {{ message }}
  </p>
</template>
