/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0E2540',
        rail: '#143655',
        railhi: '#1C4A73',
        navy: '#0E2540',
        canvas: '#EDF1F7',
        paper: '#FFFFFF',
        signal: '#8A1538',
        edge: '#D8DEE9',
        saffron: '#FF9933',
        india: '#138808',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'ui-sans-serif', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
        deva: ['"Noto Sans Devanagari"', 'sans-serif'],
      },
      boxShadow: { card: '0 30px 60px -20px rgba(4,12,28,0.55)' },
    },
  },
  plugins: [],
};
