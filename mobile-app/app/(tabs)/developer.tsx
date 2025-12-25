import { useTheme } from '@/context/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  Alert,
  RefreshControl 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { api } from '@/services/api';
import Config from '@/constants/Config';

const SECRET_PIN = '1477';

export default function DeveloperScreen() {
  const { activeTheme } = useTheme();
  const isDark = activeTheme === 'dark';
  
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [serverLogs, setServerLogs] = useState<any[]>([]);
  const [smsInbox, setSmsInbox] = useState<any[]>([]);
  const [dbStats, setDbStats] = useState<any>(null);
  const [serverStatus, setServerStatus] = useState<string>('Checking...');
  const [serverInfo, setServerInfo] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [logViewMode, setLogViewMode] = useState<'server' | 'app' | 'sms'>('server');

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${msg}`, ...prev.slice(0, 99)]);
  };

  const checkPin = () => {
    if (pin === SECRET_PIN) {
      setIsUnlocked(true);
      addLog('Developer mode unlocked');
    } else {
      Alert.alert('Wrong PIN', 'Access denied');
      setPin('');
    }
  };

  const loadData = async () => {
    setRefreshing(true);
    addLog('Fetching data...');

    try {
      const res = await fetch(`${Config.API_URL}/api/stats?device_id=papaji_tractor_01`);
      if (res.ok) {
        const data = await res.json();
        setDbStats(data);
        setServerStatus('Online');
        addLog(`Server OK. Points: ${data.total_points || 0}`);
      } else {
        setServerStatus('Error');
        addLog(`Server Error: ${res.status}`);
      }
    } catch (e: any) {
      setServerStatus('Offline');
      addLog(`Server Offline: ${e.message}`);
    }

    try {
      const logsRes = await fetch(`${Config.API_URL}/api/logs`);
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setServerLogs(logsData.logs || []);
        setServerInfo({
          uptime: Math.round((logsData.uptime || 0) / 60),
          memory: Math.round((logsData.memory?.heapUsed || 0) / 1024 / 1024),
          nodeVersion: logsData.nodeVersion || 'N/A'
        });
      }
    } catch (e: any) {
      addLog(`Failed to fetch server logs`);
    }

    try {
      const sms = await api.getSmsInbox();
      setSmsInbox(sms || []);
    } catch (e: any) {
      addLog(`Failed to fetch SMS`);
    }

    setRefreshing(false);
  };

  useEffect(() => {
    if (isUnlocked) loadData();
  }, [isUnlocked]);

  const testDiagnose = async () => {
    addLog('Running diagnosis...');
    try {
      const data = await api.getDiagnosis('papaji_tractor_01');
      if (data) {
        addLog(`✅ ${data.status}: ${data.message}`);
        Alert.alert(data.status, data.message);
      } else {
        addLog('❌ No response');
      }
    } catch (e: any) {
      addLog(`❌ Diagnose failed: ${e.message}`);
    }
  };

  const handleClearData = () => {
    Alert.alert(
      '⚠️ Delete All Data',
      'This will permanently delete all GPS history. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              addLog('Clearing database...');
              await api.clearAllData(SECRET_PIN);
              addLog('✅ Database Cleared');
              Alert.alert('Success', 'All data deleted.');
              loadData();
            } catch (e: any) {
              addLog(`❌ Failed: ${e.message}`);
            }
          }
        }
      ]
    );
  };

  const handleResetDevice = async () => {
    Alert.alert(
      'Hard Reset',
      'This will restart the ESP32 device. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Reset', 
          style: 'destructive',
          onPress: async () => {
            try {
              addLog('Sending reset command...');
              await api.resetDevice('papaji_tractor_01', SECRET_PIN);
              addLog('✅ Reset command sent');
              Alert.alert('Success', 'Device will restart on next sync.');
            } catch (e: any) {
              addLog(`❌ Failed: ${e.message}`);
            }
          }
        }
      ]
    );
  };

  const handleReconnect = async () => {
    try {
      addLog('Sending reconnect command...');
      await api.reconnectDevice('papaji_tractor_01', SECRET_PIN);
      addLog('✅ Reconnect command sent');
      Alert.alert('Success', 'Device will reconnect on next sync.');
    } catch (e: any) {
      addLog(`❌ Failed: ${e.message}`);
    }
  };

  const handleDeleteSms = async (id: number) => {
    try {
      await api.deleteSms(id);
      setSmsInbox(prev => prev.filter(s => s.id !== id));
      addLog('SMS Deleted');
    } catch (e: any) {
      addLog(`Failed to delete SMS`);
    }
  };

  // PIN Entry Screen
  if (!isUnlocked) {
    return (
      <SafeAreaView className={`flex-1 items-center justify-center p-6 ${isDark ? 'bg-[#0a0a0a]' : 'bg-gray-50'}`}>
        <Animated.View entering={FadeInDown.springify()} className="items-center">
          <View 
            className="w-24 h-24 rounded-full items-center justify-center mb-6"
            style={{ backgroundColor: isDark ? '#2a2a2a' : '#e5e7eb' }}
          >
            <MaterialCommunityIcons name="shield-lock" size={48} color={isDark ? '#666' : '#999'} />
          </View>
          
          <Text className={`text-2xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Developer Access
          </Text>
          <Text className={`text-sm mb-8 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
            Enter PIN to continue
          </Text>
          
          <TextInput
            value={pin}
            onChangeText={setPin}
            placeholder="• • • •"
            placeholderTextColor={isDark ? '#444' : '#ccc'}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            className="text-center text-3xl tracking-[20px] w-56 py-4 rounded-2xl mb-6 font-bold"
            style={{ 
              backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
              color: isDark ? '#ffffff' : '#111827',
              borderWidth: isDark ? 0 : 1,
              borderColor: '#e5e7eb'
            }}
          />
          
          <TouchableOpacity 
            onPress={checkPin}
            className="bg-[#FF5500] px-12 py-4 rounded-2xl shadow-lg"
            style={{ shadowColor: '#FF5500', shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 }}
          >
            <Text className="text-white font-bold text-lg">Unlock</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    );
  }

  // Developer Dashboard
  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-[#0a0a0a]' : 'bg-gray-50'}`}>
      <ScrollView 
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor={isDark ? '#fff' : '#000'} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={FadeInUp.delay(100)} className="flex-row items-center justify-between py-4">
          <View>
            <Text className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Developer</Text>
            <Text className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>System Controls</Text>
          </View>
          <TouchableOpacity 
            onPress={() => setIsUnlocked(false)} 
            className={`px-4 py-2 rounded-xl ${isDark ? 'bg-red-900/50' : 'bg-red-100'}`}
          >
            <Text className={`font-semibold ${isDark ? 'text-red-400' : 'text-red-600'}`}>Lock</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Server Status Card */}
        <Animated.View 
          entering={FadeInDown.delay(200)} 
          className="rounded-2xl p-4 mb-4"
          style={{ backgroundColor: isDark ? '#1a1a1a' : '#ffffff' }}
        >
          <View className="flex-row items-center justify-between mb-3">
            <Text className={`font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Server Status</Text>
            <View className={`flex-row items-center px-3 py-1 rounded-full ${
              serverStatus === 'Online' 
                ? (isDark ? 'bg-green-900/50' : 'bg-green-100') 
                : (isDark ? 'bg-red-900/50' : 'bg-red-100')
            }`}>
              <View className={`w-2 h-2 rounded-full mr-2 ${serverStatus === 'Online' ? 'bg-green-500' : 'bg-red-500'}`} />
              <Text className={`text-sm font-medium ${
                serverStatus === 'Online' 
                  ? (isDark ? 'text-green-400' : 'text-green-700')
                  : (isDark ? 'text-red-400' : 'text-red-700')
              }`}>{serverStatus}</Text>
            </View>
          </View>
          
          <Text className={`text-xs mb-2 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>{Config.API_URL}</Text>
          
          {serverInfo && (
            <View className="flex-row gap-4 mt-2">
              <View 
                className="flex-1 p-3 rounded-xl"
                style={{ backgroundColor: isDark ? '#2a2a2a' : '#f3f4f6' }}
              >
                <Text className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Uptime</Text>
                <Text className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{serverInfo.uptime}m</Text>
              </View>
              <View 
                className="flex-1 p-3 rounded-xl"
                style={{ backgroundColor: isDark ? '#2a2a2a' : '#f3f4f6' }}
              >
                <Text className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Memory</Text>
                <Text className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{serverInfo.memory}MB</Text>
              </View>
              <View 
                className="flex-1 p-3 rounded-xl"
                style={{ backgroundColor: isDark ? '#2a2a2a' : '#f3f4f6' }}
              >
                <Text className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Node</Text>
                <Text className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{serverInfo.nodeVersion}</Text>
              </View>
            </View>
          )}
        </Animated.View>

        {/* Device Stats */}
        {dbStats && (
          <Animated.View 
            entering={FadeInDown.delay(300)} 
            className="rounded-2xl p-4 mb-4"
            style={{ backgroundColor: isDark ? '#1a1a1a' : '#ffffff' }}
          >
            <Text className={`font-semibold mb-3 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Device Statistics</Text>
            <View className="flex-row flex-wrap gap-3">
              <StatCard label="Points" value={dbStats.total_points || 0} icon="database" isDark={isDark} />
              <StatCard label="Distance" value={`${dbStats.total_distance_km || 0} km`} icon="map-marker-distance" isDark={isDark} />
              <StatCard label="Max Speed" value={`${dbStats.max_speed || 0} km/h`} icon="speedometer" isDark={isDark} />
              <StatCard label="Source" value={dbStats.source?.toUpperCase() || 'N/A'} icon="satellite-uplink" isDark={isDark} color={dbStats.source === 'gps' ? '#22c55e' : '#eab308'} />
            </View>
          </Animated.View>
        )}

        {/* ESP32 Telemetry */}
        {dbStats && (
          <Animated.View 
            entering={FadeInDown.delay(400)} 
            className="rounded-2xl p-4 mb-4 border"
            style={{ 
              backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
              borderColor: isDark ? '#14532d' : '#bbf7d0'
            }}
          >
            <View className="flex-row items-center mb-4">
              <MaterialCommunityIcons name="chip" size={20} color="#22c55e" />
              <Text className={`font-semibold ml-2 ${isDark ? 'text-green-400' : 'text-green-700'}`}>ESP32 Telemetry</Text>
              <View className={`ml-auto w-2 h-2 rounded-full ${dbStats.status === 'Online' ? 'bg-green-500' : 'bg-red-500'}`} />
            </View>

            <View className={`rounded-xl p-3 mb-3 ${isDark ? 'bg-black' : 'bg-gray-900'}`}>
              <Text className="text-gray-500 text-[10px] mb-1 font-mono">// GPS DATA</Text>
              <View className="flex-row flex-wrap">
                <TelemetryItem label="HDOP" value={dbStats.hdop?.toFixed(1) || 'N/A'} color={getHdopColor(dbStats.hdop)} />
                <TelemetryItem label="Satellites" value={dbStats.satellites || 0} color={dbStats.satellites >= 4 ? '#22c55e' : '#f59e0b'} />
                <TelemetryItem label="Signal" value={`${dbStats.signal || 0}`} color={dbStats.signal > 15 ? '#22c55e' : '#f59e0b'} />
                <TelemetryItem label="Speed" value={`${dbStats.last_speed?.toFixed(1) || 0} km/h`} color="#06b6d4" />
              </View>
            </View>

            <View className={`rounded-xl p-3 ${isDark ? 'bg-black' : 'bg-gray-900'}`}>
              <Text className="text-gray-500 text-[10px] mb-1 font-mono">// POSITION</Text>
              <Text className="text-green-400 font-mono text-xs">
                LAT: {dbStats.last_lat?.toFixed(6) || '0.000000'}
              </Text>
              <Text className="text-green-400 font-mono text-xs">
                LON: {dbStats.last_lon?.toFixed(6) || '0.000000'}
              </Text>
              <Text className="text-gray-500 font-mono text-[10px] mt-2">
                Last: {dbStats.last_seen ? new Date(dbStats.last_seen).toLocaleTimeString() : 'N/A'}
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Action Buttons */}
        <Animated.View entering={FadeInDown.delay(500)} className="mb-4">
          <Text className={`font-semibold mb-3 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Actions</Text>
          <View className="flex-row flex-wrap gap-3">
            <ActionButton label="Refresh" icon="refresh" color="#3b82f6" onPress={loadData} isDark={isDark} />
            <ActionButton label="Diagnose" icon="stethoscope" color="#8b5cf6" onPress={testDiagnose} isDark={isDark} />
            <ActionButton label="Reconnect" icon="wifi-sync" color="#f59e0b" onPress={handleReconnect} isDark={isDark} />
            <ActionButton label="Hard Reset" icon="restart" color="#f97316" onPress={handleResetDevice} isDark={isDark} />
            <ActionButton label="Wipe Data" icon="delete-forever" color="#ef4444" onPress={handleClearData} isDark={isDark} />
          </View>
        </Animated.View>

        {/* Log Tabs */}
        <Animated.View entering={FadeInDown.delay(600)}>
          <View className="flex-row gap-2 mb-3">
            {(['server', 'sms', 'app'] as const).map((mode) => (
              <TouchableOpacity 
                key={mode}
                onPress={() => setLogViewMode(mode)} 
                className="flex-1 py-2.5 rounded-xl items-center"
                style={{ backgroundColor: logViewMode === mode ? '#FF5500' : (isDark ? '#2a2a2a' : '#e5e7eb') }}
              >
                <Text className={`font-semibold text-sm ${
                  logViewMode === mode 
                    ? 'text-white' 
                    : (isDark ? 'text-gray-400' : 'text-gray-600')
                }`}>
                  {mode === 'server' ? 'Server' : mode === 'sms' ? `SMS (${smsInbox.length})` : 'App'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Logs Content */}
          <View className={`rounded-2xl p-4 min-h-[200px] ${isDark ? 'bg-black' : 'bg-gray-900'}`}>
            <Text className="text-green-500 font-mono text-xs mb-3">
              {logViewMode === 'server' ? `// Server Logs (${serverLogs.length})` 
                : logViewMode === 'sms' ? `// SMS Inbox (${smsInbox.length})`
                : `// App Logs (${logs.length})`}
            </Text>
            
            {logViewMode === 'server' && (
              serverLogs.length === 0 
                ? <Text className="text-gray-600 font-mono text-xs">No logs available...</Text>
                : serverLogs.slice(0, 20).map((log, i) => (
                    <View key={i} className="mb-2">
                      <Text className="text-gray-600 font-mono text-[10px]">
                        {new Date(log.time).toLocaleTimeString()}
                      </Text>
                      <Text className={`font-mono text-xs ${
                        log.type === 'ERROR' ? 'text-red-400' 
                        : log.type === 'DATA' ? 'text-cyan-400' 
                        : 'text-green-400'
                      }`}>
                        [{log.type}] {log.message}
                      </Text>
                    </View>
                  ))
            )}

            {logViewMode === 'sms' && (
              smsInbox.length === 0 
                ? <Text className="text-gray-600 font-mono text-xs">No SMS received...</Text>
                : smsInbox.map((sms, i) => (
                    <View key={i} className="mb-3 pb-2 border-b border-gray-800">
                      <View className="flex-row justify-between">
                        <View className="flex-1">
                          <Text className="text-yellow-400 font-mono text-xs font-bold">{sms.sender}</Text>
                          <Text className="text-gray-600 font-mono text-[10px]">
                            {new Date(sms.received_at).toLocaleString()}
                          </Text>
                          <Text className="text-white font-mono text-xs mt-1">{sms.message}</Text>
                        </View>
                        <TouchableOpacity 
                          onPress={() => handleDeleteSms(sms.id)} 
                          className="bg-red-900/50 px-2 py-1 rounded h-6"
                        >
                          <Text className="text-red-400 text-[10px]">DEL</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
            )}

            {logViewMode === 'app' && (
              logs.length === 0 
                ? <Text className="text-gray-600 font-mono text-xs">No logs yet...</Text>
                : logs.slice(0, 30).map((log, i) => (
                    <Text key={i} className="text-green-400 font-mono text-xs mb-1">{log}</Text>
                  ))
            )}
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Component: Stat Card
function StatCard({ label, value, icon, isDark, color }: { label: string; value: any; icon: string; isDark: boolean; color?: string }) {
  return (
    <View className={`w-[48%] p-3 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
      <View className="flex-row items-center mb-1">
        <MaterialCommunityIcons name={icon as any} size={14} color={color || (isDark ? '#888' : '#666')} />
        <Text className={`text-xs ml-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{label}</Text>
      </View>
      <Text className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`} style={color ? { color } : {}}>{value}</Text>
    </View>
  );
}

// Component: Action Button
function ActionButton({ label, icon, color, onPress, isDark }: { label: string; icon: string; color: string; onPress: () => void; isDark: boolean }) {
  return (
    <TouchableOpacity 
      onPress={onPress}
      className={`flex-row items-center px-4 py-3 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-white border border-gray-200'}`}
      style={{ minWidth: '30%' }}
    >
      <MaterialCommunityIcons name={icon as any} size={18} color={color} />
      <Text className={`ml-2 font-medium text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{label}</Text>
    </TouchableOpacity>
  );
}

// Component: Telemetry Item
function TelemetryItem({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <View className="w-1/2 mb-2">
      <Text className="text-gray-600 text-[10px] font-mono">{label}</Text>
      <Text className="font-mono font-bold text-sm" style={{ color }}>{value}</Text>
    </View>
  );
}

function getHdopColor(hdop: number | null): string {
  if (!hdop || hdop >= 99) return '#666';
  if (hdop < 1) return '#22c55e';
  if (hdop < 2) return '#84cc16';
  if (hdop < 5) return '#eab308';
  return '#ef4444';
}
