import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Image, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SplashScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        router.replace('/(tabs)');
      } catch (e) {
        console.log('Navigation error:', e);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#000' : '#fff' }}>
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ 
          width: 150, 
          height: 150, 
          backgroundColor: isDark ? '#1a1a1a' : '#fff',
          borderRadius: 30,
          justifyContent: 'center',
          alignItems: 'center',
          shadowColor: '#FF5500',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 10,
          elevation: 10,
          marginBottom: 20,
        }}>
          <Image 
            source={require('@/assets/images/icon.png')} 
            style={{ width: 100, height: 100 }} 
            resizeMode="contain" 
          />
        </View>
        
        <Text style={{ 
          fontSize: 36, 
          fontWeight: 'bold', 
          color: isDark ? '#fff' : '#000',
          marginBottom: 8,
        }}>
          Papaji<Text style={{ color: '#FF5500' }}>GPS</Text>
        </Text>
        <Text style={{ color: '#888', fontSize: 14 }}>
          TRACK • MONITOR • FARM
        </Text>
        
        <View style={{ marginTop: 40 }}>
          <Text style={{ color: '#888' }}>Loading...</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}
