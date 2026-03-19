/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0a",
        neon: "#ff2e2e"
      },
      boxShadow: {
        neon: "0 0 20px rgba(255, 46, 46, 0.6)",
        glass: "0 20px 35px rgba(0,0,0,0.35)"
      }
    }
  },
  plugins: []
};
