import { useTheme } from '@/context/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View, RefreshControl, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/services/api';

interface DaySummary {
  date: string;
  displayDate: string;
  dayName: string;
  totalPoints: number;
  totalDistance: number;
  maxSpeed: number;
  duration: number;
  firstTime: string;
  lastTime: string;
}

export default function HistoryScreen() {
  const { activeTheme } = useTheme();
  const isDark = activeTheme === 'dark';
  
  const [historyData, setHistoryData] = useState<DaySummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Generate last 7 days
  const getLast7Days = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      days.push({
        date: date.toISOString().split('T')[0], // YYYY-MM-DD
        displayDate: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        dayName: date.toLocaleDateString('en-IN', { weekday: 'short' })
      });
    }
    return days;
  };

  const loadHistory = async () => {
    setLoading(true);
    const days = getLast7Days();
    const summaries: DaySummary[] = [];

    for (const day of days) {
      try {
        const historyResponse = await api.getHistoryByDate('papaji_tractor_01', day.date);
        
        // GPS ONLY MODE - Filter out GSM points for stats
        const allPoints = historyResponse?.gps || [];
        const gpsPoints = allPoints.filter((p: any) => p.source !== 'gsm');
        
        if (allPoints.length > 0) {
          // Calculate stats from GPS points only
          let totalDistance = 0;
          let maxSpeed = 0;

          if (gpsPoints.length > 0) {
            for (let i = 0; i < gpsPoints.length; i++) {
              const point = gpsPoints[i];
              
              // Track max speed
              const speed = (point as any).speed_kmh || (point as any).speed || 0;
              if (speed > maxSpeed) maxSpeed = speed;
              
              // Calculate distance between consecutive GPS points
              if (i > 0) {
                const prevPoint = gpsPoints[i - 1];
                const dist = getDistanceFromLatLon(
                  prevPoint.latitude, prevPoint.longitude,
                  point.latitude, point.longitude
                );
                if (dist < 1) totalDistance += dist; // Ignore jumps > 1km
              }
            }
          }

          // Calculate duration using ALL points (including GSM)
          const firstTime = new Date(allPoints[0].created_at);
          const lastTime = new Date(allPoints[allPoints.length - 1].created_at);
          const durationMins = Math.round((lastTime.getTime() - firstTime.getTime()) / 1000 / 60);

          summaries.push({
            date: day.date,
            displayDate: day.displayDate,
            dayName: day.dayName,
            totalPoints: allPoints.length,
            totalDistance: Math.round(totalDistance * 100) / 100,
            maxSpeed: Math.round(maxSpeed),
            duration: durationMins,
            firstTime: firstTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            lastTime: lastTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          });
        } else {
          // No data for this day
          summaries.push({
            date: day.date,
            displayDate: day.displayDate,
            dayName: day.dayName,
            totalPoints: 0,
            totalDistance: 0,
            maxSpeed: 0,
            duration: 0,
            firstTime: '-',
            lastTime: '-'
          });
        }
      } catch (e) {
        console.log(`Error loading ${day.date}:`, e);
        summaries.push({
          date: day.date,
          displayDate: day.displayDate,
          dayName: day.dayName,
          totalPoints: 0,
          totalDistance: 0,
          maxSpeed: 0,
          duration: 0,
          firstTime: '-',
          lastTime: '-'
        });
      }
    }

    setHistoryData(summaries);
    setLoading(false);
  };

  // Haversine formula for distance
  function getDistanceFromLatLon(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function deg2rad(deg: number) {
    return deg * (Math.PI / 180);
  }

  useEffect(() => {
    loadHistory();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  const formatDuration = (mins: number) => {
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return `${hours}h ${minutes}m`;
  };

  // Total stats
  const totalStats = historyData.reduce((acc, day) => ({
    distance: acc.distance + day.totalDistance,
    points: acc.points + day.totalPoints,
    duration: acc.duration + day.duration
  }), { distance: 0, points: 0, duration: 0 });

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-[#0a0a0a]' : 'bg-gray-50'}`}>
      {/* Header */}
      <Animated.View entering={FadeInUp.delay(100)} className="px-5 pt-4 pb-2">
        <Text className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Trip History</Text>
        <Text className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Last 7 days activity</Text>
      </Animated.View>

      {/* Weekly Summary Card */}
      <Animated.View entering={FadeInDown.delay(200)} className="px-5 mb-4">
        <View 
          className="rounded-2xl p-4"
          style={{ backgroundColor: isDark ? '#1a1a1a' : '#ffffff' }}
        >
          <Text className={`text-xs font-medium mb-3 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
            WEEKLY SUMMARY
          </Text>
          <View className="flex-row justify-between">
            <View className="items-center flex-1">
              <Text className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {totalStats.distance.toFixed(1)}
              </Text>
              <Text className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>km total</Text>
            </View>
            <View style={{ width: 1, backgroundColor: isDark ? '#2a2a2a' : '#e5e7eb' }} />
            <View className="items-center flex-1">
              <Text className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {formatDuration(totalStats.duration)}
              </Text>
              <Text className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>active</Text>
            </View>
            <View style={{ width: 1, backgroundColor: isDark ? '#2a2a2a' : '#e5e7eb' }} />
            <View className="items-center flex-1">
              <Text className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {totalStats.points}
              </Text>
              <Text className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>points</Text>
            </View>
          </View>
        </View>
      </Animated.View>
      
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FF5500" />
          <Text className={`mt-4 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Loading history...</Text>
        </View>
      ) : (
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? '#fff' : '#000'} />
          }
        >
          {historyData.map((day, index) => (
            <Animated.View 
              key={day.date} 
              entering={FadeInDown.delay(300 + index * 50).springify()}
            >
              <TouchableOpacity 
                onPress={() => setSelectedDay(selectedDay === day.date ? null : day.date)}
                activeOpacity={0.7}
                className="rounded-2xl mb-3 overflow-hidden"
                style={{ backgroundColor: isDark ? '#1a1a1a' : '#ffffff' }}
              >
                {/* Main Row */}
                <View className="p-4 flex-row items-center">
                  {/* Date Badge */}
                  <View 
                    className="w-14 h-14 rounded-xl items-center justify-center mr-4"
                    style={{ backgroundColor: day.totalPoints > 0 ? '#FF5500' : (isDark ? '#2a2a2a' : '#e5e7eb') }}
                  >
                    <Text className={`text-lg font-bold ${day.totalPoints > 0 ? 'text-white' : (isDark ? 'text-gray-600' : 'text-gray-400')}`}>
                      {day.displayDate === 'Today' || day.displayDate === 'Yesterday' 
                        ? day.displayDate.substring(0, 3) 
                        : day.displayDate.split(' ')[0]}
                    </Text>
                    <Text className={`text-[10px] ${day.totalPoints > 0 ? 'text-white/70' : (isDark ? 'text-gray-600' : 'text-gray-400')}`}>
                      {day.dayName}
                    </Text>
                  </View>

                  {/* Info */}
                  <View className="flex-1">
                    <Text className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {day.displayDate}
                    </Text>
                    {day.totalPoints > 0 ? (
                      <Text className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                        {day.firstTime} - {day.lastTime} • {formatDuration(day.duration)}
                      </Text>
                    ) : (
                      <Text className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                        No activity
                      </Text>
                    )}
                  </View>

                  {/* Stats */}
                  {day.totalPoints > 0 && (
                    <View className="items-end">
                      <Text className="text-[#FF5500] font-bold text-lg">{day.totalDistance} km</Text>
                      <Text className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                        {day.maxSpeed} km/h max
                      </Text>
                    </View>
                  )}

                  {/* Expand Icon */}
                  {day.totalPoints > 0 && (
                    <MaterialCommunityIcons 
                      name={selectedDay === day.date ? "chevron-up" : "chevron-down"} 
                      size={20} 
                      color={isDark ? '#666' : '#999'} 
                      style={{ marginLeft: 8 }}
                    />
                  )}
                </View>

                {/* Expanded Details */}
                {selectedDay === day.date && day.totalPoints > 0 && (
                  <View className={`px-4 pb-4 pt-2 border-t ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                    <View className="flex-row flex-wrap gap-3">
                      <DetailChip 
                        icon="map-marker-path" 
                        label="Total Points" 
                        value={day.totalPoints} 
                        color="#22c55e" 
                        isDark={isDark} 
                      />
                      <DetailChip 
                        icon="speedometer" 
                        label="Max Speed" 
                        value={`${day.maxSpeed} km/h`} 
                        color="#3b82f6" 
                        isDark={isDark} 
                      />
                      <DetailChip 
                        icon="clock-outline" 
                        label="Duration" 
                        value={formatDuration(day.duration)} 
                        color="#8b5cf6" 
                        isDark={isDark} 
                      />
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            </Animated.View>
          ))}

          {/* Empty State */}
          {historyData.every(d => d.totalPoints === 0) && (
            <View className="items-center py-12">
              <MaterialCommunityIcons name="tractor-variant" size={64} color={isDark ? '#333' : '#ddd'} />
              <Text className={`mt-4 text-lg font-medium ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                No trips recorded
              </Text>
              <Text className={`text-sm ${isDark ? 'text-gray-700' : 'text-gray-400'}`}>
                Tractor activity will appear here
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// Detail Chip Component
function DetailChip({ icon, label, value, color, isDark }: { 
  icon: string; 
  label: string; 
  value: any; 
  color: string;
  isDark: boolean;
}) {
  return (
    <View 
      className="flex-row items-center px-3 py-2 rounded-xl"
      style={{ backgroundColor: isDark ? '#2a2a2a' : '#f3f4f6' }}
    >
      <MaterialCommunityIcons name={icon as any} size={16} color={color} />
      <View className="ml-2">
        <Text className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{label}</Text>
        <Text className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{value}</Text>
      </View>
    </View>
  );
}
