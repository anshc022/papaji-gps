import MapView, { Marker, Polyline, Callout, Circle } from '@/components/MapLib';
import { useMapType } from '@/context/MapContext';
import { useTheme } from '@/context/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useRef, useState, useEffect } from 'react';
import { Image, Text, TouchableOpacity, View, ToastAndroid, Platform } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/services/api';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';

export default function DashboardScreen() {
  const { themePreference, setThemePreference, activeTheme } = useTheme();
  const { mapType, setMapType } = useMapType();
  const isDark = activeTheme === 'dark';
  const mapRef = useRef<MapView>(null);
  
  const [stats, setStats] = useState({
    max_speed: 0,
    total_distance_km: 0,
    total_duration_minutes: 0,
    status: 'Offline',
    source: 'gps',
    signal: 0
  });

  useEffect(() => {
    loadStats();
    loadMapData();

    // Auto-refresh every 5 seconds for real-time tracking
    const interval = setInterval(() => {
      loadStats();
      loadMapData();
    }, 5000);

    return () => clearInterval(interval);
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

  const toggleViewMode = () => {
    setViewMode(prev => prev === 'gps' ? 'gsm' : 'gps');
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
  const [gsmPoints, setGsmPoints] = useState<any[]>([]);
  const [stops, setStops] = useState<any[]>([]);
  const [hasCentered, setHasCentered] = useState(false);
  const [viewMode, setViewMode] = useState<'gps' | 'gsm'>('gps');

  const loadMapData = async () => {
    try {
      const history = await api.getHistory('papaji_tractor_01');
      if (history && history.length > 0) {
        // Separate GPS and GSM points
        const gpsRoute = history.filter((p: any) => p.source !== 'gsm').map((p: any) => ({
          latitude: p.latitude,
          longitude: p.longitude
        }));
        const gsmRoute = history.filter((p: any) => p.source === 'gsm').map((p: any) => ({
          latitude: p.latitude,
          longitude: p.longitude
        }));
        
        setRouteCoordinates(gpsRoute);
        setGsmPoints(gsmRoute);

        // Auto-switch to GSM if no GPS data
        if (gpsRoute.length === 0 && gsmRoute.length > 0) {
            setViewMode('gsm');
        }
        
        // Calculate Stops (Gaps > 5 mins)
        let rawStops = [];
        for (let i = 0; i < history.length - 1; i++) {
            const p1 = history[i];
            const p2 = history[i+1];
            
            const t1 = new Date(p1.created_at).getTime();
            const t2 = new Date(p2.created_at).getTime();
            const diffMins = (t2 - t1) / 1000 / 60;

            if (diffMins >= 5) {
                rawStops.push({
                    latitude: p1.latitude,
                    longitude: p1.longitude,
                    duration: Math.round(diffMins),
                    startTime: t1,
                    timeLabel: new Date(p1.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                });
            }
        }

        // Merge consecutive stops at same location (< 50m)
        const mergedStops = [];
        if (rawStops.length > 0) {
            let current = rawStops[0];
            
            for (let i = 1; i < rawStops.length; i++) {
                const next = rawStops[i];
                const dLat = Math.abs(current.latitude - next.latitude);
                const dLon = Math.abs(current.longitude - next.longitude);
                
                // Approx 50m ~ 0.0005 degrees
                if (dLat < 0.0005 && dLon < 0.0005) {
                    // Merge
                    current.duration += next.duration;
                } else {
                    // Push and move to next
                    mergedStops.push(current);
                    current = next;
                }
            }
            mergedStops.push(current);
        }

        setStops(mergedStops.map(s => ({
            latitude: s.latitude,
            longitude: s.longitude,
            duration: s.duration,
            time: s.timeLabel
        })));

        // Use last point from history (could be GPS or GSM)
        const lastHistoryPoint = history[history.length - 1];
        const lastPoint = { latitude: lastHistoryPoint.latitude, longitude: lastHistoryPoint.longitude };
        setTractorLocation(lastPoint);

        // Auto-center on first load
        if (!hasCentered) {
           mapRef.current?.animateToRegion({
             latitude: lastPoint.latitude,
             longitude: lastPoint.longitude,
             latitudeDelta: 0.005,
             longitudeDelta: 0.005,
           }, 1000);
           setHasCentered(true);
        }
      }
    } catch (e) {
      console.log('Error loading map data');
    }
  };

  const getCurrentLocation = () => {
    if (viewMode === 'gps' && routeCoordinates.length > 0) return routeCoordinates[routeCoordinates.length - 1];
    if (viewMode === 'gsm' && gsmPoints.length > 0) return gsmPoints[gsmPoints.length - 1];
    return tractorLocation;
  };

  const centerOnTractor = () => {
    const loc = getCurrentLocation();
    mapRef.current?.animateToRegion({
      ...loc,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    }, 1000);
  };

  const handleRefresh = async () => {
    await Promise.all([loadStats(), loadMapData()]);
  };

  const speakLocation = async () => {
    if (Platform.OS === 'android') {
        ToastAndroid.show("पता ढूंढा जा रहा है...", ToastAndroid.SHORT);
    }

    try {
      const { latitude, longitude } = getCurrentLocation();
      let addressObj = null;

      // 1. Try Native Geocoder (Google Play Services)
      try {
          const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
          if (address) addressObj = address;
      } catch (e) {
          console.log("Native Geocoder failed, trying fallback...");
      }

      // 2. Fallback to OpenStreetMap (Nominatim) - No Key Required
      if (!addressObj) {
          try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=hi`, {
                headers: { 'User-Agent': 'PapajiGPS/1.0' }
            });
            const data = await response.json();
            if (data && data.address) {
                addressObj = {
                    street: data.address.road || data.address.pedestrian || data.address.path,
                    district: data.address.suburb || data.address.neighbourhood || data.address.county,
                    city: data.address.city || data.address.town || data.address.village,
                    region: data.address.state,
                    isoCountryCode: 'IN'
                };
            }
          } catch (err) {
              console.log("Nominatim fallback failed");
          }
      }
      
      if (addressObj) {
        const parts = [
            addressObj.street, 
            addressObj.district, 
            addressObj.city, 
            addressObj.region
        ].filter(Boolean);
        
        const text = parts.length > 0 
            ? `ट्रैक्टर अभी ${parts.join(', ')} में है`
            : "पता नहीं मिला, लेकिन लोकेशन उपलब्ध है";
            
        Speech.stop(); // Stop previous speech
        Speech.speak(text, { language: 'hi-IN' });
      } else {
        Speech.speak("पता निर्धारित नहीं किया जा सका", { language: 'hi-IN' });
        if (Platform.OS === 'android') ToastAndroid.show("Address not found", ToastAndroid.SHORT);
      }
    } catch (error: any) {
      console.log(error);
      const errText = error?.message || "लोकेशन विवरण खोजने में त्रुटि हुई";
      Speech.speak("त्रुटि हुई", { language: 'hi-IN' });
      if (Platform.OS === 'android') {
          ToastAndroid.show(errText, ToastAndroid.LONG);
      }
    }
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
        initialRegion={region}
        customMapStyle={isDark ? darkMapStyle : []}
        mapType={mapType}
      >
        {/* GPS Route - Orange */}
        {viewMode === 'gps' && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#FF5500"
            strokeWidth={4}
          />
        )}
        
        {/* GSM Route - Purple Circles (Approximate Location) */}
        {viewMode === 'gsm' && gsmPoints.map((point, index) => (
          <Circle
            key={`gsm-circle-${index}`}
            center={{ latitude: point.latitude, longitude: point.longitude }}
            radius={500} // 500 meters approximation
            strokeColor="rgba(147, 51, 234, 0.5)" // Purple
            fillColor="rgba(147, 51, 234, 0.2)"
          />
        ))}
        
        {stops.map((stop, index) => (
          <Marker 
            key={`stop-${index}`}
            coordinate={stop}
          >
            <View className="bg-red-600 px-2 py-1 rounded-md border border-white shadow-sm">
               <Text className="text-white text-[10px] font-bold">{stop.duration}m</Text>
            </View>
            <Callout tooltip>
                <View className="bg-white p-2 rounded-lg shadow-lg border border-gray-200 w-32 items-center">
                    <Text className="font-bold text-black mb-1">Stopped</Text>
                    <Text className="text-black">{stop.duration} mins</Text>
                    <Text className="text-xs text-gray-500 mt-1">At {stop.time}</Text>
                </View>
            </Callout>
          </Marker>
        ))}

        <Marker 
          coordinate={getCurrentLocation()}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          {viewMode === 'gps' ? (
            <View className="bg-primary p-2 rounded-full border-4 border-white/20 shadow-lg">
              <MaterialCommunityIcons name="navigation" size={20} color="white" style={{ transform: [{ rotate: '45deg' }] }} />
            </View>
          ) : (
            <View className="items-center justify-center" style={{ width: 80, height: 80 }}>
               <View className="w-full h-full bg-purple-500/30 rounded-full border border-purple-500" />
               <View className="absolute w-4 h-4 bg-purple-700 rounded-full border-2 border-white" />
            </View>
          )}
        </Marker>
      </MapView>

      {/* Header Overlay */}
      <SafeAreaView className="absolute top-0 left-0 right-0 z-10 px-4" edges={['top']} pointerEvents="box-none">
        <View className="flex-row justify-between items-start mt-4" pointerEvents="box-none">
          
          {/* Left Column: Title + Legend */}
          <View className="flex-1 mr-4">
            {/* Title */}
            <Animated.View entering={FadeInUp.delay(300).springify()} className="bg-white/80 dark:bg-dark-card/80 p-4 rounded-2xl backdrop-blur-md shadow-sm flex-row items-center gap-3">
              <Image source={require('@/assets/images/icon.png')} className="w-12 h-12 rounded-xl" />
              <View className="flex-1">
                <Text className="text-black dark:text-white text-xl font-bold">Papaji Tractor</Text>
                <View className="flex-row items-center gap-1 flex-wrap">
                  <Text className="text-gray-500 dark:text-dark-subtext text-xs">Mahindra 575 DI</Text>
                  
                  {/* Status Badge */}
                  <View className={`px-1.5 py-0.5 rounded-md ${stats.status === 'Online' ? 'bg-green-100' : 'bg-red-100'}`}>
                    <Text className={`text-[10px] font-bold ${stats.status === 'Online' ? 'text-green-700' : 'text-red-700'}`}>
                      {stats.status}
                    </Text>
                  </View>

                  {/* Source Badge (Only if Online) */}
                  {stats.status === 'Online' && (
                    <View className={`px-1.5 py-0.5 rounded-md ${stats.source === 'gps' ? 'bg-blue-100' : 'bg-yellow-100'}`}>
                        <Text className={`text-[10px] font-bold ${stats.source === 'gps' ? 'text-blue-700' : 'text-yellow-700'}`}>
                          {stats.source === 'gps' ? 'GPS' : 'GSM'}
                        </Text>
                    </View>
                  )}

                  {/* Signal Strength (Always Show if available) */}
                  {stats.signal > 0 && (
                    <View className="flex-row items-center ml-1 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-md">
                        <MaterialCommunityIcons 
                          name={stats.signal > 20 ? "signal-cellular-3" : stats.signal > 10 ? "signal-cellular-2" : "signal-cellular-1"} 
                          size={12} 
                          color={stats.signal > 15 ? "#16a34a" : "#ca8a04"} 
                        />
                        <Text className="text-[10px] font-bold text-gray-600 dark:text-gray-300 ml-1">{stats.signal}</Text>
                    </View>
                  )}
                </View>
              </View>
            </Animated.View>

            {/* Map Legend - Moved here to stay on left */}
            <Animated.View entering={FadeIn.delay(500)} className="self-start bg-white/90 dark:bg-dark-card/90 px-3 py-2 rounded-xl mt-2">
              <View className="flex-row items-center gap-3">
                {viewMode === 'gps' && (
                  <View className="flex-row items-center gap-1">
                    <View className="w-4 h-1 bg-[#FF5500] rounded" />
                    <Text className="text-[10px] text-black dark:text-white">GPS Route</Text>
                  </View>
                )}
                {viewMode === 'gsm' && (
                  <View className="flex-row items-center gap-1">
                    <View className="w-4 h-4 rounded-full bg-purple-600/20 border border-purple-600" />
                    <Text className="text-[10px] text-black dark:text-white">GSM Approx</Text>
                  </View>
                )}
              </View>
            </Animated.View>
          </View>

          {/* Floating Action Buttons */}
          <Animated.View entering={FadeInUp.delay(400).springify()} className="gap-3">
            <TouchableOpacity 
              onPress={speakLocation} 
              className="bg-white dark:bg-dark-card p-3 rounded-full shadow-lg items-center justify-center"
              style={{ width: 50, height: 50 }}
            >
              <MaterialCommunityIcons name="volume-high" size={24} color={isDark ? "white" : "black"} />
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={handleRefresh} 
              className="bg-white dark:bg-dark-card p-3 rounded-full shadow-lg items-center justify-center"
              style={{ width: 50, height: 50 }}
            >
              <MaterialCommunityIcons name="refresh" size={24} color={isDark ? "white" : "black"} />
            </TouchableOpacity>

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
      <View className="absolute bottom-32 left-0 right-0 px-4" pointerEvents="box-none">
        
        {/* Controls Row: View Toggle (Left) & Locate (Right) */}
        <Animated.View entering={FadeInDown.delay(600).springify()} className="flex-row justify-between items-end mb-4">
            <TouchableOpacity 
              onPress={toggleViewMode} 
              className={`p-3 rounded-full shadow-lg items-center justify-center ${viewMode === 'gps' ? 'bg-white dark:bg-dark-card' : 'bg-purple-100 dark:bg-purple-900'}`}
              style={{ width: 50, height: 50 }}
            >
              <MaterialCommunityIcons name={viewMode === 'gps' ? "satellite-uplink" : "access-point-network"} size={24} color={viewMode === 'gps' ? (isDark ? "black" : "white") : "#9333EA"} />
            </TouchableOpacity>

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
                 <MaterialCommunityIcons name="clock-outline" size={14} color="white" />
               </View>
             </View>
             <Text className="text-white text-xl font-bold" numberOfLines={1} adjustsFontSizeToFit>
               {Math.floor(stats.total_duration_minutes / 60)}h {stats.total_duration_minutes % 60}m
             </Text>
          </Animated.View>

          {/* Distance Card */}
          <Animated.View entering={FadeInDown.delay(500).springify()} className="flex-1 h-32 bg-white dark:bg-dark-card rounded-3xl p-3 justify-between shadow-lg">
             <View className="flex-row justify-between items-start">
               <Text className="text-black dark:text-white font-medium text-xs">Distance</Text>
               <View className="bg-black dark:bg-white/20 p-1.5 rounded-full">
                 <MaterialCommunityIcons name="map-marker-distance" size={14} color="white" />
               </View>
             </View>
             <Text className="text-black dark:text-white text-xl font-bold" numberOfLines={1} adjustsFontSizeToFit>
               {stats.total_distance_km}km
             </Text>
          </Animated.View>

          {/* Speed Card */}
          <Animated.View entering={FadeInDown.delay(600).springify()} className="flex-1 h-32 bg-white dark:bg-dark-card rounded-3xl p-3 justify-between shadow-lg">
             <View className="flex-row justify-between items-start">
               <Text className="text-black dark:text-white font-medium text-xs">Max Speed</Text>
               <View className="bg-black dark:bg-white/20 p-1.5 rounded-full">
                 <MaterialCommunityIcons name="speedometer" size={14} color="white" />
               </View>
             </View>
             <Text className="text-black dark:text-white text-xl font-bold" numberOfLines={1} adjustsFontSizeToFit>
               {stats.max_speed}km/h
             </Text>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}
