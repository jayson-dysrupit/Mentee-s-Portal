<script setup lang="ts">
import BrandMark from '@/components/BrandMark.vue'
</script>

<template>
  <main class="mx-auto max-w-2xl px-6 py-20">
    <BrandMark size-class="h-7 w-auto" class="text-navy" />
    <h1 class="mt-8 text-[34px] font-bold leading-tight tracking-[-0.02em]">
      Almost there — <span class="accent-word">connect</span> Supabase
    </h1>
    <p class="body-text mt-3">
      The app is running, but it has no database to talk to yet. Three steps:
    </p>

    <ol class="mt-8 space-y-5">
      <li class="card p-5">
        <p class="card-title">1. Create a Supabase project</p>
        <p class="body-text mt-1.5">
          At <span class="font-mono text-[14px]">supabase.com/dashboard</span>. Any region, free
          tier is fine.
        </p>
      </li>
      <li class="card p-5">
        <p class="card-title">2. Run the migrations</p>
        <p class="body-text mt-1.5">
          Open the SQL editor and run the files in
          <span class="font-mono text-[14px]">supabase/migrations/</span> in order: 0001, 0002,
          0003.
        </p>
      </li>
      <li class="card p-5">
        <p class="card-title">3. Add your keys</p>
        <p class="body-text mt-1.5">
          Copy <span class="font-mono text-[14px]">.env.example</span> to
          <span class="font-mono text-[14px]">.env</span> and paste the Project URL and anon key
          from Settings → API, then restart the dev server.
        </p>
        <p class="body-text mt-2.5">
          <span class="font-medium text-ink">Seeing this on a deployed site?</span> Then the host is
          building without those two variables — <span class="font-mono text-[14px]">.env</span> is
          deliberately never committed. Add
          <span class="font-mono text-[14px]">VITE_SUPABASE_URL</span> and
          <span class="font-mono text-[14px]">VITE_SUPABASE_ANON_KEY</span> in the project's
          environment settings, then <span class="font-medium text-ink">redeploy</span>: Vite bakes
          them into the bundle at build time, so an existing build will never pick them up.
        </p>
      </li>
    </ol>

    <p class="mt-8 text-[14px] text-faint">
      Full walkthrough, including how to make yourself the first admin, is in
      <span class="font-mono">README.md</span>.
    </p>
  </main>
</template>
