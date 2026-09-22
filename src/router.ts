import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import { isConfigured } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/reset-password',
    name: 'reset-password',
    component: () => import('@/views/ResetPasswordView.vue'),
    // Public, but reachable while signed in: a recovery link hands you a real
    // session, so bouncing signed-in visitors away would bounce the very
    // people this screen exists for.
    meta: { public: true, allowSignedIn: true },
  },
  // `intern: true` marks the screens that only make sense for someone who
  // clocks in. An admin is here to monitor, so these would show them an empty
  // clock and an empty journal of their own.
  {
    path: '/',
    name: 'today',
    component: () => import('@/views/TodayView.vue'),
    meta: { intern: true },
  },
  {
    path: '/time',
    name: 'time',
    component: () => import('@/views/TimeLogView.vue'),
    meta: { intern: true },
  },
  {
    path: '/learnings',
    name: 'learnings',
    component: () => import('@/views/LearningsView.vue'),
    meta: { intern: true },
  },
  {
    path: '/team',
    name: 'team',
    component: () => import('@/views/TeamView.vue'),
    meta: { admin: true },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  // Without credentials there is nothing to guard; App.vue renders setup
  // instructions instead of the app.
  if (!isConfigured) return true

  const auth = useAuthStore()
  if (!auth.ready) await auth.init()

  if (!to.meta.public && !auth.signedIn) return { name: 'login' }
  if (to.meta.public && auth.signedIn && !to.meta.allowSignedIn) return { name: 'today' }
  // Mid-recovery, every other route defers to setting the new password.
  if (auth.recovering && to.name !== 'reset-password') return { name: 'reset-password' }
  // Belt and braces only: RLS already returns nothing to a non-admin.
  if (to.meta.admin && !auth.isAdmin) return { name: 'today' }
  // Admins monitor rather than log, so the intern screens redirect to Team.
  // Running before render means there is no flash of a page they never wanted.
  if (to.meta.intern && auth.isAdmin) return { name: 'team' }
  return true
})
