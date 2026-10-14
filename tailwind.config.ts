import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#112B40', 800: '#173A55', 700: '#1E4A6A' },
        teal: { DEFAULT: '#007E83', 50: '#E3F2F2', 100: '#CCE8E9', 700: '#006468', 800: '#00595C' },
        canvas: '#EFF5F7',
        ink: '#243B4B',
        // Brand muted is #647985 (4.55:1 on white). Body-size muted text on the soft
        // canvas needs a darker value to stay AA, so `muted` is slightly deeper.
        muted: '#566B79',
        'muted-brand': '#647985',
        line: '#D3DEE4',
        amber: { DEFAULT: '#946718', 50: '#FBF4E3', 700: '#6F4C0F' },
        critical: { DEFAULT: '#B54747', 50: '#FBEDED', 700: '#8A2F2F' },
        approved: { DEFAULT: '#2E7D5B', 50: '#E6F3EC', 700: '#1F5C42' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: { DEFAULT: '6px', md: '8px', lg: '10px' },
      boxShadow: { card: '0 1px 2px rgba(17,43,64,0.05)', pop: '0 8px 24px rgba(17,43,64,0.14)' },
    },
  },
  plugins: [],
};
export default config;
