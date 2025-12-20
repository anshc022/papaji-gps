import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

interface TractorStatusCardProps {
  speed: number;
  isMoving: boolean;
  lastUpdated: string;
  address: string;
}

export default function TractorStatusCard({ speed, isMoving, lastUpdated, address }: TractorStatusCardProps) {
  return (
    <View className="absolute bottom-5 left-4 right-4 bg-white p-4 rounded-2xl shadow-lg border border-gray-100">
      <View className="flex-row justify-between items-center mb-3">
        <View className="flex-row items-center gap-2">
          <View className={`w-3 h-3 rounded-full ${isMoving ? 'bg-green-500' : 'bg-red-500'}`} />
          <Text className="text-lg font-bold text-gray-800">
            {isMoving ? 'Moving' : 'Stopped'}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <MaterialCommunityIcons name="speedometer" size={20} color="#4B5563" />
          <Text className="text-xl font-bold text-gray-900">{speed} <Text className="text-sm font-normal text-gray-500">km/h</Text></Text>
        </View>
      </View>

      <View className="flex-row items-start gap-3 mb-3">
        <MaterialCommunityIcons name="map-marker" size={24} color="#DC2626" />
        <Text className="flex-1 text-gray-600 text-base leading-5">
          {address}
        </Text>
      </View>

      <View className="border-t border-gray-100 pt-2 flex-row justify-between items-center">
        <Text className="text-gray-400 text-sm">Last Updated</Text>
        <Text className="text-gray-600 font-medium">{lastUpdated}</Text>
      </View>
    </View>
  );
}
