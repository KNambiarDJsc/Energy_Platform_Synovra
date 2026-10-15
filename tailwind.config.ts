import type { Config } from 'tailwindcss';

/**
 * One ground (canvas), one ink, one accent (brand teal). Navy is kept for the brand mark and the
 * passport object only. Status colours are tints with dark text, always paired with an icon and words.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#112B40', 800: '#173A55', 700: '#1E4A6A' },
        teal: { DEFAULT: '#007E83', 50: '#E3F2F2', 100: '#CCE8E9', 600: '#00777C', 700: '#006468', 800: '#00595C', bright: '#5FD3D7' },
        canvas: '#F5F5F7',
        ink: '#1D1D1F',
        'ink-2': '#424245',
        // 5.1:1 on white, 4.6:1 on canvas. Never on a grey fill: use ink-2 there.
        muted: '#6E6E73',
        line: '#E5E5EA',
        // Form-field outline; the label and placeholder identify the control as well.
        field: '#AEAEB2',
        // Translucent fills adapt to white and to canvas alike.
        fill: { DEFAULT: 'rgba(118,118,128,0.12)', 2: 'rgba(118,118,128,0.18)', 3: 'rgba(118,118,128,0.26)' },
        amber: { DEFAULT: '#946718', 50: '#FBF4E3', 700: '#6F4C0F' },
        critical: { DEFAULT: '#B54747', 50: '#FBEDED', 700: '#8A2F2F' },
        approved: { DEFAULT: '#2E7D5B', 50: '#E6F3EC', 700: '#1F5C42' },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
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
