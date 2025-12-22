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
import { api } from '@/services/api';
import Config from '@/constants/Config';

const SECRET_PIN = '1477'; // Change this to your desired PIN

export default function DeveloperScreen() {
  const { activeTheme } = useTheme();
  const isDark = activeTheme === 'dark';
  
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [serverLogs, setServerLogs] = useState<any[]>([]);
  const [dbStats, setDbStats] = useState<any>(null);
  const [serverStatus, setServerStatus] = useState<string>('Checking...');
  const [serverInfo, setServerInfo] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showServerLogs, setShowServerLogs] = useState(true);

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

    // Check Server
    try {
      const res = await fetch(`${Config.API_URL}/api/stats?device_id=papaji_tractor_01`);
      if (res.ok) {
        const data = await res.json();
        setDbStats(data);
        setServerStatus(`Online (${res.status})`);
        addLog(`Server OK. Points: ${data.total_points}`);
      } else {
        setServerStatus(`Error: ${res.status}`);
        addLog(`Server Error: ${res.status}`);
      }
    } catch (e: any) {
      setServerStatus('Offline');
      addLog(`Server Offline: ${e.message}`);
    }

    // Fetch Server Logs
    try {
      const logsRes = await fetch(`${Config.API_URL}/api/logs`);
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setServerLogs(logsData.logs || []);
        setServerInfo({
          uptime: Math.round(logsData.uptime / 60),
          memory: Math.round(logsData.memory?.heapUsed / 1024 / 1024),
          nodeVersion: logsData.nodeVersion
        });
        addLog(`Fetched ${logsData.logs?.length || 0} server logs`);
      }
    } catch (e: any) {
      addLog(`Failed to fetch server logs: ${e.message}`);
    }

    setRefreshing(false);
  };

  useEffect(() => {
    if (isUnlocked) loadData();
  }, [isUnlocked]);

  const testPush = async () => {
    addLog('Testing push notification...');
    try {
      const res = await fetch(`${Config.API_URL}/api/diagnose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: 'papaji_tractor_01' })
      });
      const data = await res.json();
      addLog(`Diagnose: ${data.status} - ${data.message}`);
    } catch (e: any) {
      addLog(`Diagnose failed: ${e.message}`);
    }
  };

  const handleClearData = () => {
    Alert.alert(
      '⚠️ DANGER ZONE',
      'Are you sure you want to DELETE ALL HISTORY? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'DELETE EVERYTHING', 
          style: 'destructive',
          onPress: async () => {
            try {
              addLog('Clearing database...');
              await api.clearAllData(SECRET_PIN);
              addLog('✅ Database Cleared Successfully');
              Alert.alert('Success', 'All data has been wiped.');
              loadData(); // Refresh stats
            } catch (e: any) {
              addLog(`❌ Clear Failed: ${e.message}`);
              Alert.alert('Error', e.message);
            }
          }
        }
      ]
    );
  };

  const handleResetDevice = () => {
    Alert.alert(
      '⚠️ HARD RESET',
      'This will force the device to restart immediately. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'RESET DEVICE', 
          style: 'destructive',
          onPress: async () => {
            try {
              addLog('Sending reset command...');
              await api.resetDevice('papaji_tractor_01', SECRET_PIN);
              addLog('✅ Reset Command Sent');
              Alert.alert('Success', 'Reset command queued. Device will restart on next sync.');
            } catch (e: any) {
              addLog(`❌ Reset Failed: ${e.message}`);
              Alert.alert('Error', e.message);
            }
          }
        }
      ]
    );
  };

  const handleReconnectDevice = () => {
    Alert.alert(
      'Soft Reset',
      'This will force the device to reconnect to the network. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Reconnect', 
          onPress: async () => {
            try {
              addLog('Sending reconnect command...');
              await api.reconnectDevice('papaji_tractor_01', SECRET_PIN);
              addLog('✅ Reconnect Command Sent');
              Alert.alert('Success', 'Reconnect command queued.');
            } catch (e: any) {
              addLog(`❌ Reconnect Failed: ${e.message}`);
              Alert.alert('Error', e.message);
            }
          }
        }
      ]
    );
  };

  const clearLogs = () => {
    setLogs([]);
    addLog('Logs cleared');
  };

  // PIN Entry Screen
  if (!isUnlocked) {
    return (
      <SafeAreaView className="flex-1 bg-gray-100 dark:bg-dark-bg items-center justify-center p-6">
        <MaterialCommunityIcons name="lock" size={60} color={isDark ? '#666' : '#ccc'} />
        <Text className="text-2xl font-bold text-black dark:text-white mt-4 mb-2">Developer Mode</Text>
        <Text className="text-gray-500 dark:text-gray-400 mb-6">Enter PIN to unlock</Text>
        
        <TextInput
          value={pin}
          onChangeText={setPin}
          placeholder="Enter PIN"
          placeholderTextColor="#888"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={4}
          className="bg-white dark:bg-dark-card text-black dark:text-white text-center text-2xl tracking-widest w-48 py-4 rounded-xl mb-4"
        />
        
        <TouchableOpacity 
          onPress={checkPin}
          className="bg-primary px-8 py-3 rounded-xl"
        >
          <Text className="text-white font-bold text-lg">Unlock</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Developer Dashboard
  return (
    <SafeAreaView className="flex-1 bg-gray-100 dark:bg-dark-bg">
      <ScrollView 
        className="flex-1 p-4"
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} />}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-2xl font-bold text-black dark:text-white">🛠 Developer</Text>
          <TouchableOpacity onPress={() => setIsUnlocked(false)} className="bg-red-500 px-3 py-2 rounded-lg">
            <Text className="text-white font-bold">Lock</Text>
          </TouchableOpacity>
        </View>

        {/* Server Status */}
        <View className="bg-white dark:bg-dark-card rounded-2xl p-4 mb-4">
          <Text className="text-gray-500 dark:text-gray-400 text-sm mb-1">Server Status</Text>
          <Text className={`text-lg font-bold ${serverStatus.includes('Online') ? 'text-green-500' : 'text-red-500'}`}>
            {serverStatus}
          </Text>
          <Text className="text-gray-400 text-xs mt-1">{Config.API_URL}</Text>
          {serverInfo && (
            <View className="flex-row mt-2 gap-4">
              <Text className="text-gray-400 text-xs">⏱ {serverInfo.uptime}m uptime</Text>
              <Text className="text-gray-400 text-xs">💾 {serverInfo.memory}MB</Text>
              <Text className="text-gray-400 text-xs">📦 {serverInfo.nodeVersion}</Text>
            </View>
          )}
        </View>

        {/* DB Stats */}
        {dbStats && (
          <View className="bg-white dark:bg-dark-card rounded-2xl p-4 mb-4">
            <Text className="text-gray-500 dark:text-gray-400 text-sm mb-2">Database Stats</Text>
            <View className="flex-row flex-wrap">
              <StatBox label="Total Points" value={dbStats.total_points} />
              <StatBox label="Status" value={dbStats.status} />
              <StatBox label="Max Speed" value={`${dbStats.max_speed} km/h`} />
              <StatBox label="Distance" value={`${dbStats.total_distance_km} km`} />
            </View>
          </View>
        )}

        {/* ESP32 Live Telemetry */}
        {dbStats && (
          <View className="bg-gradient-to-r from-gray-800 to-gray-900 dark:from-gray-900 dark:to-black rounded-2xl p-4 mb-4 border border-green-500/30">
            <View className="flex-row items-center mb-3">
              <Text className="text-green-400 text-lg font-bold">📡 ESP32 Live Telemetry</Text>
              <View className={`ml-auto w-2 h-2 rounded-full ${dbStats.status === 'Online' ? 'bg-green-500' : 'bg-red-500'}`} />
            </View>
            
            {/* GPS Section */}
            <View className="bg-black/30 rounded-xl p-3 mb-3">
              <Text className="text-gray-400 text-xs mb-2">🛰️ GPS DATA</Text>
              <View className="flex-row flex-wrap">
                <TelemetryItem 
                  label="Source" 
                  value={dbStats.source?.toUpperCase() || 'N/A'} 
                  color={dbStats.source === 'gps' ? 'text-green-400' : 'text-yellow-400'} 
                />
                <TelemetryItem 
                  label="HDOP" 
                  value={dbStats.hdop ? dbStats.hdop.toFixed(1) : 'N/A'} 
                  color={getHdopColor(dbStats.hdop)}
                  hint={getHdopHint(dbStats.hdop)}
                />
                <TelemetryItem 
                  label="Satellites" 
                  value={dbStats.satellites || 0} 
                  color={dbStats.satellites >= 6 ? 'text-green-400' : dbStats.satellites >= 4 ? 'text-yellow-400' : 'text-red-400'} 
                />
                <TelemetryItem 
                  label="Signal (GSM)" 
                  value={`${dbStats.signal || 0} dBm`} 
                  color={dbStats.signal > 15 ? 'text-green-400' : dbStats.signal > 10 ? 'text-yellow-400' : 'text-red-400'} 
                />
              </View>
            </View>

            {/* Position Section */}
            <View className="bg-black/30 rounded-xl p-3 mb-3">
              <Text className="text-gray-400 text-xs mb-2">📍 LATEST POSITION</Text>
              <View className="flex-row flex-wrap">
                <TelemetryItem label="Latitude" value={dbStats.last_lat?.toFixed(6) || 'N/A'} color="text-cyan-400" />
                <TelemetryItem label="Longitude" value={dbStats.last_lon?.toFixed(6) || 'N/A'} color="text-cyan-400" />
                <TelemetryItem label="Speed" value={`${dbStats.last_speed?.toFixed(1) || 0} km/h`} color="text-white" />
                <TelemetryItem 
                  label="Last Update" 
                  value={dbStats.last_seen ? new Date(dbStats.last_seen).toLocaleTimeString() : 'N/A'} 
                  color="text-gray-300" 
                />
              </View>
            </View>

            {/* Serial-like output */}
            <View className="bg-black rounded-xl p-3">
              <Text className="text-gray-500 text-xs mb-1">// ESP32 Serial Output</Text>
              <Text className="text-green-300 font-mono text-xs">
                {dbStats.source === 'gps' 
                  ? `GPS: ${dbStats.last_lat?.toFixed(6) || 0}, ${dbStats.last_lon?.toFixed(6) || 0} | HDOP: ${dbStats.hdop?.toFixed(1) || 'N/A'} | Sats: ${dbStats.satellites || 0}`
                  : dbStats.source === 'gsm'
                  ? `GSM Fallback: ${dbStats.last_lat?.toFixed(6) || 0}, ${dbStats.last_lon?.toFixed(6) || 0} | Signal: ${dbStats.signal || 0}`
                  : 'Waiting for data...'
                }
              </Text>
              <Text className="text-gray-500 font-mono text-xs mt-1">
                Signal Quality: {dbStats.signal || 0} | Speed: {dbStats.last_speed?.toFixed(1) || 0} km/h
              </Text>
            </View>
          </View>
        )}

        {/* Actions */}
        <View className="flex-row gap-3 mb-4 flex-wrap">
          <TouchableOpacity onPress={loadData} className="flex-1 min-w-[45%] bg-blue-500 py-3 rounded-xl items-center">
            <Text className="text-white font-bold">Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={testPush} className="flex-1 min-w-[45%] bg-purple-500 py-3 rounded-xl items-center">
            <Text className="text-white font-bold">Diagnose</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClearData} className="flex-1 min-w-[45%] bg-red-600 py-3 rounded-xl items-center">
            <Text className="text-white font-bold">Wipe Data</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleResetDevice} className="flex-1 min-w-[45%] bg-orange-500 py-3 rounded-xl items-center">
            <Text className="text-white font-bold">Hard Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleReconnectDevice} className="flex-1 min-w-[45%] bg-yellow-500 py-3 rounded-xl items-center">
            <Text className="text-white font-bold">Soft Reset</Text>
          </TouchableOpacity>
        </View>

        {/* Logs Toggle */}
        <View className="flex-row gap-2 mb-4">
          <TouchableOpacity 
            onPress={() => setShowServerLogs(true)} 
            className={`flex-1 py-2 rounded-xl items-center ${showServerLogs ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-700'}`}
          >
            <Text className={`font-bold ${showServerLogs ? 'text-white' : 'text-gray-600 dark:text-gray-300'}`}>Server Logs</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setShowServerLogs(false)} 
            className={`flex-1 py-2 rounded-xl items-center ${!showServerLogs ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-700'}`}
          >
            <Text className={`font-bold ${!showServerLogs ? 'text-white' : 'text-gray-600 dark:text-gray-300'}`}>App Logs</Text>
          </TouchableOpacity>
        </View>

        {/* Logs */}
        <View className="bg-black rounded-2xl p-4">
          <Text className="text-green-400 font-mono text-xs mb-2">
            📋 {showServerLogs ? `Server Logs (${serverLogs.length})` : `App Logs (${logs.length})`}
          </Text>
          {showServerLogs ? (
            serverLogs.length === 0 ? (
              <Text className="text-gray-500 font-mono text-xs">No server logs yet...</Text>
            ) : (
              serverLogs.map((log, i) => (
                <View key={i} className="mb-2">
                  <Text className="text-gray-500 font-mono text-[10px]">{new Date(log.time).toLocaleTimeString()}</Text>
                  <Text className={`font-mono text-xs ${log.type === 'DATA' ? 'text-cyan-400' : log.type === 'ERROR' ? 'text-red-400' : 'text-green-300'}`}>
                    [{log.type}] {log.message}
                  </Text>
                </View>
              ))
            )
          ) : (
            logs.length === 0 ? (
              <Text className="text-gray-500 font-mono text-xs">No logs yet...</Text>
            ) : (
              logs.map((log, i) => (
                <Text key={i} className="text-green-300 font-mono text-xs mb-1">{log}</Text>
              ))
            )
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({ label, value }: { label: string; value: any }) {
  return (
    <View className="w-1/2 mb-2">
      <Text className="text-gray-400 text-xs">{label}</Text>
      <Text className="text-black dark:text-white font-bold">{value ?? '-'}</Text>
    </View>
  );
}

function TelemetryItem({ label, value, color, hint }: { label: string; value: any; color: string; hint?: string }) {
  return (
    <View className="w-1/2 mb-2">
      <Text className="text-gray-500 text-[10px]">{label}</Text>
      <Text className={`font-mono font-bold ${color}`}>{value}</Text>
      {hint && <Text className="text-gray-600 text-[9px]">{hint}</Text>}
    </View>
  );
}

function getHdopColor(hdop: number | null): string {
  if (!hdop || hdop >= 99) return 'text-gray-400';
  if (hdop < 1) return 'text-green-400';
  if (hdop < 2) return 'text-green-300';
  if (hdop < 5) return 'text-yellow-400';
  return 'text-red-400';
}

function getHdopHint(hdop: number | null): string {
  if (!hdop || hdop >= 99) return 'No GPS Fix';
  if (hdop < 1) return 'Excellent';
  if (hdop < 2) return 'Very Good';
  if (hdop < 5) return 'Good';
  return 'Poor';
}
