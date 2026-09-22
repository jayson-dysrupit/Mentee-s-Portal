<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import BrandMark from '@/components/BrandMark.vue'
import NoticeBar from '@/components/NoticeBar.vue'
import { MIN_PASSWORD, useAuthStore } from '@/stores/auth'

/**
 * Three modes on one screen rather than three routes: the fields overlap
 * almost entirely, and a person who mistypes a password should not lose what
 * they typed to a navigation.
 */
type Mode = 'signin' | 'signup' | 'forgot'

const auth = useAuthStore()
const router = useRouter()

const mode = ref<Mode>('signin')
const email = ref('')
const password = ref('')
const fullName = ref('')
const showPassword = ref(false)

const copy = computed(() => {
  switch (mode.value) {
    case 'signup':
      return { title: 'Create your account', cta: 'Create account', busy: 'Creating…' }
    case 'forgot':
      return { title: 'Reset your password', cta: 'Email me a reset link', busy: 'Sending…' }
    default:
      return { title: 'Sign in', cta: 'Sign in', busy: 'Signing in…' }
  }
})

// Stale errors from one mode must not haunt the next.
watch(mode, () => {
  auth.clear()
  password.value = ''
  showPassword.value = false
})

async function submit() {
  if (mode.value === 'forgot') {
    await auth.sendPasswordReset(email.value)
    return
  }
  if (mode.value === 'signup') {
    const ok = await auth.signUpWithPassword(email.value, password.value, fullName.value)
    // A session only comes back when email confirmation is off; otherwise the
    // notice tells them to go and confirm.
    if (ok && auth.signedIn) await router.push({ name: 'today' })
    return
  }
  const ok = await auth.signInWithPassword(email.value, password.value)
  if (ok) await router.push({ name: 'today' })
}
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
    <BrandMark size-class="h-7 w-auto" class="text-navy" />

    <h1 class="mt-10 text-[38px] font-bold leading-[1.1] tracking-[-0.02em]">
      Intern <span class="accent-word">log</span>
    </h1>
    <p class="body-text mt-3">
      Clock in, clock out, and record what you learned. One record per day.
    </p>

    <div class="mt-9 flex gap-1 rounded-pill border border-line bg-surface p-1">
      <button
        v-for="t in [
          { key: 'signin' as Mode, label: 'Sign in' },
          { key: 'signup' as Mode, label: 'Create account' },
        ]"
        :key="t.key"
        type="button"
        class="flex-1 rounded-pill px-4 py-2 text-[14px] transition-colors"
        :class="
          mode === t.key || (mode === 'forgot' && t.key === 'signin')
            ? 'bg-brandSoft font-medium text-agent'
            : 'text-muted hover:bg-canvas'
        "
        @click="mode = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <h2 class="sr-only">{{ copy.title }}</h2>

    <form class="mt-5 space-y-3" @submit.prevent="submit">
      <label v-if="mode === 'signup'" class="block">
        <span class="label text-muted">Full name</span>
        <input
          v-model="fullName"
          type="text"
          required
          autocomplete="name"
          placeholder="Juan Dela Cruz"
          class="field mt-1.5"
        />
      </label>

      <label class="block">
        <span class="label text-muted">Email address</span>
        <input
          v-model="email"
          type="email"
          required
          autocomplete="email"
          placeholder="you@example.com"
          class="field mt-1.5"
        />
      </label>

      <label v-if="mode !== 'forgot'" class="block">
        <span class="flex items-baseline justify-between gap-3">
          <span class="label text-muted">Password</span>
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
          :minlength="mode === 'signup' ? MIN_PASSWORD : undefined"
          :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
          :placeholder="mode === 'signup' ? `At least ${MIN_PASSWORD} characters` : '••••••••'"
          class="field mt-1.5"
        />
      </label>

      <p v-if="mode === 'forgot'" class="text-[14px] text-muted">
        We'll email you a link that lets you set a new one.
      </p>

      <button type="submit" class="btn-brand w-full" :disabled="auth.busy">
        {{ auth.busy ? copy.busy : copy.cta }}
      </button>
    </form>

    <div class="mt-3 flex justify-between gap-3 text-[13px]">
      <button
        v-if="mode !== 'forgot'"
        type="button"
        class="font-medium text-brand transition-colors hover:text-brandHover"
        @click="mode = 'forgot'"
      >
        Forgot your password?
      </button>
      <button
        v-else
        type="button"
        class="font-medium text-brand transition-colors hover:text-brandHover"
        @click="mode = 'signin'"
      >
        ← Back to sign in
      </button>
      <button
        v-if="mode === 'signin'"
        type="button"
        class="text-muted transition-colors hover:text-ink"
        @click="auth.signInWithEmail(email)"
        :disabled="!email.trim() || auth.busy"
      >
        Email me a link instead
      </button>
    </div>

    <!-- Only rendered once Google is actually enabled on the project. Until
         then the button would answer "provider is not enabled". -->
    <template v-if="auth.googleEnabled">
      <div class="my-6 flex items-center gap-3">
        <span class="h-px flex-1 bg-line" />
        <span class="text-[13px] text-faint">or</span>
        <span class="h-px flex-1 bg-line" />
      </div>

      <button type="button" class="btn-ghost w-full" @click="auth.signInWithGoogle()">
        Continue with Google
      </button>
    </template>

    <div class="mt-6 space-y-2">
      <NoticeBar :message="auth.notice" tone="info" />
      <NoticeBar :message="auth.error" tone="error" />
    </div>
  </main>
</template>
