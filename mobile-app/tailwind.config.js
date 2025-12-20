/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0F0F0F',
          card: '#1A1A1A',
          text: '#FFFFFF',
          subtext: '#888888',
        },
        primary: {
          DEFAULT: '#FF5500', // The orange color from the image
          light: '#FF7733',
        }
      }
    },
  },
  plugins: [],
}
