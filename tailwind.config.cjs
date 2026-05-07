/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        soft: '0 22px 70px rgba(15, 23, 42, 0.45)'
      },
      keyframes: {
        ecsPopIn: {
          '0%': { opacity: '0', transform: 'translateY(-8px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' }
        },
        ecsFadeUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        ecsBackdropIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        ecsPulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.82' }
        }
      },
      animation: {
        'ecs-pop-in': 'ecsPopIn 180ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'ecs-fade-up': 'ecsFadeUp 260ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'ecs-backdrop-in': 'ecsBackdropIn 200ms ease-out both',
        'ecs-pulse-soft': 'ecsPulseSoft 2.4s ease-in-out infinite'
      }
    }
  },
  plugins: []
}
