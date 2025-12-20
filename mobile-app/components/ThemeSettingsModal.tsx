import { useTheme } from '@/context/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface ThemeSettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function ThemeSettingsModal({ visible, onClose }: ThemeSettingsModalProps) {
  const { themePreference, setThemePreference } = useTheme();

  const options = [
    { label: 'Light', value: 'light', icon: 'white-balance-sunny' },
    { label: 'Dark', value: 'dark', icon: 'moon-waning-crescent' },
    { label: 'System', value: 'system', icon: 'theme-light-dark' },
  ] as const;

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/50 justify-center items-center p-4">
        <Pressable className="absolute inset-0" onPress={onClose} />
        
        <Animated.View 
          entering={FadeInDown.springify()} 
          className="bg-white dark:bg-dark-card w-full max-w-sm rounded-3xl p-6 shadow-2xl"
        >
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-xl font-bold text-black dark:text-white">App Theme</Text>
            <TouchableOpacity onPress={onClose} className="bg-gray-100 dark:bg-gray-800 p-2 rounded-full">
              <MaterialCommunityIcons name="close" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          <View className="gap-3">
            {options.map((option) => (
              <TouchableOpacity
                key={option.value}
                onPress={() => {
                  setThemePreference(option.value);
                  // Optional: Close on select
                  // onClose(); 
                }}
                className={`flex-row items-center justify-between p-4 rounded-2xl border ${
                  themePreference === option.value
                    ? 'bg-primary/10 border-primary'
                    : 'bg-gray-50 dark:bg-gray-800/50 border-transparent'
                }`}
              >
                <View className="flex-row items-center gap-3">
                  <View className={`p-2 rounded-full ${
                    themePreference === option.value ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'
                  }`}>
                    <MaterialCommunityIcons 
                      name={option.icon} 
                      size={20} 
                      color={themePreference === option.value ? 'white' : '#666'} 
                    />
                  </View>
                  <Text className={`font-medium ${
                    themePreference === option.value ? 'text-primary' : 'text-black dark:text-white'
                  }`}>
                    {option.label}
                  </Text>
                </View>
                
                {themePreference === option.value && (
                  <MaterialCommunityIcons name="check-circle" size={24} color="#FF5500" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
