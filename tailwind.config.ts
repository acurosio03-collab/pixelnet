import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: {
          950: '#04060f',
          900: '#070b1a',
          800: '#0b1226',
          700: '#111a35',
          600: '#1b2750',
          500: '#2a3a72',
        },
        neon: {
          cyan: '#22e5ff',
          violet: '#9b6bff',
          pink: '#ff4fd8',
          lime: '#7dffb0',
        },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Hanken Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      keyframes: {
        twinkle: { '0%,100%': { opacity: '0.25' }, '50%': { opacity: '1' } },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        sheen: { '0%': { backgroundPosition: '0% 50%' }, '100%': { backgroundPosition: '200% 50%' } },
      },
      animation: {
        twinkle: 'twinkle 2.4s ease-in-out infinite',
        floaty: 'floaty 5s ease-in-out infinite',
        sheen: 'sheen 6s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
