import { MapProvider } from '@/context/MapContext';
import { ThemeProvider as CustomThemeProvider, useTheme } from '@/context/ThemeContext';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '../global.css';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as Network from 'expo-network';
import Constants from 'expo-constants';
import { Platform, View, Text } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import Config from '@/constants/Config';
import { SafeAreaView } from 'react-native-safe-area-context';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const { activeTheme } = useTheme();
  const [isConnected, setIsConnected] = useState(true);
  const [expoPushToken, setExpoPushToken] = useState('');
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    // Check Internet Connection
    const checkNetwork = async () => {
      try {
        const status = await Network.getNetworkStateAsync();
        setIsConnected(status.isConnected ?? false);
      } catch (e) {
        console.log('Network check failed', e);
      }
    };

    checkNetwork();
    
    // Optional: Poll every 5 seconds to keep it updated
    const interval = setInterval(checkNetwork, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    /* 
    // Push Notification Logic - Disabled for now
    registerForPushNotificationsAsync().then(token => {
        if (token) {
            setExpoPushToken(token);
            // Send to Backend
            fetch(`${Config.API_URL}/api/register-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    device_id: 'papaji_tractor_01', // Hardcoded for now, or get from storage
                    token: token 
                })
            }).catch(err => console.log('Token Upload Error:', err));
        }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification Received:', notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification Clicked:', response);
    });

    return () => {
      notificationListener.current && notificationListener.current.remove();
      responseListener.current && responseListener.current.remove();
    };
    */
  }, []);

  return (
    <NavThemeProvider value={activeTheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }}>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
        {!isConnected && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999, backgroundColor: '#ef4444', paddingTop: Platform.OS === 'ios' ? 50 : 30, paddingBottom: 10 }}>
             <View style={{ alignItems: 'center' }}>
                <Text style={{ color: 'white', fontWeight: 'bold' }}>No Internet Connection</Text>
             </View>
          </View>
        )}
      </View>
      <StatusBar style={activeTheme === 'dark' ? 'light' : 'dark'} />
    </NavThemeProvider>
  );
}

async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }
    
    // Get the token
    try {
        const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
        token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        console.log('Push Token:', token);
    } catch (e) {
        console.log('Error getting token:', e);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

export default function RootLayout() {
  return (
    <CustomThemeProvider>
      <MapProvider>
        <RootLayoutNav />
      </MapProvider>
    </CustomThemeProvider>
  );
}
