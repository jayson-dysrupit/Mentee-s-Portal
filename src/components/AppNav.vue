<script setup lang="ts">
import { computed } from 'vue'

import BrandMark from '@/components/BrandMark.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

/**
 * The clock-in screens belong to whoever clocks in. An admin is here to
 * monitor a team, so showing them their own empty Today and Learnings would
 * be three tabs of nothing. The router enforces the same rule for anyone who
 * types the URL; this only keeps the nav honest about it.
 */
const links = computed(() =>
  auth.isAdmin
    ? []
    : [
        { to: { name: 'today' }, label: 'Today' },
        { to: { name: 'time' }, label: 'Time log' },
        { to: { name: 'learnings' }, label: 'Learnings' },
      ],
)
</script>

<template>
  <header class="sticky top-0 z-20 px-4 pt-4">
    <nav class="bar mx-auto flex max-w-5xl items-center gap-2 px-5 py-2.5">
      <RouterLink
        :to="{ name: auth.isAdmin ? 'team' : 'today' }"
        class="mr-1 shrink-0 text-navy"
        aria-label="DysrupIT"
      >
        <BrandMark size-class="h-5 w-auto" />
      </RouterLink>
      <span class="mr-2 hidden text-[13px] text-faint sm:inline">Intern Log</span>

      <RouterLink
        v-for="l in links"
        :key="l.label"
        :to="l.to"
        class="rounded-pill px-3 py-1.5 text-[14px] text-muted transition-colors hover:bg-canvas"
        active-class="bg-brandSoft font-medium text-agent"
      >
        {{ l.label }}
      </RouterLink>
      <RouterLink
        v-if="auth.isAdmin"
        :to="{ name: 'team' }"
        class="rounded-pill px-3 py-1.5 text-[14px] text-muted transition-colors hover:bg-canvas"
        active-class="bg-brandSoft font-medium text-agent"
      >
        Team
      </RouterLink>

      <span class="flex-1" />
      <span class="hidden text-[13px] text-faint md:inline">{{ auth.displayName }}</span>
      <button
        type="button"
        class="rounded-pill px-3 py-1.5 text-[13px] text-muted transition-colors hover:bg-canvas"
        @click="auth.signOut()"
      >
        Sign out
      </button>
    </nav>
  </header>
</template>
