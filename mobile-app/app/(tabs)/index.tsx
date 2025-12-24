/**
 * ============================================
 * PAPAJI GPS TRACKER - DASHBOARD v2.0 (CLEAN)
 * ============================================
 * 
 * Main Map Screen with Live Tracking
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, ActivityIndicator, Alert, Platform } from 'react-native';
import MapView, { Polyline, Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { TractorStatusCard } from '@/components/TractorStatusCard';
import { useMapContext } from '@/context/MapContext';
import { useThemeContext } from '@/context/ThemeContext';
import { api } from '@/services/api';

// ============================================
// TYPES
// ============================================
interface LocationPoint {
  latitude: number;
  longitude: number;
  source: 'gps' | 'gsm';
  speed_kmh?: number;
  created_at?: string;
}

interface StopPoint {
  latitude: number;
  longitude: number;
  duration_minutes: number;
  start_time: string;
  end_time?: string;
  ongoing?: boolean;
}

interface Stats {
  distance_km: string;
  max_speed_kmh: string;
  avg_speed_kmh: string;
  active_time_hours: string;
  data_points: number;
  stops: StopPoint[];
  last_update: string;
}

type ViewMode = 'gps' | 'gsm' | 'both';

// ============================================
// CONSTANTS
// ============================================
const REFRESH_INTERVAL = 5000; // 5 seconds
const AUTO_CENTER_ZOOM = 0.01;

// Default location (India)
const DEFAULT_REGION = {
  latitude: 26.4499,
  longitude: 80.3319,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

// ============================================
// COMPONENT
// ============================================
export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const { mapTheme } = useMapContext();
  const { isDarkMode } = useThemeContext();

  // State
  const [stats, setStats] = useState<Stats | null>(null);
  const [location, setLocation] = useState<LocationPoint | null>(null);
  const [gpsRoute, setGpsRoute] = useState<LocationPoint[]>([]);
  const [gsmPoints, setGsmPoints] = useState<LocationPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(false);

  // Settings
  const [viewMode, setViewMode] = useState<ViewMode>('gps');
  const [autoCenter, setAutoCenter] = useState(true);
  const [showVoice, setShowVoice] = useState(false);

  // ============================================
  // DATA FETCHING
  // ============================================
  const fetchData = useCallback(async () => {
    try {
      // Fetch all data in parallel
      const [statsData, latestData, historyData] = await Promise.all([
        api.getStats(),
        api.getLatest(),
        api.getHistory(24)
      ]);

      // Update stats
      if (statsData) {
        setStats(statsData);
      }

      // Update current location
      if (latestData) {
        setLocation({
          latitude: latestData.latitude,
          longitude: latestData.longitude,
          source: latestData.source || 'gps',
          speed_kmh: latestData.speed_kmh,
          created_at: latestData.created_at
        });

        // Check if online (updated in last 5 minutes)
        const lastTime = new Date(latestData.created_at).getTime();
        setIsOnline(Date.now() - lastTime < 5 * 60 * 1000);
      }

      // Update route history
      if (historyData) {
        const gps = historyData
          .filter((p: LocationPoint) => p.source === 'gps')
          .map((p: any) => ({
            latitude: parseFloat(p.latitude),
            longitude: parseFloat(p.longitude),
            source: 'gps' as const,
            speed_kmh: p.speed_kmh,
            created_at: p.created_at
          }));
        
        const gsm = historyData
          .filter((p: LocationPoint) => p.source === 'gsm')
          .map((p: any) => ({
            latitude: parseFloat(p.latitude),
            longitude: parseFloat(p.longitude),
            source: 'gsm' as const,
            created_at: p.created_at
          }));

        setGpsRoute(gps);
        setGsmPoints(gsm);
      }

      setLastUpdate(new Date());
      setIsLoading(false);

    } catch (error) {
      console.error('Fetch error:', error);
      setIsLoading(false);
    }
  }, []);

  // ============================================
  // EFFECTS
  // ============================================
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Auto-center map on new location
  useEffect(() => {
    if (autoCenter && location && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: AUTO_CENTER_ZOOM,
        longitudeDelta: AUTO_CENTER_ZOOM,
      }, 500);
    }
  }, [location, autoCenter]);

  // ============================================
  // HANDLERS
  // ============================================
  const speakLocation = () => {
    if (!location || !stats) return;

    const message = `
      ट्रैक्टर ${isOnline ? 'चालू है' : 'बंद है'}।
      रफ़्तार ${Math.round(location.speed_kmh || 0)} किलोमीटर प्रति घंटा।
      आज ${stats.distance_km} किलोमीटर चला।
      ${stats.stops?.length || 0} बार रुका।
    `.trim();

    Speech.speak(message, {
      language: 'hi-IN',
      pitch: 1.0,
      rate: 0.9,
    });
  };

  const centerOnTractor = () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: AUTO_CENTER_ZOOM,
        longitudeDelta: AUTO_CENTER_ZOOM,
      }, 500);
    }
  };

  const cycleViewMode = () => {
    const modes: ViewMode[] = ['gps', 'gsm', 'both'];
    const currentIndex = modes.indexOf(viewMode);
    setViewMode(modes[(currentIndex + 1) % modes.length]);
  };

  // ============================================
  // RENDER HELPERS
  // ============================================
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-IN', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const getStatusColor = () => isOnline ? '#22c55e' : '#ef4444';

  // ============================================
  // RENDER
  // ============================================
  if (isLoading) {
    return (
      <ThemedView className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#f59e0b" />
        <ThemedText className="mt-4">Loading tracker...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView className="flex-1">
      {/* Map */}
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={PROVIDER_GOOGLE}
        initialRegion={location ? {
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        } : DEFAULT_REGION}
        customMapStyle={mapTheme}
        showsUserLocation={false}
        showsCompass={false}
      >
        {/* GPS Route */}
        {(viewMode === 'gps' || viewMode === 'both') && gpsRoute.length > 1 && (
          <Polyline
            coordinates={gpsRoute}
            strokeColor="#22c55e"
            strokeWidth={4}
          />
        )}

        {/* GSM Points */}
        {(viewMode === 'gsm' || viewMode === 'both') && gsmPoints.map((point, index) => (
          <Circle
            key={`gsm-${index}`}
            center={point}
            radius={200}
            fillColor="rgba(239, 68, 68, 0.2)"
            strokeColor="rgba(239, 68, 68, 0.6)"
            strokeWidth={1}
          />
        ))}

        {/* Stop Markers */}
        {stats?.stops?.map((stop, index) => (
          <Marker
            key={`stop-${index}`}
            coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View className="items-center">
              <View 
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: stop.ongoing ? '#f59e0b' : '#6b7280' }}
              >
                <Text className="text-white text-xs font-bold">
                  {stop.duration_minutes}m
                </Text>
              </View>
            </View>
          </Marker>
        ))}

        {/* Current Location Marker */}
        {location && (
          <Marker
            coordinate={location}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View className="items-center">
              {/* Pulse animation */}
              {isOnline && (
                <View 
                  className="absolute w-16 h-16 rounded-full opacity-30"
                  style={{ backgroundColor: getStatusColor() }}
                />
              )}
              {/* Tractor icon */}
              <View 
                className="w-10 h-10 rounded-full items-center justify-center border-2 border-white"
                style={{ backgroundColor: getStatusColor() }}
              >
                <Text className="text-xl">🚜</Text>
              </View>
            </View>
          </Marker>
        )}
      </MapView>

      {/* Top Status Bar */}
      <View 
        className="absolute left-4 right-4 flex-row items-center justify-between"
        style={{ top: insets.top + 8 }}
      >
        {/* Status Chip */}
        <View 
          className="px-3 py-2 rounded-full flex-row items-center"
          style={{ 
            backgroundColor: isDarkMode ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
          }}
        >
          <View 
            className="w-3 h-3 rounded-full mr-2"
            style={{ backgroundColor: getStatusColor() }}
          />
          <ThemedText className="font-medium">
            {isOnline ? 'Online' : 'Offline'}
          </ThemedText>
          {location?.speed_kmh !== undefined && location.speed_kmh > 0 && (
            <ThemedText className="ml-2 text-gray-500">
              {Math.round(location.speed_kmh)} km/h
            </ThemedText>
          )}
        </View>

        {/* View Mode Toggle */}
        <TouchableOpacity
          onPress={cycleViewMode}
          className="px-3 py-2 rounded-full"
          style={{ 
            backgroundColor: isDarkMode ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
          }}
        >
          <ThemedText className="font-medium uppercase">
            {viewMode}
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* Map Controls */}
      <View 
        className="absolute right-4 gap-2"
        style={{ top: insets.top + 60 }}
      >
        {/* Center Button */}
        <TouchableOpacity
          onPress={centerOnTractor}
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ 
            backgroundColor: isDarkMode ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
          }}
        >
          <Ionicons name="locate" size={20} color={isDarkMode ? '#fff' : '#000'} />
        </TouchableOpacity>

        {/* Voice Button */}
        <TouchableOpacity
          onPress={speakLocation}
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ 
            backgroundColor: isDarkMode ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
          }}
        >
          <Ionicons name="volume-high" size={20} color={isDarkMode ? '#fff' : '#000'} />
        </TouchableOpacity>

        {/* Auto-center Toggle */}
        <TouchableOpacity
          onPress={() => setAutoCenter(!autoCenter)}
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ 
            backgroundColor: autoCenter 
              ? '#f59e0b' 
              : isDarkMode ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
          }}
        >
          <Ionicons 
            name={autoCenter ? 'navigate' : 'navigate-outline'} 
            size={20} 
            color={autoCenter ? '#fff' : isDarkMode ? '#fff' : '#000'} 
          />
        </TouchableOpacity>
      </View>

      {/* Bottom Stats Card */}
      <View 
        className="absolute left-4 right-4"
        style={{ bottom: insets.bottom + 20 }}
      >
        <View 
          className="rounded-2xl p-4"
          style={{ 
            backgroundColor: isDarkMode ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)',
          }}
        >
          {/* Stats Grid */}
          <View className="flex-row justify-between mb-3">
            <StatItem 
              icon="speedometer" 
              value={`${stats?.max_speed_kmh || '0'}`} 
              label="Max Speed"
              unit="km/h"
            />
            <StatItem 
              icon="car" 
              value={`${stats?.distance_km || '0'}`} 
              label="Distance"
              unit="km"
            />
            <StatItem 
              icon="time" 
              value={`${stats?.active_time_hours || '0'}`} 
              label="Active"
              unit="hrs"
            />
            <StatItem 
              icon="pause" 
              value={`${stats?.stops?.length || 0}`} 
              label="Stops"
              unit=""
            />
          </View>

          {/* Last Update */}
          <View className="flex-row items-center justify-center pt-2 border-t border-gray-200 dark:border-gray-700">
            <Ionicons 
              name="sync" 
              size={14} 
              color={isDarkMode ? '#9ca3af' : '#6b7280'} 
            />
            <ThemedText className="ml-2 text-sm text-gray-500">
              Last update: {lastUpdate ? formatTime(lastUpdate.toISOString()) : '--:--'}
            </ThemedText>
          </View>
        </View>
      </View>
    </ThemedView>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================
interface StatItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  unit: string;
}

function StatItem({ icon, value, label, unit }: StatItemProps) {
  const { isDarkMode } = useThemeContext();
  
  return (
    <View className="items-center">
      <View className="flex-row items-baseline">
        <ThemedText className="text-xl font-bold">{value}</ThemedText>
        {unit && (
          <ThemedText className="text-xs text-gray-500 ml-1">{unit}</ThemedText>
        )}
      </View>
      <View className="flex-row items-center mt-1">
        <Ionicons 
          name={icon} 
          size={12} 
          color={isDarkMode ? '#9ca3af' : '#6b7280'} 
        />
        <ThemedText className="text-xs text-gray-500 ml-1">{label}</ThemedText>
      </View>
    </View>
  );
}
