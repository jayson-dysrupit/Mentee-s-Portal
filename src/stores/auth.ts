import type { Session } from '@supabase/supabase-js'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { fetchEnabledProviders, humanizeAuthError, isConfigured, supabase } from '@/lib/supabase'
import type { Profile } from '@/types/db'

/** Supabase's own floor is 6; 8 is the house rule, enforced before the call. */
export const MIN_PASSWORD = 8

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const profile = ref<Profile | null>(null)
  const ready = ref(false)
  const notice = ref('')
  const error = ref('')
  const busy = ref(false)
  /**
   * True from the moment Supabase reports PASSWORD_RECOVERY until a new
   * password is saved. A recovery link produces a real session, so without
   * this flag the click would land on Today and the reset would never be
   * offered. App.vue watches it and routes.
   */
  const recovering = ref(false)
  /** Third-party providers actually enabled on the project; see the login screen. */
  const providers = ref<string[]>([])

  const signedIn = computed(() => Boolean(session.value))
  /**
   * The only privileged role. Admins read every intern's logs and leave
   * feedback; interns read their own. There is no third case — `supervisor`
   * was dropped in migration 0006.
   */
  const isAdmin = computed(() => profile.value?.role === 'admin')
  const googleEnabled = computed(() => providers.value.includes('google'))
  const displayName = computed(
    () => profile.value?.full_name || session.value?.user.email || 'there',
  )

  function clear() {
    error.value = ''
    notice.value = ''
  }

  async function loadProfile() {
    if (!session.value) {
      profile.value = null
      return
    }
    const { data, error: e } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.value.user.id)
      .maybeSingle()
    if (e) error.value = e.message
    profile.value = (data as Profile | null) ?? null
  }

  async function init() {
    if (!isConfigured) {
      ready.value = true
      return
    }
    const { data } = await supabase.auth.getSession()
    session.value = data.session
    await loadProfile()
    // Not awaited: the login form works without it, and a slow answer should
    // not hold up the whole app's first paint.
    void fetchEnabledProviders().then((p) => (providers.value = p))

    // Supabase warns against awaiting its own calls inside this callback, so
    // the profile refresh is deferred out of the handler.
    supabase.auth.onAuthStateChange((event, next) => {
      session.value = next
      if (event === 'PASSWORD_RECOVERY') recovering.value = true
      setTimeout(() => void loadProfile(), 0)
    })
    ready.value = true
  }

  /** Email + password. The everyday path. */
  async function signInWithPassword(email: string, password: string) {
    clear()
    busy.value = true
    const { data, error: e } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    busy.value = false
    if (e) {
      error.value = humanizeAuthError(e)
      return false
    }
    // Load the profile before returning, rather than leaving it to the
    // onAuthStateChange handler. The caller navigates the moment this
    // resolves, and the router decides where an admin lands by reading
    // `role` — which would still be unknown if we let that race.
    session.value = data.session
    await loadProfile()
    return true
  }

  /**
   * Creating an account. Whether a session comes back depends on a project
   * setting: with "Confirm email" on, Supabase returns a user but no session
   * and mails a link. Both outcomes are success — they just say different
   * things to the person at the keyboard.
   */
  async function signUpWithPassword(email: string, password: string, fullName: string) {
    clear()
    if (password.length < MIN_PASSWORD) {
      error.value = `Use at least ${MIN_PASSWORD} characters for your password.`
      return false
    }
    busy.value = true
    const { data, error: e } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      // handle_new_user() reads full_name out of raw_user_meta_data to seed
      // the profiles row, so the name has to travel with the signup itself.
      options: { data: { full_name: fullName.trim() }, emailRedirectTo: window.location.origin },
    })
    busy.value = false
    if (e) {
      error.value = humanizeAuthError(e)
      return false
    }
    if (data.session) {
      // Same reasoning as sign-in: know the role before anyone navigates.
      session.value = data.session
      await loadProfile()
    } else {
      notice.value = `Account created. Check ${email.trim()} for a confirmation link, then sign in.`
    }
    return true
  }

  /** Passwordless fallback: Supabase emails a one-time link. */
  async function signInWithEmail(email: string) {
    clear()
    busy.value = true
    const { error: e } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: window.location.origin },
    })
    busy.value = false
    if (e) error.value = humanizeAuthError(e)
    else notice.value = `Check ${email.trim()} for a sign-in link.`
  }

  /** Needs Google enabled under Authentication > Providers in Supabase. */
  async function signInWithGoogle() {
    clear()
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (e) error.value = humanizeAuthError(e)
  }

  /**
   * Always reports success, even for an address with no account. Saying
   * "no such user" here would turn the form into an account-enumeration probe.
   */
  async function sendPasswordReset(email: string) {
    clear()
    busy.value = true
    const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    busy.value = false
    if (e && (e as { code?: string }).code?.includes('rate_limit')) {
      error.value = humanizeAuthError(e)
      return
    }
    notice.value = `If an account exists for ${email.trim()}, a reset link is on its way.`
  }

  /** Used by the recovery screen, and usable later for a plain password change. */
  async function updatePassword(password: string) {
    clear()
    if (password.length < MIN_PASSWORD) {
      error.value = `Use at least ${MIN_PASSWORD} characters for your password.`
      return false
    }
    busy.value = true
    const { error: e } = await supabase.auth.updateUser({ password })
    busy.value = false
    if (e) {
      error.value = humanizeAuthError(e)
      return false
    }
    recovering.value = false
    notice.value = 'Password updated.'
    return true
  }

  async function signOut() {
    await supabase.auth.signOut()
    session.value = null
    profile.value = null
    recovering.value = false
    clear()
  }

  async function updateName(fullName: string) {
    if (!profile.value) return
    const { error: e } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', profile.value.id)
    if (e) error.value = e.message
    else await loadProfile()
  }

  return {
    session,
    profile,
    ready,
    notice,
    error,
    busy,
    recovering,
    providers,
    googleEnabled,
    signedIn,
    isAdmin,
    displayName,
    clear,
    init,
    loadProfile,
    signInWithPassword,
    signUpWithPassword,
    signInWithEmail,
    signInWithGoogle,
    sendPasswordReset,
    updatePassword,
    signOut,
    updateName,
  }
})
