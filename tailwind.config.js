// Colores de marca como variables CSS con soporte de opacidad (bg-accent/10, border-mint/40, ...).
// Sin esto Tailwind no genera las variantes con "/" y los bordes caían al gris por defecto.
const token = name => ({ opacityValue }) =>
  opacityValue === undefined || opacityValue === '1'
    ? `var(--${name})`
    : `color-mix(in srgb, var(--${name}) calc(${opacityValue} * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      borderColor: {
        DEFAULT: 'var(--line)',
      },
      colors: {
        ink: token('ink'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        'surface-3': token('surface-3'),
        line: token('line'),
        text: token('text'),
        muted: token('muted'),
        'muted-2': token('muted-2'),
        accent: token('accent'),
        'accent-strong': token('accent-strong'),
        'accent-dim': token('accent-dim'),
        'on-accent': token('on-accent'),
        mint: token('mint'),
        'mint-dim': token('mint-dim'),
        amber: token('amber'),
        'amber-dim': token('amber-dim'),
        violet: token('violet'),
        'violet-dim': token('violet-dim'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.25s ease-out',
      },
    },
  },
  plugins: [],
};
