import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Image, Text, View, useColorScheme } from 'react-native';
import Animated, { FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SplashScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/(tabs)');
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View className="flex-1 bg-white dark:bg-dark-bg">
      {/* Decorative Background */}
      <View className="absolute top-0 left-0 right-0 h-[60%] bg-primary/10 rounded-b-[60px]" />
      <View className="absolute -top-20 -right-20 w-64 h-64 bg-primary/20 rounded-full blur-3xl" />
      <View className="absolute top-40 -left-20 w-40 h-40 bg-orange-300/20 rounded-full blur-2xl" />

      <SafeAreaView className="flex-1 justify-between" edges={['top', 'bottom']}>
        
        {/* Main Content */}
        <View className="flex-1 items-center justify-center px-8">
          
          {/* Logo Container */}
          <Animated.View 
            entering={FadeIn.duration(1000).springify()} 
            className="items-center mb-12"
          >
            <View className="w-48 h-48 bg-white dark:bg-dark-card rounded-[40px] shadow-2xl shadow-orange-500/20 items-center justify-center mb-8 border border-gray-100 dark:border-gray-800">
              <Image 
                source={require('@/assets/images/icon.png')} 
                style={{ width: 120, height: 120 }} 
                resizeMode="contain" 
              />
            </View>
            
            <Text className="text-5xl font-black text-black dark:text-white tracking-tighter text-center mb-2">
              Papaji<Text className="text-primary">GPS</Text>
            </Text>
            <Text className="text-gray-500 dark:text-gray-400 text-lg font-medium tracking-wide">
              TRACK • MONITOR • FARM
            </Text>
          </Animated.View>

          {/* Features Grid (Small) */}
          <Animated.View 
            entering={FadeInDown.delay(300).springify()}
            className="flex-row gap-4"
          >
            <View className="items-center gap-2">
              <View className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full items-center justify-center">
                <MaterialCommunityIcons name="satellite-variant" size={24} color="#FF5500" />
              </View>
              <Text className="text-xs font-bold text-gray-400">Live</Text>
            </View>
            <View className="items-center gap-2">
              <View className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full items-center justify-center">
                <MaterialCommunityIcons name="history" size={24} color="#FF5500" />
              </View>
              <Text className="text-xs font-bold text-gray-400">History</Text>
            </View>
            <View className="items-center gap-2">
              <View className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full items-center justify-center">
                <MaterialCommunityIcons name="chart-bar" size={24} color="#FF5500" />
              </View>
              <Text className="text-xs font-bold text-gray-400">Stats</Text>
            </View>
          </Animated.View>

        </View>

        {/* Bottom Card */}
        <Animated.View 
          entering={SlideInDown.delay(600).springify()}
          className="mx-6 mb-8"
        >
          <View className="bg-black dark:bg-white p-1 rounded-[24px] flex-row items-center justify-between pl-6 pr-2 py-2 shadow-xl">
            <View>
              <Text className="text-white dark:text-black font-bold text-lg">Get Started</Text>
              <Text className="text-gray-400 dark:text-gray-500 text-xs">Loading your dashboard...</Text>
            </View>
            <View className="bg-primary h-12 w-12 rounded-full items-center justify-center">
              <MaterialCommunityIcons name="arrow-right" size={24} color="white" />
            </View>
          </View>
        </Animated.View>

      </SafeAreaView>
    </View>
  );
}
