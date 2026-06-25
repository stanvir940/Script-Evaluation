/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        page: '#FFFFFF',
        surface: '#F5F5F5',
        'surface-alt': '#EBEBEB',
        border: {
          DEFAULT: '#D0D0D0',
          strong: '#999999',
        },
        text: {
          primary: '#1A1A1A',
          secondary: '#4A4A4A',
          muted: '#737373',
        },
        primary: {
          DEFAULT: '#1B3A6B',
          hover: '#152E55',
          light: '#E8EDF4',
        },
        success: {
          DEFAULT: '#2D6A4F',
          bg: '#E8F5EE',
        },
        warning: {
          DEFAULT: '#B45309',
          bg: '#FEF3E2',
        },
        danger: {
          DEFAULT: '#B91C1C',
          bg: '#FEE2E2',
        },
      },
      fontFamily: {
        sans: ['"Segoe UI"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      fontSize: {
        mark: ['32px', { lineHeight: '1.2', fontWeight: '600' }],
      },
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
    },
  },
  plugins: [],
};
