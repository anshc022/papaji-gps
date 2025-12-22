import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme as useNativeWindColorScheme } from 'nativewind';
import { useColorScheme as useRNColorScheme } from 'react-native';
import React, { createContext, useContext, useEffect, useState } from 'react';

type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeContextType {
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => void;
  activeTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { setColorScheme } = useNativeWindColorScheme();
  const systemColorScheme = useRNColorScheme();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');

  // Load saved preference on mount
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('themePreference');
        if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
          setThemePreferenceState(savedTheme as ThemePreference);
          setColorScheme(savedTheme as ThemePreference);
        } else {
          setColorScheme('system');
        }
      } catch (error) {
        console.error('Failed to load theme preference', error);
      }
    };
    loadTheme();
  }, []);

  const setThemePreference = async (pref: ThemePreference) => {
    setThemePreferenceState(pref);
    setColorScheme(pref);
    try {
      await AsyncStorage.setItem('themePreference', pref);
    } catch (error) {
      console.error('Failed to save theme preference', error);
    }
  };

  // Determine active theme
  let activeTheme: 'light' | 'dark' = 'light';
  if (themePreference === 'system') {
    activeTheme = systemColorScheme === 'dark' ? 'dark' : 'light';
  } else {
    activeTheme = themePreference;
  }

  return (
    <ThemeContext.Provider value={{ themePreference, setThemePreference, activeTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
