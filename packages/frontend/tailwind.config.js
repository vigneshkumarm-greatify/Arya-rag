/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // shadcn/ui color variables
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Greatify brand colors
        GreatifyGreen: {
          900: '#004215',
          800: '#006921',
          700: '#008F2E',
          600: '#00B63A',
          500: '#00DC46',
          400: '#2EE267',
          300: '#5CE989',
          200: '#8AEFAA',
          100: '#B8F5CB',
          50: '#E6FCED',
        },
        GreatifyChalkGreen: {
          900: '#000606',
          800: '#001213',
          700: '#001E20',
          600: '#002B2D',
          500: '#00373A',
          400: '#315D5F',
          300: '#618385',
          200: '#91A9AA',
          100: '#C2CFD0',
          50: '#F2F5F5',
        },
        GreatifyOrange: {
          900: '#331C0C',
          800: '#663718',
          700: '#995323',
          600: '#CC6E2F',
          500: '#FF8A3B',
          400: '#FF9F5E',
          300: '#FFB482',
          200: '#FFC9A5',
          100: '#FFDEC8',
          50: '#FFF3EB',
        },
        GreatifyCreme: {
          900: '#A6A59A',
          800: '#B8B6AB',
          700: '#C9C8BB',
          600: '#DBD9CC',
          500: '#F9F7E8',
          400: '#F0EFE2',
          300: '#F4F2E9',
          200: '#F7F6EF',
          100: '#FAF9F5',
          50: '#FDFDFC',
        },
        GreatifyPurple: {
          900: '#140D28',
          800: '#271A50',
          700: '#3B2678',
          600: '#4E33A0',
          500: '#6240C8',
          400: '#7E62D2',
          300: '#9B85DC',
          200: '#B7A7E6',
          100: '#D3CAF0',
          50: '#EFECFA',
        },
        GreatifyNeutral: {
          900: '#18181B',
          800: '#333333',
          700: '#3F3F46',
          600: '#52525B',
          500: '#71717A',
          400: '#A1A1AA',
          300: '#D4D4D8',
          200: '#E4E4E7',
          100: '#F4F4F5',
          50: '#FAFAFA',
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        poppins: ['Poppins', 'sans-serif'],
        dm: ['DM Sans', 'sans-serif'],
        yellix: ['Yellix', 'sans-serif'],
        times: ['"Times New Roman"', 'Times', 'serif'],
      },
      backgroundImage: {
        'custom-gradient': 'linear-gradient(90deg, #00DC46 0%, #00C13D 100%)',
        'custom-hover-gradient': 'linear-gradient(90deg, #00C13D 0%, #00DC46 100%)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}