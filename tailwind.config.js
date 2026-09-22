/**
 * Design tokens read off dysrupit.com/solutions/execution via computed styles,
 * not eyeballed. Names stay semantic so call sites read by role, not by hue.
 * Reference by name — no inline hex anywhere.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F7F7F4', // warm off-white page ground
        surface: '#FFFFFF',
        line: '#EDEDEA',
        ink: '#03030F',
        muted: 'rgba(3,3,15,0.70)',
        faint: 'rgba(3,3,15,0.45)',

        brand: '#183DEB', // primary CTA blue
        brandHover: '#1233C4',
        brandSoft: '#EEF1FE', // tints, rings, selected fills
        brandMuted: '#B9C4F8', // disabled brand fill

        navy: '#010027', // the wordmark's own navy
        navyDeep: '#01024F',
        onDark: '#F3F3FF',

        agent: '#0D2281', // the agent's identity: labels, journey dots, orb
        agentSoft: '#F1F2FA',

        info: '#183DEB', // live question, informational notices
        infoSoft: '#EEF1FE',

        accent: '#48C4D5', // cyan — confirmations, trophies, "Exploring…"
        accentSoft: '#EDF9FB',
        accentTint: '#C6EDF2',

        ok: '#0DA532',
        okSoft: '#ECFBEF',

        // Derived, not on dysrupit.com: the site carries no caution tone and a
        // screening tool needs one. Warmed to sit on the canvas.
        warn: '#B4690E',
        warnSoft: '#FBF3E8',
      },
      borderRadius: {
        // The site is sharp by default; softness is reserved for cards and pills.
        card: '8px',
        panel: '16px',
        pill: '1000px',
      },
      fontFamily: {
        sans: ['"Inter Tight"', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        alt: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(3,3,15,.04), 0 8px 24px rgba(3,3,15,.05)',
        bar: '0 1px 2px rgba(3,3,15,.04), 0 12px 32px rgba(3,3,15,.07)',
      },
    },
  },
  plugins: [],
}
