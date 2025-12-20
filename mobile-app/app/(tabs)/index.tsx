import MapView, { Marker, Polyline } from '@/components/MapLib';
import { useMapType } from '@/context/MapContext';
import { useTheme } from '@/context/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useRef, useState, useEffect } from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/services/api';

export default function DashboardScreen() {
  const { themePreference, setThemePreference, activeTheme } = useTheme();
  const { mapType, setMapType } = useMapType();
  const isDark = activeTheme === 'dark';
  const mapRef = useRef<MapView>(null);
  
  const [stats, setStats] = useState({
    max_speed: 0,
    total_distance_km: 0,
    status: 'Offline'
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await api.getStats('papaji_tractor_01');
      setStats(data);
    } catch (e) {
      console.log('Failed to load stats');
    }
  };

  const toggleTheme = () => {
    if (themePreference === 'system') setThemePreference('light');
    else if (themePreference === 'light') setThemePreference('dark');
    else setThemePreference('system');
  };

  const getThemeIcon = () => {
    if (themePreference === 'system') return 'theme-light-dark';
    if (themePreference === 'light') return 'weather-sunny';
    return 'weather-night';
  };

  const toggleMapType = () => {
    if (mapType === 'standard') setMapType('satellite');
    else if (mapType === 'satellite') setMapType('hybrid');
    else if (mapType === 'hybrid') setMapType('terrain');
    else setMapType('standard');
  };

  const getMapTypeIcon = () => {
    if (mapType === 'standard') return 'map-outline';
    if (mapType === 'satellite') return 'satellite-variant';
    if (mapType === 'hybrid') return 'layers-triple';
    return 'terrain';
  };

  const [region] = useState({
    latitude: 30.7333,
    longitude: 76.7794,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });

  const [tractorLocation, setTractorLocation] = useState({
    latitude: 30.7333,
    longitude: 76.7794,
  });

  const [routeCoordinates, setRouteCoordinates] = useState<any[]>([]);

  useEffect(() => {
    loadMapData();
  }, []);

  const loadMapData = async () => {
    try {
      const history = await api.getHistory('papaji_tractor_01');
      if (history && history.length > 0) {
        const route = history.map((p: any) => ({
          latitude: p.latitude,
          longitude: p.longitude
        }));
        setRouteCoordinates(route);
        
        const lastPoint = route[route.length - 1];
        setTractorLocation(lastPoint);
      }
    } catch (e) {
      console.log('Error loading map data');
    }
  };

  const centerOnTractor = () => {
    mapRef.current?.animateToRegion({
      ...tractorLocation,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    }, 1000);
  };

  const darkMapStyle = [
    {
      "elementType": "geometry",
      "stylers": [{ "color": "#212121" }]
    },
    {
      "elementType": "labels.icon",
      "stylers": [{ "visibility": "off" }]
    },
    {
      "elementType": "labels.text.fill",
      "stylers": [{ "color": "#757575" }]
    },
    {
      "elementType": "labels.text.stroke",
      "stylers": [{ "color": "#212121" }]
    },
    {
      "featureType": "administrative",
      "elementType": "geometry",
      "stylers": [{ "color": "#757575" }]
    },
    {
      "featureType": "poi",
      "elementType": "labels.text.fill",
      "stylers": [{ "color": "#757575" }]
    },
    {
      "featureType": "road",
      "elementType": "geometry.fill",
      "stylers": [{ "color": "#2c2c2c" }]
    },
    {
      "featureType": "road",
      "elementType": "labels.text.fill",
      "stylers": [{ "color": "#8a8a8a" }]
    },
    {
      "featureType": "water",
      "elementType": "geometry",
      "stylers": [{ "color": "#000000" }]
    }
  ];

  return (
    <View className="flex-1 bg-gray-100 dark:bg-dark-bg">
      {/* Full Screen Map */}
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        region={region}
        customMapStyle={isDark ? darkMapStyle : []}
        mapType={mapType}
      >
        <Polyline
          coordinates={routeCoordinates}
          strokeColor="#FF5500"
          strokeWidth={4}
        />
        
        <Marker coordinate={tractorLocation}>
          <View className="bg-primary p-2 rounded-full border-4 border-white/20 shadow-lg">
            <MaterialCommunityIcons name="navigation" size={20} color="white" style={{ transform: [{ rotate: '45deg' }] }} />
          </View>
        </Marker>
      </MapView>

      {/* Header Overlay */}
      <SafeAreaView className="absolute top-0 left-0 right-0 z-10 px-4" edges={['top']} pointerEvents="box-none">
        <View className="flex-row justify-between items-start mt-4" pointerEvents="box-none">
          
          {/* Title */}
          <Animated.View entering={FadeInUp.delay(300).springify()} className="bg-white/80 dark:bg-dark-card/80 p-4 rounded-2xl backdrop-blur-md shadow-sm max-w-[75%] flex-row items-center gap-3">
            <Image source={require('@/assets/images/icon.png')} className="w-12 h-12 rounded-xl" />
            <View>
              <Text className="text-black dark:text-white text-xl font-bold">Papaji Tractor</Text>
              <Text className="text-gray-500 dark:text-dark-subtext text-xs">Mahindra 575 DI</Text>
            </View>
          </Animated.View>

          {/* Floating Action Buttons */}
          <Animated.View entering={FadeInUp.delay(400).springify()} className="gap-3">
            <TouchableOpacity 
              onPress={toggleMapType} 
              className="bg-white dark:bg-dark-card p-3 rounded-full shadow-lg items-center justify-center"
              style={{ width: 50, height: 50 }}
            >
              <MaterialCommunityIcons name={getMapTypeIcon()} size={24} color={isDark ? "white" : "black"} />
            </TouchableOpacity>
            
            <TouchableOpacity 
              onPress={toggleTheme} 
              className="bg-white dark:bg-dark-card p-3 rounded-full shadow-lg items-center justify-center"
              style={{ width: 50, height: 50 }}
            >
              <MaterialCommunityIcons name={getThemeIcon()} size={24} color={isDark ? "white" : "black"} />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </SafeAreaView>

      {/* Bottom Stats Cards */}
      <View className="absolute bottom-36 left-0 right-0 px-4" pointerEvents="box-none">
        
        {/* Locate Button */}
        <Animated.View entering={FadeInDown.delay(600).springify()} className="items-end mb-4">
            <TouchableOpacity 
              onPress={centerOnTractor} 
              className="bg-primary p-3 rounded-full shadow-lg items-center justify-center"
              style={{ width: 50, height: 50 }}
            >
              <MaterialCommunityIcons name="crosshairs-gps" size={24} color="white" />
            </TouchableOpacity>
        </Animated.View>

        <View className="flex-row gap-3">
          {/* Usage Time Card */}
          <Animated.View entering={FadeInDown.delay(400).springify()} className="flex-1 h-32 bg-[#FF5500] rounded-3xl p-3 justify-between shadow-lg shadow-orange-500/30">
             <View className="flex-row justify-between items-start">
               <Text className="text-white font-medium text-xs">Usage</Text>
               <View className="bg-black/20 p-1.5 rounded-full">
                 <MaterialCommunityIcons name="arrow-top-right" size={14} color="white" />
               </View>
             </View>
             <Text className="text-white text-xl font-bold" numberOfLines={1} adjustsFontSizeToFit>23h 16m</Text>
          </Animated.View>

          {/* Distance Card */}
          <Animated.View entering={FadeInDown.delay(500).springify()} className="flex-1 h-32 bg-white dark:bg-dark-card rounded-3xl p-3 justify-between shadow-lg">
             <View className="flex-row justify-between items-start">
               <Text className="text-black dark:text-white font-medium text-xs">Distance</Text>
               <View className="bg-black dark:bg-white/20 p-1.5 rounded-full">
                 <MaterialCommunityIcons name="arrow-top-right" size={14} color="white" />
               </View>
             </View>
             <Text className="text-black dark:text-white text-xl font-bold" numberOfLines={1} adjustsFontSizeToFit>169km</Text>
          </Animated.View>

          {/* Speed Card */}
          <Animated.View entering={FadeInDown.delay(600).springify()} className="flex-1 h-32 bg-white dark:bg-dark-card rounded-3xl p-3 justify-between shadow-lg">
             <View className="flex-row justify-between items-start">
               <Text className="text-black dark:text-white font-medium text-xs">Speed</Text>
               <View className="bg-black dark:bg-white/20 p-1.5 rounded-full">
                 <MaterialCommunityIcons name="arrow-top-right" size={14} color="white" />
               </View>
             </View>
             <Text className="text-black dark:text-white text-xl font-bold" numberOfLines={1} adjustsFontSizeToFit>12km/h</Text>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}
