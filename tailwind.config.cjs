/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Segoe UI"', '"Candara"', '"Corbel"', '"DejaVu Sans"', '"DM Sans"', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        soft: '0 22px 70px rgba(15, 23, 42, 0.45)',
        'aero-inset':
          'inset 0 1px 0 rgba(255, 255, 255, 0.72), inset 0 -1px 0 rgba(15, 118, 110, 0.08)',
        'aero-inset-dark':
          'inset 0 1px 0 rgba(255, 255, 255, 0.12), inset 0 -1px 0 rgba(0, 0, 0, 0.35)',
        'aero-float': '0 18px 48px rgba(8, 145, 178, 0.18), 0 4px 14px rgba(15, 118, 110, 0.12)',
        'aero-card':
          '0 18px 48px rgba(8, 145, 178, 0.16), 0 4px 14px rgba(15, 118, 110, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.72), inset 0 -1px 0 rgba(15, 118, 110, 0.07)',
        'aero-card-dark':
          '0 18px 48px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.12), inset 0 -1px 0 rgba(0, 0, 0, 0.35)'
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
        },
        ecsAeroFloat: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(12px, -18px) scale(1.03)' },
          '66%': { transform: 'translate(-16px, 10px) scale(0.98)' }
        },
        ecsAeroRibbon: {
          '0%, 100%': { transform: 'rotate(-8deg) translateX(-4%)' },
          '50%': { transform: 'rotate(-6deg) translateX(4%)' }
        },
        ecsNxeDrift: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '100% 50%' }
        },
        ecsWiiDrift: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(-3%, 2%) scale(1.02)' }
        },
        ecsCubeDrift: {
          '0%, 100%': { transform: 'translate(0, 0) rotate(-8deg)' },
          '50%': { transform: 'translate(10px, -8px) rotate(6deg)' }
        }
      },
      animation: {
        'ecs-pop-in': 'ecsPopIn 180ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'ecs-fade-up': 'ecsFadeUp 260ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'ecs-backdrop-in': 'ecsBackdropIn 200ms ease-out both',
        'ecs-pulse-soft': 'ecsPulseSoft 2.4s ease-in-out infinite',
        'ecs-aero-float': 'ecsAeroFloat 22s ease-in-out infinite',
        'ecs-aero-ribbon': 'ecsAeroRibbon 28s ease-in-out infinite',
        'ecs-xmb-wave': 'ecsXmbWave 22s linear infinite',
        'ecs-nxe-drift': 'ecsNxeDrift 26s linear infinite',
        'ecs-wii-drift': 'ecsWiiDrift 16s ease-in-out infinite',
        'ecs-cube-drift': 'ecsCubeDrift 18s ease-in-out infinite'
      }
    }
  },
  plugins: []
}
