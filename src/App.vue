<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'

import AppNav from '@/components/AppNav.vue'
import SetupNotice from '@/components/SetupNotice.vue'
import { isConfigured } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

onMounted(() => {
  if (isConfigured && !auth.ready) void auth.init()
})

/**
 * PASSWORD_RECOVERY can land after the first navigation has already resolved —
 * Supabase parses the link's hash asynchronously — so the router guard alone
 * would miss it. This catches the late case.
 */
watch(
  () => auth.recovering,
  (yes) => {
    if (yes && router.currentRoute.value.name !== 'reset-password') {
      void router.push({ name: 'reset-password' })
    }
  },
)

/**
 * The router guard already keeps admins off the intern screens, but it can
 * only act on what it knows when it runs. A magic link or a Google redirect
 * resolves the profile after that first navigation has settled, so an admin
 * would be sitting on Today by the time their role arrives. Catch that here.
 */
watch(
  () => auth.isAdmin,
  (yes) => {
    if (yes && router.currentRoute.value.meta.intern) {
      void router.replace({ name: 'team' })
    }
  },
)
</script>

<template>
  <SetupNotice v-if="!isConfigured" />

  <div v-else-if="!auth.ready" class="grid min-h-screen place-items-center">
    <p class="text-[14px] text-faint">Loading…</p>
  </div>

  <div v-else class="min-h-screen pb-20">
    <AppNav v-if="auth.signedIn && !auth.recovering" />
    <RouterView />
  </div>
</template>
