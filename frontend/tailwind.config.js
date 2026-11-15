/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{js,jsx}", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#171717",
        brand: "#9270e8",
        slate: {
          50: "#fff8eb",
          100: "#f5eedf",
          200: "#e8dfcd",
          300: "#d4c8b3",
          400: "#a19786",
          500: "#706657",
          600: "#5f574c",
          700: "#39342d",
          800: "#29251f",
          900: "#171717",
          950: "#11100e",
        },
        indigo: {
          50: "#f3efff",
          100: "#e8e0ff",
          200: "#d2c3ff",
          300: "#b69cff",
          400: "#9b7bf0",
          500: "#9270e8",
          600: "#7e5cd5",
          700: "#6c4ac9",
          800: "#5536a8",
          900: "#3d2678",
          950: "#28184f",
        },
      },
    },
  },
  plugins: [],
};
