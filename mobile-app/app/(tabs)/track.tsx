import MapView, { Marker, Polyline } from '@/components/MapLib';
import { useMapType } from '@/context/MapContext';
import { useTheme } from '@/context/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState, useRef, useEffect } from 'react';
import { Text, TouchableOpacity, View, Alert, ActivityIndicator, ScrollView } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/services/api';

// Catmull-Rom spline interpolation for smooth curves
function catmullRomSpline(points: any[], segments: number = 3): any[] {
  if (points.length < 4) return points;
  
  const result: any[] = [];
  
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[Math.min(points.length - 1, i + 1)];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    
    result.push(p1);
    
    // Only interpolate if we have enough points and distance warrants it
    const dist = Math.sqrt(
      Math.pow(p2.latitude - p1.latitude, 2) + 
      Math.pow(p2.longitude - p1.longitude, 2)
    );
    
    if (dist > 0.0001) { // Only smooth if points are far enough apart
      for (let t = 1; t < segments; t++) {
        const s = t / segments;
        const s2 = s * s;
        const s3 = s2 * s;
        
        const lat = 0.5 * (
          (2 * p1.latitude) +
          (-p0.latitude + p2.latitude) * s +
          (2 * p0.latitude - 5 * p1.latitude + 4 * p2.latitude - p3.latitude) * s2 +
          (-p0.latitude + 3 * p1.latitude - 3 * p2.latitude + p3.latitude) * s3
        );
        
        const lon = 0.5 * (
          (2 * p1.longitude) +
          (-p0.longitude + p2.longitude) * s +
          (2 * p0.longitude - 5 * p1.longitude + 4 * p2.longitude - p3.longitude) * s2 +
          (-p0.longitude + 3 * p1.longitude - 3 * p2.longitude + p3.longitude) * s3
        );
        
        result.push({ latitude: lat, longitude: lon });
      }
    }
  }
  
  result.push(points[points.length - 1]);
  return result;
}

// Smooth route with bezier-like interpolation for corners
function smoothRoute(points: any[]): any[] {
  if (points.length < 4) return points;
  return catmullRomSpline(points, 4); // 4 segments between each point
}

export default function TrackScreen() {
  const { activeTheme } = useTheme();
  const isDark = activeTheme === 'dark';
  const { mapType } = useMapType();
  const mapRef = useRef<MapView>(null);
  
  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 1x, 2x, 4x
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Helper to get local YYYY-MM-DD
  const getLocalDateString = (date: Date) => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };

  // Date Selection State
  const [selectedDate, setSelectedDate] = useState(getLocalDateString(new Date()));
  
  // Generate last 7 days
  const getLast7Days = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      days.push({
        date: getLocalDateString(date), // YYYY-MM-DD (Local)
        displayDate: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        dayName: date.toLocaleDateString('en-IN', { weekday: 'short' })
      });
    }
    return days;
  };

  // Track Data State
  const [trackData, setTrackData] = useState<any>({
    route: [],
    gsmMarkers: [], // GSM points as separate markers
    totalDistance: 0,
    maxSpeed: 0,
    avgSpeed: 0,
    duration: 0,
    dataPoints: 0,
    gpsPoints: 0,
    gsmPoints: 0,
    location: { latitude: 30.7333, longitude: 76.7794 }
  });

  const [region, setRegion] = useState({
    latitude: 30.7333,
    longitude: 76.7794,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });

  // Playback Logic
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    
    if (isPlaying && trackData.route.length > 0) {
      const speed = 200 / playbackSpeed; // Faster with higher multiplier
      interval = setInterval(() => {
        setPlaybackIndex((prev) => {
          if (prev >= trackData.route.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, speed);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, trackData.route, playbackSpeed]);

  // Auto-center map during playback
  useEffect(() => {
    if (isPlaying && trackData.route[playbackIndex]) {
      const point = trackData.route[playbackIndex];
      mapRef.current?.animateToRegion({
        latitude: point.latitude,
        longitude: point.longitude,
        latitudeDelta: 0.002,
        longitudeDelta: 0.002
      }, 150);
    }
  }, [playbackIndex, isPlaying]);

  // Load data on mount and when date changes
  useEffect(() => {
    loadTrackData();
    const interval = setInterval(() => {
      if (!isPlaying && selectedDate === getLocalDateString(new Date())) {
         loadTrackData(); // Only auto-refresh if viewing "Today"
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isPlaying, selectedDate]);

  const loadTrackData = async () => {
    try {
      const [stats, history, latest] = await Promise.all([
        api.getStats('papaji_tractor_01'),
        api.getHistoryByDate('papaji_tractor_01', selectedDate),
        api.getLatest('papaji_tractor_01')
      ]);

      // History now returns { gps: [], gsm: [] } - separate arrays
      const gpsPoints = history?.gps || [];
      const gsmPoints = history?.gsm || [];
      const totalPoints = gpsPoints.length + gsmPoints.length;

      if (totalPoints > 0) {
        // GPS points for route line only (no GSM in route)
        let route = gpsPoints.map((p: any) => ({
          latitude: p.latitude,
          longitude: p.longitude,
          speed: p.speed_kmh || p.speed || 0,
          source: p.source
        }));

        // GSM points as separate markers (circles, not connected)
        const gsmMarkers = gsmPoints.map((p: any) => ({
          latitude: p.latitude,
          longitude: p.longitude
        }));

        // Backend already filters duplicates, just smooth for better visual
        if (route.length > 5) {
          route = smoothRoute(route);
        }

        const lastPoint = route.length > 0 ? route[route.length - 1] : null;
        const displayPoint = latest?.latitude 
          ? { latitude: latest.latitude, longitude: latest.longitude }
          : lastPoint || { latitude: 30.7333, longitude: 76.7794 };

        setTrackData({
          route,
          gsmMarkers,
          totalDistance: parseFloat(stats?.total_distance_km || '0'),
          maxSpeed: parseFloat(stats?.max_speed || '0'),
          avgSpeed: parseFloat(stats?.avg_speed || '0'),
          duration: parseFloat(stats?.active_time_hours || '0') * 60,
          dataPoints: totalPoints,
          gpsPoints: gpsPoints.length,
          gsmPoints: gsmPoints.length,
          location: displayPoint
        });

        if (!isPlaying) {
          setPlaybackIndex(route.length - 1);
          if (isLoading) {
            mapRef.current?.animateToRegion({
              latitude: displayPoint.latitude,
              longitude: displayPoint.longitude,
              latitudeDelta: 0.008,
              longitudeDelta: 0.008
            }, 1000);
          }
        }
      } else {
        // No data for this date - Clear the map
        setTrackData({
          route: [],
          gsmMarkers: [],
          totalDistance: 0,
          maxSpeed: 0,
          avgSpeed: 0,
          duration: 0,
          dataPoints: 0,
          gpsPoints: 0,
          gsmPoints: 0,
          location: { latitude: 30.7333, longitude: 76.7794 }
        });
        setPlaybackIndex(0);
      }
    } catch (e) {
      console.log('Error loading track data:', e);
    } finally {
      setIsLoading(false);
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
      if (playbackIndex >= trackData.route.length - 1) {
        setPlaybackIndex(0);
      }
      setIsPlaying(true);
    }
  };

  const cycleSpeed = () => {
    setPlaybackSpeed(prev => prev >= 4 ? 1 : prev * 2);
  };

  const handleDiagnose = async () => {
    setIsDiagnosing(true);
    try {
      const result = await api.getDiagnosis('papaji_tractor_01');
      if (result) {
        const statusIcon = result.status === 'ONLINE' ? '🟢' : result.status === 'STALE' ? '🟡' : '🔴';
        Alert.alert(
          `${statusIcon} System Status: ${result.status}`,
          result.message,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'No response from server');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not connect to server');
    } finally {
      setIsDiagnosing(false);
    }
  };

  const centerOnTractor = () => {
    const point = trackData.route[playbackIndex] || trackData.location;
    mapRef.current?.animateToRegion({
      latitude: point.latitude,
      longitude: point.longitude,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005
    }, 500);
  };

  const formatDuration = (mins: number) => {
    if (mins < 60) return `${Math.round(mins)}m`;
    const hours = Math.floor(mins / 60);
    const minutes = Math.round(mins % 60);
    return `${hours}h ${minutes}m`;
  };

  const darkMapStyle = [
    { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
    { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a1a" }] },
    { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a0a0a" }] }
  ];

  const progress = trackData.route.length > 0 
    ? ((playbackIndex + 1) / trackData.route.length) * 100 
    : 0;

  return (
    <View className={`flex-1 ${isDark ? 'bg-[#0a0a0a]' : 'bg-gray-100'}`}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        region={region}
        mapType={mapType}
        customMapStyle={isDark ? darkMapStyle : []}
      >
        {/* Route Polyline */}
        {trackData.route.length > 1 && (
          <Polyline
            coordinates={trackData.route.slice(0, playbackIndex + 1)}
            strokeColor="#FF5500"
            strokeWidth={4}
          />
        )}
        
        {/* Remaining route (faded) */}
        {isPlaying && playbackIndex < trackData.route.length - 1 && (
          <Polyline
            coordinates={trackData.route.slice(playbackIndex)}
            strokeColor="rgba(255,85,0,0.3)"
            strokeWidth={3}
          />
        )}
        
        {/* Tractor Marker */}
        {trackData.route.length > 0 && (
          <Marker 
            coordinate={trackData.route[playbackIndex] || trackData.location}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View 
              className="bg-[#FF5500] items-center justify-center rounded-full border-4 border-white"
              style={{ 
                width: 50, 
                height: 50,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.27,
                shadowRadius: 4.65,
                elevation: 6
              }}
            >
              <MaterialCommunityIcons 
                name="tractor-variant" 
                size={26} 
                color="white" 
              />
            </View>
          </Marker>
        )}

        {/* Start Point Marker */}
        {trackData.route.length > 1 && (
          <Marker coordinate={trackData.route[0]}>
            <View className="bg-green-500 w-4 h-4 rounded-full border-2 border-white" />
          </Marker>
        )}

        {/* GSM Location Circles (not connected with lines) */}
        {trackData.gsmMarkers && trackData.gsmMarkers.map((marker: any, index: number) => (
          <Marker
            key={`gsm-${index}`}
            coordinate={marker}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: '#f59e0b',
                borderWidth: 2,
                borderColor: 'white',
              }}
            />
          </Marker>
        ))}
      </MapView>

      {/* Top Status Bar */}
      <SafeAreaView className="absolute top-0 left-0 right-0 z-10 pointer-events-box-none">
        <View className="px-4">
          <Animated.View entering={FadeInUp.delay(200)} className="flex-row justify-between items-center mt-2">
            {/* Live Badge */}
            <View 
              className="flex-row items-center px-3 py-2 rounded-xl"
              style={{ backgroundColor: isDark ? 'rgba(26,26,26,0.95)' : 'rgba(255,255,255,0.95)' }}
            >
              <View className={`w-2 h-2 rounded-full mr-2 ${trackData.dataPoints > 0 ? 'bg-green-500' : 'bg-gray-400'}`} />
              <Text className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {isPlaying ? 'Playback' : 'Live'}
              </Text>
            </View>

            {/* Data Points */}
            <View 
              className="flex-row items-center px-3 py-2 rounded-xl"
              style={{ backgroundColor: isDark ? 'rgba(26,26,26,0.95)' : 'rgba(255,255,255,0.95)' }}
            >
              <MaterialCommunityIcons name="map-marker-path" size={16} color="#22c55e" />
              <Text className={`text-xs ml-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                {trackData.gpsPoints}
              </Text>
              <MaterialCommunityIcons name="antenna" size={16} color="#f59e0b" style={{ marginLeft: 8 }} />
              <Text className={`text-xs ml-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                {trackData.gsmPoints}
              </Text>
            </View>
          </Animated.View>

          {/* Date Selector */}
          <Animated.View entering={FadeInUp.delay(300)} className="mt-3">
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              className="flex-row"
            >
              {getLast7Days().map((day) => (
                <TouchableOpacity
                  key={day.date}
                  onPress={() => { setSelectedDate(day.date); setIsLoading(true); }}
                  className={`mr-2 px-4 py-2 rounded-full border ${
                    selectedDate === day.date 
                      ? 'bg-[#FF5500] border-[#FF5500]' 
                      : isDark ? 'bg-[#1a1a1a] border-[#333]' : 'bg-white border-gray-200'
                  }`}
                >
                  <Text className={`text-xs font-medium ${
                    selectedDate === day.date ? 'text-white' : isDark ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {day.displayDate}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>
        </View>
      </SafeAreaView>

      {/* Bottom Control Panel */}
      <Animated.View 
        entering={FadeInDown.delay(300).springify()} 
        className="absolute bottom-0 left-0 right-0 rounded-t-3xl"
        style={{ paddingBottom: 90, backgroundColor: isDark ? '#1a1a1a' : '#ffffff' }}
      >
        {/* Progress Bar */}
        <View className="px-5 pt-4">
          <View 
            className="h-1 rounded-full overflow-hidden"
            style={{ backgroundColor: isDark ? '#2a2a2a' : '#e5e7eb' }}
          >
            <View 
              className="h-full bg-[#FF5500] rounded-full" 
              style={{ width: `${progress}%` }} 
            />
          </View>
          <View className="flex-row justify-between mt-1">
            <Text className={`text-[10px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
              {isPlaying ? `Point ${playbackIndex + 1}` : 'Start'}
            </Text>
            <Text className={`text-[10px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
              {trackData.route.length} points
            </Text>
          </View>
        </View>

        {/* Stats Row */}
        <View className="flex-row justify-around py-4 px-5">
          <StatItem 
            icon="road-variant" 
            label="Distance" 
            value={`${trackData.totalDistance.toFixed(1)} km`} 
            isDark={isDark} 
          />
          <View style={{ width: 1, backgroundColor: isDark ? '#2a2a2a' : '#e5e7eb' }} />
          <StatItem 
            icon="speedometer" 
            label="Max Speed" 
            value={`${Math.round(trackData.maxSpeed)} km/h`} 
            isDark={isDark} 
          />
          <View style={{ width: 1, backgroundColor: isDark ? '#2a2a2a' : '#e5e7eb' }} />
          <StatItem 
            icon="clock-outline" 
            label="Duration" 
            value={formatDuration(trackData.duration)} 
            isDark={isDark} 
          />
        </View>

        {/* Playback Controls */}
        <View className="flex-row justify-between items-center px-5 pb-4">
          {/* Diagnose Button */}
          <TouchableOpacity 
            onPress={handleDiagnose}
            disabled={isDiagnosing}
            className="w-12 h-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: isDark ? '#2a2a2a' : '#f3f4f6' }}
          >
            {isDiagnosing ? (
              <ActivityIndicator color="#FF5500" size="small" />
            ) : (
              <MaterialCommunityIcons name="stethoscope" size={22} color={isDark ? '#999' : '#666'} />
            )}
          </TouchableOpacity>

          {/* Speed Toggle */}
          <TouchableOpacity 
            onPress={cycleSpeed}
            className="w-12 h-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: isDark ? '#2a2a2a' : '#f3f4f6' }}
          >
            <Text className={`font-bold text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              {playbackSpeed}x
            </Text>
          </TouchableOpacity>

          {/* Play/Pause Button */}
          <TouchableOpacity 
            onPress={togglePlayback}
            className="bg-[#FF5500] w-16 h-16 rounded-2xl items-center justify-center shadow-lg"
          >
            <MaterialCommunityIcons 
              name={isPlaying ? "pause" : "play"} 
              size={32} 
              color="white" 
            />
          </TouchableOpacity>

          {/* Restart Button */}
          <TouchableOpacity 
            onPress={() => { setPlaybackIndex(0); setIsPlaying(false); }}
            className="w-12 h-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: isDark ? '#2a2a2a' : '#f3f4f6' }}
          >
            <MaterialCommunityIcons name="restart" size={22} color={isDark ? '#999' : '#666'} />
          </TouchableOpacity>

          {/* Center Button */}
          <TouchableOpacity 
            onPress={centerOnTractor}
            className="w-12 h-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: isDark ? '#2a2a2a' : '#f3f4f6' }}
          >
            <MaterialCommunityIcons name="crosshairs-gps" size={22} color={isDark ? '#999' : '#666'} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Loading Overlay */}
      {isLoading && (
        <View className="absolute inset-0 items-center justify-center bg-black/50">
          <ActivityIndicator size="large" color="#FF5500" />
          <Text className="text-white mt-3">Loading route...</Text>
        </View>
      )}

      {/* No Data Overlay */}
      {!isLoading && trackData.route.length === 0 && (
        <View className="absolute inset-0 items-center justify-center pointer-events-none">
          <View 
            className="items-center px-6 py-4 rounded-2xl shadow-lg"
            style={{ backgroundColor: isDark ? 'rgba(26,26,26,0.9)' : 'rgba(255,255,255,0.9)' }}
          >
            <MaterialCommunityIcons name="map-marker-off" size={48} color={isDark ? '#666' : '#999'} />
            <Text className={`text-lg font-bold mt-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              No Data Found
            </Text>
            <Text className={`text-sm text-center mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              No tracking history available for {selectedDate === getLocalDateString(new Date()) ? 'today' : 'this date'}.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// Stat Item Component
function StatItem({ icon, label, value, isDark }: { icon: string; label: string; value: string; isDark: boolean }) {
  return (
    <View className="items-center flex-1">
      <MaterialCommunityIcons name={icon as any} size={20} color="#FF5500" />
      <Text className={`text-lg font-bold mt-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{value}</Text>
      <Text className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{label}</Text>
    </View>
  );
}
