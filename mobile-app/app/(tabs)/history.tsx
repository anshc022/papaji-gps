import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View, RefreshControl } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/services/api';

export default function HistoryScreen() {
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = async () => {
    try {
      // In a real app, you'd fetch a list of days. 
      // For now, we'll just fetch today's stats as an example
      // and keep the dummy data for older days until the backend supports "list of days"
      const stats = await api.getStats('papaji_tractor_01');
      
      setHistoryData([
        { id: 1, date: 'Today', distance: `${stats.total_distance_km} km`, time: 'Active' }
      ]);
    } catch (e) {
      console.log('Error loading history');
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100 dark:bg-dark-bg">
      <Animated.View 
        entering={FadeInUp.delay(200).springify()} 
        className="px-6 pt-4 mb-6"
      >
        <Text className="text-3xl font-bold text-black dark:text-white">Trip History</Text>
        <Text className="text-gray-500 dark:text-dark-subtext">Past 7 days activity</Text>
      </Animated.View>
      
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        className="px-6"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {historyData.map((item, index) => (
          <Animated.View 
            key={item.id} 
            entering={FadeInDown.delay(300 + index * 100).springify()}
          >
            <TouchableOpacity className="bg-white dark:bg-dark-card p-5 rounded-3xl mb-4 flex-row items-center justify-between border border-gray-200 dark:border-gray-800 shadow-sm dark:shadow-none">
              <View className="flex-row items-center gap-4">
                <View className="bg-primary/20 p-3 rounded-2xl">
                  <MaterialCommunityIcons name="tractor" size={24} color="#FF5500" />
                </View>
                <View>
                  <Text className="text-lg font-bold text-black dark:text-white">{item.date}</Text>
                  <Text className="text-gray-500 dark:text-dark-subtext">{item.time} Active</Text>
                </View>
              </View>
              <View className="items-end">
                <Text className="text-xl font-bold text-primary">{item.distance}</Text>
                <Text className="text-xs text-gray-500 dark:text-dark-subtext">Distance</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
