import MapView, { Marker, Polyline } from '@/components/MapLib';
import { useMapType } from '@/context/MapContext';
import { useTheme } from '@/context/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useRef, useState, useEffect } from 'react';
import { Text, TouchableOpacity, View, ToastAndroid, Platform, RefreshControl, ScrollView } from 'react-native';
import Animated, { FadeInDown, FadeInUp, FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/services/api';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';

export default function DashboardScreen() {
  const { activeTheme, setThemePreference } = useTheme();
  const { mapType, setMapType } = useMapType();
  const isDark = activeTheme === 'dark';
  
  const toggleTheme = () => {
    setThemePreference(isDark ? 'light' : 'dark');
  };
  const mapRef = useRef<MapView>(null);
  
  const [stats, setStats] = useState({
    max_speed: 0,
    total_distance_km: 0,
    total_duration_minutes: 0,
    status: 'Offline',
    source: 'gps',
    signal: 0,
    lastUpdate: ''
  });

  const [tractorLocation, setTractorLocation] = useState({ latitude: 30.7333, longitude: 76.7794 });
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [routeCoordinates, setRouteCoordinates] = useState<any[]>([]);
  const [hasCentered, setHasCentered] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [region] = useState({
    latitude: 30.7333,
    longitude: 76.7794,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    await Promise.all([loadStats(), loadMapData()]);
  };

  const loadStats = async () => {
    try {
      const data = await api.getStats('papaji_tractor_01');
      if (data) {
        setStats({
          max_speed: data.max_speed || 0,
          total_distance_km: data.total_distance_km || 0,
          total_duration_minutes: data.total_duration_minutes || 0,
          status: data.status || 'Offline',
          source: data.source || 'gps',
          signal: data.signal || 0,
          lastUpdate: data.last_update || ''
        });
      }
    } catch (e) {
      console.log('Failed to load stats');
    }
  };

  // Helper to get local YYYY-MM-DD for today
  const getTodayDateString = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localDate = new Date(now.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };

  const loadMapData = async () => {
    try {
      const todayDate = getTodayDateString();
      const [history, latestPoint] = await Promise.all([
        api.getHistoryByDate('papaji_tractor_01', todayDate),
        api.getLatest('papaji_tractor_01')
      ]);

      // Build route from today's history (backend already filters duplicates)
      if (history && history.length > 0) {
        const route = history.map((p: any) => ({
          latitude: p.latitude,
          longitude: p.longitude
        }));
        setRouteCoordinates(route);
      } else {
        setRouteCoordinates([]);
      }

      // Set live tractor location from latest point
      const livePoint = latestPoint || (history && history.length > 0 ? history[history.length - 1] : null);
      if (livePoint) {
        const nextLocation = {
          latitude: livePoint.latitude,
          longitude: livePoint.longitude,
        };

        setTractorLocation(nextLocation);
        setCurrentSpeed((livePoint as any).speed_kmh || (livePoint as any).speed || 0);

        if (!hasCentered) {
          mapRef.current?.animateToRegion({
            ...nextLocation,
            latitudeDelta: 0.008,
            longitudeDelta: 0.008,
          }, 1000);
          setHasCentered(true);
        }
      }
    } catch (e) {
      console.log('Error loading map data');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const centerOnTractor = () => {
    mapRef.current?.animateToRegion({
      ...tractorLocation,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    }, 500);
  };

  const toggleMapType = () => {
    const types = ['standard', 'satellite', 'hybrid', 'terrain'];
    const idx = types.indexOf(mapType);
    setMapType(types[(idx + 1) % types.length] as any);
  };

  const speakLocation = async () => {
    if (Platform.OS === 'android') {
      ToastAndroid.show("पता ढूंढ रहे हैं...", ToastAndroid.SHORT);
    }
    
    // Check if we have valid tractor coordinates
    if (!tractorLocation.latitude || !tractorLocation.longitude || 
        tractorLocation.latitude === 0 || tractorLocation.longitude === 0) {
      Speech.speak("ट्रैक्टर का लोकेशन अभी उपलब्ध नहीं है", { language: 'hi-IN' });
      return;
    }
    
    try {
      // Use OpenStreetMap Nominatim API with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${tractorLocation.latitude}&lon=${tractorLocation.longitude}&accept-language=hi`,
        {
          method: 'GET',
          headers: {
            'User-Agent': 'PapajiGPS/1.0',
            'Accept': 'application/json'
          },
          signal: controller.signal
        }
      );
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data && data.display_name) {
          // Get short address parts
          const addr = data.address || {};
          const parts = [];
          
          if (addr.road || addr.hamlet || addr.village) {
            parts.push(addr.road || addr.hamlet || addr.village);
          }
          if (addr.suburb || addr.neighbourhood) {
            parts.push(addr.suburb || addr.neighbourhood);
          }
          if (addr.city || addr.town || addr.county) {
            parts.push(addr.city || addr.town || addr.county);
          }
          if (addr.state_district || addr.district) {
            parts.push(addr.state_district || addr.district);
          }
          if (addr.state) {
            parts.push(addr.state);
          }
          if (addr.postcode) {
            parts.push(`पिन ${addr.postcode}`);
          }
          
          const uniqueParts = [...new Set(parts)];
          const fullAddress = uniqueParts.length > 0 ? uniqueParts.join(', ') : data.display_name;
          
          const text = `ट्रैक्टर अभी ${fullAddress} में है। स्पीड ${currentSpeed.toFixed(0)} किलोमीटर प्रति घंटा है।`;
          Speech.speak(text, { language: 'hi-IN' });
          
          if (Platform.OS === 'android') {
            ToastAndroid.show(fullAddress, ToastAndroid.LONG);
          }
        } else {
          Speech.speak("पता नहीं मिल पाया", { language: 'hi-IN' });
        }
      } else {
        console.log('Geocode response not ok:', response.status);
        Speech.speak("पता सर्वर से नहीं मिला", { language: 'hi-IN' });
      }
    } catch (e: any) {
      console.log('Reverse geocode error:', e?.message || e);
      if (e?.name === 'AbortError') {
        Speech.speak("पता लोड होने में समय लग रहा है, दोबारा कोशिश करें", { language: 'hi-IN' });
      } else {
        // Fallback - just speak coordinates
        const lat = tractorLocation.latitude.toFixed(4);
        const lon = tractorLocation.longitude.toFixed(4);
        Speech.speak(`ट्रैक्टर की लोकेशन ${lat} अक्षांश, ${lon} देशांतर पर है। स्पीड ${currentSpeed.toFixed(0)} किलोमीटर प्रति घंटा।`, { language: 'hi-IN' });
        if (Platform.OS === 'android') {
          ToastAndroid.show(`${lat}, ${lon}`, ToastAndroid.LONG);
        }
      }
    }
  };

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const getStatusColor = () => {
    if (stats.status === 'Online') return '#22c55e';
    if (stats.status === 'Stale') return '#f59e0b';
    return '#ef4444';
  };

  const darkMapStyle = [
    { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
    { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a1a" }] },
    { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a0a0a" }] }
  ];

  return (
    <View 
      className="flex-1"
      style={{ backgroundColor: isDark ? '#0a0a0a' : '#f9fafb' }}
    >
      {/* Map */}
      <View style={{ flex: 1 }}>
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          initialRegion={region}
          customMapStyle={isDark ? darkMapStyle : []}
          mapType={mapType}
        >
          {/* Today's Route Line */}
          {routeCoordinates.length > 1 && (
            <Polyline
              coordinates={routeCoordinates}
              strokeColor="#FF5500"
              strokeWidth={4}
            />
          )}

          {/* Tractor Marker - Live Location */}
          <Marker 
            coordinate={tractorLocation}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View 
              className="items-center justify-center rounded-full border-4 border-white"
              style={{ 
                backgroundColor: getStatusColor(),
                width: 50, 
                height: 50,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.27,
                shadowRadius: 4.65,
                elevation: 6
              }}
            >
              <MaterialCommunityIcons name="tractor-variant" size={26} color="white" />
            </View>
          </Marker>
        </MapView>

        {/* Top Status Bar */}
        <SafeAreaView className="absolute top-0 left-0 right-0 z-10 px-4" edges={['top']}>
          <Animated.View entering={FadeInUp.delay(200)} className="flex-row justify-between items-start mt-2">
            {/* Status Card */}
            <View 
              className="flex-row items-center px-4 py-3 rounded-2xl"
              style={{ backgroundColor: isDark ? 'rgba(26,26,26,0.95)' : 'rgba(255,255,255,0.95)' }}
            >
              <View style={{ backgroundColor: getStatusColor() }} className="w-3 h-3 rounded-full mr-3" />
              <View>
                <Text className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Papaji Tractor</Text>
                <View className="flex-row items-center gap-2">
                  <Text className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {stats.status}
                  </Text>
                  {stats.source && (
                    <View className={`px-1.5 py-0.5 rounded ${stats.source === 'gps' ? 'bg-green-500/20' : 'bg-amber-500/20'}`}>
                      <Text className={`text-[10px] font-medium ${stats.source === 'gps' ? 'text-green-600' : 'text-amber-600'}`}>
                        {stats.source.toUpperCase()}
                      </Text>
                    </View>
                  )}
                  {stats.signal > 0 && (
                    <View 
                      className="flex-row items-center px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: isDark ? '#2a2a2a' : '#f3f4f6' }}
                    >
                      <MaterialCommunityIcons 
                        name="signal" 
                        size={12} 
                        color={stats.signal > 15 ? "#22c55e" : stats.signal > 8 ? "#f59e0b" : "#ef4444"} 
                      />
                      <Text className={`text-[10px] font-bold ml-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                        {stats.signal}/31
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </Animated.View>
        </SafeAreaView>

        {/* Map Controls - Map Type, Refresh & Theme */}
        <View className="absolute right-4 top-24 z-10 gap-2">
          <TouchableOpacity 
            onPress={toggleMapType}
            className="w-12 h-12 rounded-xl items-center justify-center shadow-lg"
            style={{ backgroundColor: isDark ? '#1a1a1a' : '#ffffff' }}
          >
            <MaterialCommunityIcons name="layers" size={22} color={isDark ? '#fff' : '#333'} />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={onRefresh}
            className="w-12 h-12 rounded-xl items-center justify-center shadow-lg"
            style={{ backgroundColor: isDark ? '#1a1a1a' : '#ffffff' }}
          >
            <MaterialCommunityIcons name="refresh" size={22} color={isDark ? '#fff' : '#333'} />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={toggleTheme}
            className="w-12 h-12 rounded-xl items-center justify-center shadow-lg"
            style={{ backgroundColor: isDark ? '#1a1a1a' : '#ffffff' }}
          >
            <MaterialCommunityIcons 
              name={isDark ? 'moon-waning-crescent' : 'white-balance-sunny'} 
              size={22} 
              color={isDark ? '#fff' : '#333'} 
            />
          </TouchableOpacity>
        </View>

        {/* Bottom Stats Panel - Curved Card */}
        <Animated.View 
          entering={FadeInDown.delay(300).springify()} 
          className="absolute bottom-0 left-0 right-0 rounded-t-3xl"
          style={{ paddingBottom: 90, backgroundColor: isDark ? '#1a1a1a' : '#ffffff' }}
        >
          {/* Handle Bar */}
          <View className="items-center pt-3 pb-2">
            <View 
              className="w-10 h-1 rounded-full"
              style={{ backgroundColor: isDark ? '#3a3a3a' : '#d1d5db' }}
            />
          </View>

          {/* Today's Stats */}
          <Text className={`text-xs font-medium mb-3 px-5 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
            TODAY'S ACTIVITY
          </Text>
          
          {/* Stats Row - Unified Design */}
          <View className="flex-row justify-around py-4 px-5">
            <View className="items-center flex-1">
              <View className="bg-[#FF5500]/10 p-3 rounded-xl mb-2">
                <MaterialCommunityIcons name="road-variant" size={24} color="#FF5500" />
              </View>
            <Text className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {stats.total_distance_km}
            </Text>
            <Text className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>km</Text>
          </View>
          
          <View style={{ width: 1, backgroundColor: isDark ? '#2a2a2a' : '#e5e7eb' }} />
          
          <View className="items-center flex-1">
            <View className="bg-blue-500/10 p-3 rounded-xl mb-2">
              <MaterialCommunityIcons name="clock-outline" size={24} color="#3b82f6" />
            </View>
            <Text className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {formatDuration(stats.total_duration_minutes)}
            </Text>
            <Text className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>active</Text>
          </View>
          
          <View style={{ width: 1, backgroundColor: isDark ? '#2a2a2a' : '#e5e7eb' }} />
          
          <View className="items-center flex-1">
            <View className="bg-green-500/10 p-3 rounded-xl mb-2">
              <MaterialCommunityIcons name="speedometer" size={24} color="#22c55e" />
            </View>
            <Text className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {stats.max_speed}
            </Text>
            <Text className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>km/h max</Text>
          </View>
          </View>

          {/* Quick Actions */}
          <View className="flex-row gap-3 mt-4 px-5">
            <TouchableOpacity 
              onPress={centerOnTractor}
              className="flex-1 bg-[#FF5500] flex-row items-center justify-center py-4 rounded-2xl"
            >
              <MaterialCommunityIcons name="target" size={20} color="white" />
              <Text className="ml-2 font-bold text-white">Locate</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={speakLocation}
              className="flex-1 flex-row items-center justify-center py-4 rounded-2xl"
              style={{ backgroundColor: isDark ? '#2a2a2a' : '#e5e7eb' }}
            >
              <MaterialCommunityIcons name="volume-high" size={20} color={isDark ? '#fff' : '#333'} />
              <Text className={`ml-2 font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Speak</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}
