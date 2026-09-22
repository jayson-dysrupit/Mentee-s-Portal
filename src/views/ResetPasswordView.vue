<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import BrandMark from '@/components/BrandMark.vue'
import NoticeBar from '@/components/NoticeBar.vue'
import { MIN_PASSWORD, useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const password = ref('')
const confirm = ref('')
const showPassword = ref(false)
const mismatch = ref('')

/**
 * The recovery link carries its own session, so landing here signed out means
 * the link expired, was already used, or the page was opened directly.
 */
const linkLive = computed(() => auth.signedIn)

async function submit() {
  mismatch.value = ''
  if (password.value !== confirm.value) {
    mismatch.value = 'Those two passwords do not match.'
    return
  }
  const ok = await auth.updatePassword(password.value)
  if (ok) await router.push({ name: 'today' })
}
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
    <BrandMark size-class="h-7 w-auto" class="text-navy" />

    <h1 class="mt-10 text-[38px] font-bold leading-[1.1] tracking-[-0.02em]">
      Set a new <span class="accent-word">password</span>
    </h1>

    <template v-if="linkLive">
      <p class="body-text mt-3">
        You are signed in from the reset link. Choose a new password and we'll keep you here.
      </p>

      <form class="mt-8 space-y-3" @submit.prevent="submit">
        <label class="block">
          <span class="flex items-baseline justify-between gap-3">
            <span class="label text-muted">New password</span>
            <button
              type="button"
              class="text-[13px] text-muted transition-colors hover:text-ink"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? 'Hide' : 'Show' }}
            </button>
          </span>
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            required
            :minlength="MIN_PASSWORD"
            autocomplete="new-password"
            :placeholder="`At least ${MIN_PASSWORD} characters`"
            class="field mt-1.5"
          />
        </label>

        <label class="block">
          <span class="label text-muted">Confirm new password</span>
          <input
            v-model="confirm"
            :type="showPassword ? 'text' : 'password'"
            required
            autocomplete="new-password"
            placeholder="Type it again"
            class="field mt-1.5"
          />
        </label>

        <button type="submit" class="btn-brand w-full" :disabled="auth.busy">
          {{ auth.busy ? 'Saving…' : 'Save password' }}
        </button>
      </form>
    </template>

    <template v-else>
      <p class="body-text mt-3">
        This reset link has expired or has already been used. Ask for a fresh one.
      </p>
      <RouterLink :to="{ name: 'login' }" class="btn-brand mt-8 w-full">
        Back to sign in
      </RouterLink>
    </template>

    <div class="mt-6 space-y-2">
      <NoticeBar :message="mismatch" tone="error" />
      <NoticeBar :message="auth.error" tone="error" />
      <NoticeBar :message="auth.notice" tone="info" />
    </div>
  </main>
</template>
