"use client"

import React, { createContext, useContext, useState, useEffect, useMemo } from "react"

type HSLColor = `${number} ${number}% ${number}%`

interface ColorScheme {
  primary: HSLColor
  primaryForeground: HSLColor
  ring: HSLColor
}

export interface AccentColor {
  name: string
  light: ColorScheme
  dark: ColorScheme
}

interface AccentColorContextType {
  accentColor: AccentColor
  setAccentColor: (color: AccentColor) => void
  accentColorOptions: AccentColor[]
}

const ACCENT_COLOR_STORAGE_KEY = "accent-color"

const accentColorOptions: AccentColor[] = [
    // 1. Default Blue (macOS)
    {
      name: "Blue",
      light: { primary: "217 91% 60%", primaryForeground: "210 40% 98%", ring: "217 91% 70%" },
      dark: { primary: "217 91% 65%", primaryForeground: "210 40% 98%", ring: "217 91% 55%" },
    },
    // 2. Graphite (macOS)
    {
      name: "Graphite",
      light: { primary: "220 9% 55%", primaryForeground: "0 0% 100%", ring: "220 9% 65%" },
      dark: { primary: "220 9% 60%", primaryForeground: "0 0% 100%", ring: "220 9% 50%" },
    },
    // 3. Mint Green
    {
      name: "Mint",
      light: { primary: "160 50% 48%", primaryForeground: "160 50% 98%", ring: "160 50% 58%" },
      dark: { primary: "160 50% 55%", primaryForeground: "160 50% 98%", ring: "160 50% 45%" },
    },
    // 4. Indigo
    {
      name: "Indigo",
      light: { primary: "225 76% 55%", primaryForeground: "225 76% 98%", ring: "225 76% 65%" },
      dark: { primary: "225 76% 60%", primaryForeground: "225 76% 98%", ring: "225 76% 50%" },
    },
    // 5. Orange
    {
      name: "Orange",
      light: { primary: "25 95% 53%", primaryForeground: "25 95% 98%", ring: "25 95% 63%" },
      dark: { primary: "25 95% 58%", primaryForeground: "25 95% 98%", ring: "25 95% 48%" },
    },
    // 6. Pink
    {
      name: "Pink",
      light: { primary: "330 85% 55%", primaryForeground: "330 85% 98%", ring: "330 85% 65%" },
      dark: { primary: "330 85% 60%", primaryForeground: "330 85% 98%", ring: "330 85% 50%" },
    },
    // 7. Purple (Original)
    {
      name: "Purple",
      light: { primary: "300 76% 25%", primaryForeground: "0 0% 98%", ring: "300 76% 35%" },
      dark: { primary: "300 76% 55%", primaryForeground: "0 0% 98%", ring: "300 76% 45%" },
    },
    // 8. Yellow
    {
      name: "Yellow",
      light: { primary: "45 95% 51%", primaryForeground: "45 95% 10%", ring: "45 95% 61%" },
      dark: { primary: "45 95% 55%", primaryForeground: "45 95% 10%", ring: "45 95% 45%" },
    },
];

const AccentColorContext = createContext<AccentColorContextType | undefined>(undefined)

export const AccentColorProvider = ({ children }: { children: React.ReactNode }) => {
  const [accentColor, setAccentColorState] = useState<AccentColor>(accentColorOptions[0]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    try {
      const storedColorName = localStorage.getItem(ACCENT_COLOR_STORAGE_KEY);
      const storedColor = accentColorOptions.find(c => c.name === storedColorName);
      if (storedColor) {
        setAccentColorState(storedColor);
      }
    } catch (e) {
      console.warn("Failed to access localStorage for accent color.");
    }
  }, []);

  const setAccentColor = (newColor: AccentColor) => {
    setAccentColorState(newColor);
    try {
      localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, newColor.name);
    } catch (e) {
       console.warn("Failed to save accent color to localStorage.");
    }
  }

  useEffect(() => {
    if (isMounted) {
      const root = document.documentElement;
      root.style.setProperty("--accent-color-primary-light", accentColor.light.primary);
      root.style.setProperty("--accent-color-primary-foreground-light", accentColor.light.primaryForeground);
      root.style.setProperty("--accent-color-ring-light", accentColor.light.ring);
      
      root.style.setProperty("--accent-color-primary-dark", accentColor.dark.primary);
      root.style.setProperty("--accent-color-primary-foreground-dark", accentColor.dark.primaryForeground);
      root.style.setProperty("--accent-color-ring-dark", accentColor.dark.ring);
    }
  }, [accentColor, isMounted]);

  const contextValue = useMemo(() => ({
    accentColor,
    setAccentColor,
    accentColorOptions
  }), [accentColor]);

  return (
    <AccentColorContext.Provider value={contextValue}>
      {children}
    </AccentColorContext.Provider>
  )
}

export const useAccentColor = () => {
  const context = useContext(AccentColorContext)
  if (context === undefined) {
    throw new Error("useAccentColor must be used within an AccentColorProvider")
  }
  return context
}
