import type { Config } from 'tailwindcss';

/**
 * A warm ground (canvas), one ink, and copper as the single accent for actions and attention. Patina teal
 * (copper's own weathered colour) carries information and data, so "act on this" and "for your information"
 * never share a colour. Night is the deep warm ink for the few dark surfaces. Status colours are tints with
 * dark text, always paired with an icon and words. Every text pairing here is at least 4.5:1.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: { DEFAULT: '#231E19', 800: '#2D2620', 700: '#3A3129' },
        // Actions, links, the chosen item, and anything that asks for attention.
        copper: { DEFAULT: '#A34D1F', 50: '#F7E9DF', 100: '#EFD3C0', 600: '#8F4219', 700: '#7E3A15', bright: '#F2A877' },
        // Information, and the data ramps in charts.
        teal: { DEFAULT: '#2C6B66', 50: '#E3EEEB', 100: '#C9DED9', 600: '#27615C', 700: '#225753', 800: '#1B4744', bright: '#8FCFC4' },
        canvas: '#F5F1EA',
        ink: '#1F1B16',
        'ink-2': '#4A433B',
        // 5.9:1 on white, 5.2:1 on canvas. Never on a translucent fill: use ink-2 there.
        muted: '#6B6359',
        line: '#E6DFD4',
        // Form-field outline; the label and placeholder identify the control as well.
        field: '#B4AA9D',
        // Translucent warm fills adapt to white and to canvas alike.
        fill: { DEFAULT: 'rgba(120,100,76,0.10)', 2: 'rgba(120,100,76,0.16)', 3: 'rgba(120,100,76,0.24)' },
        amber: { DEFAULT: '#946718', 50: '#FBF2DE', 700: '#6F4C0F' },
        critical: { DEFAULT: '#B54747', 50: '#FBEBE8', 700: '#8A2F2F' },
        approved: { DEFAULT: '#2E7D5B', 50: '#E6F1EA', 700: '#1F5C42' },
        // Temperature above a limit: warmer than copper, still 4.9:1 on canvas.
        heat: '#B8401F',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        // Titles and the figures a person reads first. Data, tables and controls stay in the sans.
        display: ['var(--font-display)', 'Newsreader', 'ui-serif', 'Georgia', 'Cambria', 'Times New Roman', 'serif'],
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
      boxShadow: { pop: '0 24px 64px rgba(40,28,16,0.18), 0 4px 16px rgba(40,28,16,0.08)', hud: '0 12px 32px rgba(40,28,16,0.24)' },
      transitionTimingFunction: { out: 'cubic-bezier(0.22, 1, 0.36, 1)', spring: 'cubic-bezier(0.34, 1.32, 0.64, 1)' },
    },
  },
  plugins: [],
};
export default config;
