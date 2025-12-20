import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs, usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type TabIconName = 'home-variant' | 'map-marker-path' | 'history';

interface TabButtonProps {
  icon: TabIconName;
  isActive: boolean;
  onPress: () => void;
  isDark: boolean;
}

function TabButton({ icon, isActive, onPress, isDark }: TabButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.9, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.tabButton, animatedStyle]}
    >
      <View
        style={[
          styles.iconContainer,
          isActive && styles.activeIconContainer,
        ]}
      >
        <MaterialCommunityIcons
          name={icon}
          size={24}
          color={isActive ? '#FFFFFF' : isDark ? '#888888' : '#666666'}
        />
      </View>
    </AnimatedPressable>
  );
}

function LiquidGlassTabBar() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const pathname = usePathname();
  const router = useRouter();

  const tabs: { name: string; icon: TabIconName; route: '/(tabs)' | '/(tabs)/track' | '/(tabs)/history' }[] = [
    { name: 'index', icon: 'home-variant', route: '/(tabs)' },
    { name: 'track', icon: 'map-marker-path', route: '/(tabs)/track' },
    { name: 'history', icon: 'history', route: '/(tabs)/history' },
  ];

  const getIsActive = (name: string) => {
    if (name === 'index') return pathname === '/' || pathname === '/(tabs)' || pathname === '';
    return pathname.includes(name);
  };

  return (
    <View style={styles.tabBarWrapper}>
      <BlurView
        intensity={Platform.OS === 'ios' ? 80 : 100}
        tint={isDark ? 'dark' : 'light'}
        style={styles.blurContainer}
      >
        <View style={[styles.tabBarInner, { backgroundColor: isDark ? 'rgba(30, 30, 30, 0.6)' : 'rgba(255, 255, 255, 0.6)' }]}>
          {tabs.map((tab) => (
            <TabButton
              key={tab.name}
              icon={tab.icon}
              isActive={getIsActive(tab.name)}
              onPress={() => router.push(tab.route)}
              isDark={isDark}
            />
          ))}
        </View>
      </BlurView>
    </View>
  );
}

export default function TabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
          unmountOnBlur: true,
        }}
        tabBar={() => null}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="track" />
        <Tabs.Screen name="history" />
      </Tabs>
      <LiquidGlassTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    bottom: 25,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  blurContainer: {
    borderRadius: 35,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  tabBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 20,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIconContainer: {
    backgroundColor: '#FF5500',
    shadowColor: '#FF5500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});
