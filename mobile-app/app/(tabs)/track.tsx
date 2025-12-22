import MapView, { Marker, Polyline } from '@/components/MapLib';
import { useMapType } from '@/context/MapContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState, useRef } from 'react';
import { ScrollView, Text, TouchableOpacity, View, useColorScheme, Alert, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/services/api';
import { useEffect } from 'react';

export default function TrackScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { mapType } = useMapType();
  const [selectedDate, setSelectedDate] = useState('Today');
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  
  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const mapRef = useRef<MapView>(null);
  
  // Dynamic Data State
  const [trackData, setTrackData] = useState<any>({
    route: [],
    time: '00:00',
    distance: '0 km',
    speed: '0 km/h',
    location: { latitude: 30.7333, longitude: 76.7794 }
  });

  // Playback Logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isPlaying && trackData.route.length > 0) {
      interval = setInterval(() => {
        setPlaybackIndex((prev) => {
          if (prev >= trackData.route.length - 1) {
            setIsPlaying(false); // Stop at end
            return prev;
          }
          return prev + 1;
        });
      }, 200); // Fast playback (200ms per point)
    }

    return () => clearInterval(interval);
  }, [isPlaying, trackData.route]);

  // Auto-center map during playback
  useEffect(() => {
    if (isPlaying && trackData.route[playbackIndex]) {
       const point = trackData.route[playbackIndex];
       mapRef.current?.animateToRegion({
         latitude: point.latitude,
         longitude: point.longitude,
         latitudeDelta: 0.002,
         longitudeDelta: 0.002
       }, 200);
    }
  }, [playbackIndex, isPlaying]);

  useEffect(() => {
    loadTrackData();

    let interval: NodeJS.Timeout;
    if (selectedDate === 'Today' && !isPlaying) {
      interval = setInterval(loadTrackData, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedDate, isPlaying]);

  const loadTrackData = async () => {
    try {
      // 1. Get Stats for Distance/Speed
      const stats = await api.getStats('papaji_tractor_01');
      
      // 2. Get History for Route (Points)
      // Note: In a real app, you'd pass the selectedDate to the API
      const history = await api.getHistory('papaji_tractor_01');
      
      if (history && history.length > 0) {
        const route = history.map((p: any) => ({
          latitude: p.latitude,
          longitude: p.longitude
        }));
        
        const lastPoint = route[route.length - 1];

        setTrackData({
          route: route,
          time: 'Active', 
          distance: `${stats.total_distance_km} km`,
          speed: `${stats.max_speed} km/h (Max)`,
          location: lastPoint
        });
        
        // If not playing, update the playback index to the end so the marker is at the latest position
        if (!isPlaying) {
            setPlaybackIndex(route.length - 1);
        }
        
        // Update map region to center on tractor (only on first load or if following live)
        if (!isPlaying && playbackIndex === 0) {
            mapRef.current?.animateToRegion({
              latitude: lastPoint.latitude,
              longitude: lastPoint.longitude,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005
            }, 1000);
        }
      }
    } catch (e) {
      console.log('Error loading track data');
    }
  };

  const togglePlayback = () => {
    if (trackData.route.length === 0) {
      Alert.alert("No Data", "No route data available to play.");
      return;
    }

    if (isPlaying) {
      setIsPlaying(false);
    } else {
      // If at end, restart
      if (playbackIndex >= trackData.route.length - 1) {
        setPlaybackIndex(0);
      }
      setIsPlaying(true);
    }
  };

  const handleDiagnose = async () => {
    setIsDiagnosing(true);
    try {
      const result = await api.diagnoseSystem('papaji_tractor_01');
      
      Alert.alert(
        `System Status: ${result.status}`,
        result.message,
        [{ text: 'OK' }]
      );
    } catch (e) {
      Alert.alert('Error', 'Could not connect to server');
    } finally {
      setIsDiagnosing(false);
    }
  };

  const handleLearningOptions = async () => {
    Alert.alert(
      "Route Learning Options",
      "Manage the 'Safe Route' learning system.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Start New Learning", 
          onPress: async () => {
            Alert.alert(
              "Confirm Start",
              "This will overwrite any existing route data. The system will learn for 48 hours.",
              [
                { text: "Cancel", style: "cancel" },
                { 
                  text: "Start", 
                  onPress: async () => {
                    try {
                      await api.startLearning('papaji_tractor_01');
                      Alert.alert("Success", "Learning Mode Started.");
                    } catch (e) {
                      Alert.alert("Error", "Failed to start.");
                    }
                  }
                }
              ]
            );
          }
        },
        {
          text: "Delete Learned Data",
          style: "destructive",
          onPress: async () => {
             try {
               await api.deleteLearning('papaji_tractor_01');
               Alert.alert("Deleted", "Route and Speed data cleared.");
             } catch (e) {
               Alert.alert("Error", "Failed to delete.");
             }
          }
        }
      ]
    );
  };

  const [region, setRegion] = useState({
    latitude: 30.7333,
    longitude: 76.7794,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });

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
      {/* Map Header */}
      <SafeAreaView className="absolute top-0 left-0 right-0 z-10 px-4">
        <Animated.View entering={FadeInUp.delay(200).springify()} className="flex-row justify-center items-center">
          <View className="bg-white/80 dark:bg-dark-card/80 px-4 py-2 rounded-full backdrop-blur-md shadow-sm dark:shadow-none">
            <Text className="font-bold text-black dark:text-white">{selectedDate}</Text>
          </View>
        </Animated.View>
      </SafeAreaView>

      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        region={region}
        mapType={mapType}
        customMapStyle={isDark ? darkMapStyle : []}
      >
        <Polyline
          coordinates={trackData.route}
          strokeColor="#FF5500"
          strokeWidth={4}
        />
        
        {/* Dynamic Marker based on Playback Index */}
        <Marker coordinate={trackData.route[playbackIndex] || trackData.location}>
          <View className="bg-primary p-2 rounded-full border-4 border-white/20 shadow-lg">
            <MaterialCommunityIcons name="navigation" size={20} color="white" style={{ transform: [{ rotate: '45deg' }] }} />
          </View>
        </Marker>
      </MapView>

      {/* Bottom Stats Card */}
      <Animated.View entering={FadeInDown.delay(400).springify()} className="absolute bottom-0 left-0 right-0 bg-white dark:bg-dark-card rounded-t-3xl p-6 pb-40 shadow-lg dark:shadow-none">
        
        {/* Date Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
          {['Today'].map((date) => (
            <TouchableOpacity
              key={date}
              onPress={() => setSelectedDate(date)}
              className={`mr-3 px-4 py-2 rounded-full border ${
                selectedDate === date 
                  ? 'bg-primary border-primary' 
                  : 'bg-transparent border-gray-200 dark:border-gray-700'
              }`}
            >
              <Text className={`${
                selectedDate === date ? 'text-white font-bold' : 'text-gray-500 dark:text-gray-400'
              }`}>
                {date}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View className="flex-row justify-between items-center mb-6">
          <View>
            <Text className="text-gray-500 dark:text-dark-subtext text-sm mb-1">Time</Text>
            <Text className="text-black dark:text-white text-2xl font-bold">{trackData.time}</Text>
          </View>
          <View className="items-center">
            <Text className="text-gray-500 dark:text-dark-subtext text-sm mb-1">Speed</Text>
            <Text className="text-black dark:text-white text-2xl font-bold">{trackData.speed}</Text>
          </View>
          <View className="items-end">
            <Text className="text-gray-500 dark:text-dark-subtext text-sm mb-1">Distance</Text>
            <Text className="text-black dark:text-white text-2xl font-bold">{trackData.distance}</Text>
          </View>
        </View>

        {/* Audio Visualization (Fake) */}
        <View className="flex-row items-end justify-between h-8 gap-1 mb-8 opacity-50">
          {[...Array(30)].map((_, i) => (
            <View 
              key={i} 
              className={`flex-1 bg-primary rounded-full`}
              style={{ height: Math.random() * 100 + '%' }}
            />
          ))}
        </View>

        {/* Controls */}
        <View className="flex-row justify-between items-center">
          <TouchableOpacity 
            onPress={handleLearningOptions}
            className="w-12 h-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900"
          >
            <MaterialCommunityIcons name="brain" size={24} color={isDark ? '#60A5FA' : '#2563EB'} />
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={handleDiagnose}
            className="w-12 h-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800"
          >
            {isDiagnosing ? (
              <ActivityIndicator color="#FF5500" />
            ) : (
              <MaterialCommunityIcons name="wrench" size={24} color="#666" />
            )}
          </TouchableOpacity>
          
          <TouchableOpacity 
            onPress={togglePlayback}
            className="bg-gray-100 dark:bg-white w-16 h-16 rounded-2xl items-center justify-center shadow-sm"
          >
            <MaterialCommunityIcons 
              name={isPlaying ? "pause" : "play"} 
              size={32} 
              color="#FF5500" 
            />
          </TouchableOpacity>

          <TouchableOpacity className="w-12 h-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <MaterialCommunityIcons name="crosshairs-gps" size={24} color="#666" />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}
