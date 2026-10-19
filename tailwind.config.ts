import type { Config } from 'tailwindcss';

/**
 * A neutral ground (canvas), one near-black ink and graded greys carry the page. Colour means something: green,
 * amber and red are status; teal is information and data; signal orange marks the chosen item, focus and the few
 * things that ask for a person. Primary actions are ink, not colour. Status colours are tints with dark text, always
 * paired with an icon and words. Every text pairing here is at least 4.5:1.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: { DEFAULT: '#111113', 800: '#18181B', 700: '#27272A' },
        // Signal orange: the chosen item, focus, marks and links. 700 is the text-safe step (5.2:1 on white).
        copper: { DEFAULT: '#F2541B', 50: '#FFF3EE', 100: '#FFDCCB', 600: '#D9480F', 700: '#C2410C', bright: '#FF8A5C' },
        // Information, and the data ramps in charts.
        teal: { DEFAULT: '#2C6B66', 50: '#E3EEEB', 100: '#C9DED9', 600: '#27615C', 700: '#225753', 800: '#1B4744', bright: '#8FCFC4' },
        canvas: '#F4F4F3',
        ink: '#111111',
        'ink-2': '#3F3F46',
        // 5.3:1 on white, 4.8:1 on canvas. Never on a translucent fill: use ink-2 there.
        muted: '#6B6B70',
        line: '#E4E4E7',
        // Form-field outline (3.3:1 on white); the label and placeholder identify the control as well.
        field: '#8E8E93',
        // Neutral translucent fills adapt to white and to canvas alike.
        fill: { DEFAULT: 'rgba(0,0,0,0.05)', 2: 'rgba(0,0,0,0.08)', 3: 'rgba(0,0,0,0.13)' },
        amber: { DEFAULT: '#946718', 50: '#FBF2DE', 700: '#6F4C0F' },
        critical: { DEFAULT: '#B54747', 50: '#FBEBE8', 700: '#8A2F2F' },
        approved: { DEFAULT: '#2E7D5B', 50: '#E6F1EA', 700: '#1F5C42' },
        // Temperature above a limit: warmer than copper, still 4.9:1 on canvas.
        heat: '#B8401F',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        // Titles and the figures a person reads first. Data, tables and controls stay in the sans.
        display: ['var(--font-display)', 'Instrument Serif', 'ui-serif', 'Georgia', 'Times New Roman', 'serif'],
        // Labels and the kind of a number (measured, calculated...): small, technical, never body text.
        mono: ['var(--font-mono)', 'ui-monospace', 'SF Mono', 'Cascadia Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      // Tracking tightens as size grows, the way a grotesque is set on screen.
      fontSize: {
        xs: ['13px', { lineHeight: '18px', letterSpacing: '-0.003em' }],
        sm: ['15px', { lineHeight: '22px', letterSpacing: '-0.009em' }],
        base: ['16px', { lineHeight: '24px', letterSpacing: '-0.011em' }],
        lg: ['19px', { lineHeight: '26px', letterSpacing: '-0.014em' }],
        xl: ['22px', { lineHeight: '28px', letterSpacing: '-0.017em' }],
        '2xl': ['28px', { lineHeight: '34px', letterSpacing: '-0.02em' }],
        '3xl': ['34px', { lineHeight: '40px', letterSpacing: '-0.022em' }],
        '4xl': ['40px', { lineHeight: '46px', letterSpacing: '-0.024em' }],
        '5xl': ['52px', { lineHeight: '56px', letterSpacing: '-0.026em' }],
      },
      borderRadius: { DEFAULT: '6px', sm: '6px', md: '10px', lg: '14px', xl: '18px', '2xl': '22px', '3xl': '28px' },
      // Only what truly floats (dialogs, sheets, menus, notifications) casts a shadow.
      boxShadow: { pop: '0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)', hud: '0 12px 32px rgba(0,0,0,0.24)' },
      transitionTimingFunction: { out: 'cubic-bezier(0.22, 1, 0.36, 1)', spring: 'cubic-bezier(0.34, 1.32, 0.64, 1)' },
    },
  },
  plugins: [],
};
export default config;
