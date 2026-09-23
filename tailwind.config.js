/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        line: 'var(--line)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        'muted-2': 'var(--muted-2)',
        accent: 'var(--accent)',
        'accent-strong': 'var(--accent-strong)',
        'accent-dim': 'var(--accent-dim)',
        'on-accent': 'var(--on-accent)',
        mint: 'var(--mint)',
        'mint-dim': 'var(--mint-dim)',
        amber: 'var(--amber)',
        'amber-dim': 'var(--amber-dim)',
        violet: 'var(--violet)',
        'violet-dim': 'var(--violet-dim)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
