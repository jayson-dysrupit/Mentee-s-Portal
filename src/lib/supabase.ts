import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * False when .env is missing or still holds the placeholders from
 * .env.example. The app shows setup instructions in that case instead of
 * throwing, so a fresh clone runs and explains itself.
 */
export const isConfigured = Boolean(
  url && anonKey && !url.includes('YOUR-PROJECT-REF') && !anonKey.startsWith('YOUR-'),
)

// The anon key is designed to ship in a browser bundle: it grants exactly what
// the RLS policies in supabase/migrations/0002_policies.sql allow, nothing more.
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'placeholder', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

/** Postgres errors arrive with codes; turn the ones users can cause into prose. */
export function humanizeError(error: unknown): string {
  const e = error as { code?: string; message?: string } | null
  if (!e) return 'Something went wrong.'
  switch (e.code) {
    case '23505':
    case '23P01':
      return 'That day is already logged.'
    case '23514':
      if (e.message?.includes('reflection_required'))
        return 'Write what you worked on and what you learned before clocking out.'
      if (e.message?.includes('clock_order')) return 'Clock-out has to be after clock-in.'
      if (e.message?.includes('one_per_day')) return 'You have already clocked in today.'
      return 'That value is outside the allowed range.'
    case '42501':
      if (e.message?.includes('adjust clock times')) return 'Only an admin can change clock times.'
      return 'You do not have access to that record.'
    default:
      if (e.message?.includes('duplicate key')) return 'You have already clocked in today.'
      return e.message || 'Something went wrong.'
  }
}

/**
 * Auth errors are a different vocabulary from Postgres ones: they arrive with
 * string codes rather than SQLSTATEs, and the raw messages leak implementation
 * detail ("Invalid login credentials" for both a bad password and an unknown
 * address — deliberately, so the form cannot be used to enumerate accounts).
 * Keep that ambiguity in the rewrite.
 */
export function humanizeAuthError(error: unknown): string {
  const e = error as { code?: string; message?: string } | null
  if (!e) return 'Something went wrong.'
  switch (e.code) {
    case 'invalid_credentials':
      return 'That email and password do not match an account.'
    case 'email_not_confirmed':
      return 'Confirm your email address first — check your inbox for the link.'
    case 'user_already_exists':
    case 'email_exists':
      return 'An account already exists for that email. Sign in instead.'
    case 'weak_password':
      return 'That password is too weak. Use at least 8 characters.'
    case 'same_password':
      return 'That is already your password. Choose a different one.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many attempts. Wait a minute and try again.'
    case 'signup_disabled':
      return 'Sign-ups are turned off for this project.'
    case 'validation_failed':
      // The same code covers a malformed address and an OAuth provider that
      // was never switched on — two very different things to be told.
      if (e.message?.includes('provider is not enabled'))
        return 'That sign-in option is not switched on for this project yet.'
      return 'Check the email address and try again.'
    default:
      if (e.message?.includes('Invalid login credentials'))
        return 'That email and password do not match an account.'
      if (e.message?.includes('Password should be'))
        return 'That password is too short. Use at least 8 characters.'
      return e.message || 'Something went wrong.'
  }
}

/**
 * Which third-party sign-in buttons are worth rendering. Supabase reports this
 * on an unauthenticated endpoint, so the login screen can show only the
 * providers that actually work rather than a Google button that answers
 * "provider is not enabled" when an intern taps it. Failing quiet is right:
 * an empty list hides the optional buttons and leaves email + password, which
 * is always available.
 */
export async function fetchEnabledProviders(): Promise<string[]> {
  if (!isConfigured) return []
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey as string } })
    if (!res.ok) return []
    const body = (await res.json()) as { external?: Record<string, boolean> }
    return Object.entries(body.external ?? {})
      .filter(([, on]) => on)
      .map(([name]) => name)
  } catch {
    return []
  }
}
