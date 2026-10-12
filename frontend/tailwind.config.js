import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* AaryaAI Brand Colors */
        'aarya-bg': '#0e1a2d',
        'aarya-violet': {
          400: '#a78bfa',
          600: '#7c3aed',
        },
        'aarya-sky': {
          400: '#38bdf8',
        },
        'aarya-blue': {
          400: '#60a5fa',
          700: '#1d4ed8',
        },
        'aarya-emerald': {
          400: '#34d399',
          800: '#065f46',
        },
        'aarya-amber': {
          400: '#fbbf24',
          800: '#92400e',
        },
        'aarya-rose': {
          400: '#fb7185',
          800: '#9f1239',
        },
        'aarya-purple': {
          400: '#c084fc',
          900: '#581c87',
        },
        'aarya-slate': {
          400: '#94a3b8',
          700: '#334155',
        },
      },
      fontFamily: {
        'sans': ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        'mono': ['Courier New', 'monospace'],
      },
      backgroundImage: {
        'aarya-gradient': 'linear-gradient(135deg, #a78bfa 0%, #38bdf8 50%, #a78bfa 100%)',
      },
    },
  },
  plugins: [],
}
