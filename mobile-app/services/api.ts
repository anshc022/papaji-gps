/**
 * ============================================
 * PAPAJI GPS TRACKER - API SERVICE v2.0 (CLEAN)
 * ============================================
 * 
 * Centralized API functions for the mobile app
 */

import Config from '@/constants/Config';

// ============================================
// CONFIGURATION
// ============================================
const API_BASE_URL = Config.API_URL;
const REQUEST_TIMEOUT = 10000; // 10 seconds

// ============================================
// TYPES
// ============================================
export interface LocationPoint {
  id?: number;
  device_id?: string;
  latitude: number;
  longitude: number;
  speed_kmh: number;
  source: 'gps' | 'gsm' | 'none';
  signal?: number;
  hdop?: number;
  satellites?: number;
  battery_voltage?: number;
  created_at: string;
}

// Response from history endpoint
export interface HistoryResponse {
  gps: LocationPoint[];
  gsm?: LocationPoint[]; // Ignored
}

export interface Stats {
  date: string;
  max_speed: number;
  total_distance_km: number;
  total_duration_minutes: number;
  total_points: number;
  status: string;
  source: string;
  signal: number;
  hdop: number;
  satellites: number;
  last_lat: number;
  last_lon: number;
  last_speed: number;
  last_seen: string;
}

export interface SmsMessage {
  id: number;
  device_id: string;
  sender: string;
  message: string;
  received_at: string;
}

export interface ServerLog {
  timestamp: string;
  type: string;
  message: string;
  data?: any;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Make HTTP request with timeout
 */
async function request<T>(
  endpoint: string, 
  options: RequestInit = {}
): Promise<T | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`API Error: ${response.status} ${response.statusText}`);
      return null;
    }

    return await response.json();

  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Request timeout');
    } else {
      console.error('Request failed:', error);
    }
    
    return null;
  }
}

// ============================================
// API FUNCTIONS
// ============================================
export const api = {
  /**
   * Get latest GPS location
   */
  async getLatest(deviceId: string): Promise<LocationPoint | null> {
    return request<LocationPoint>(`/api/latest?device_id=${deviceId}`);
  },

  /**
   * Get location history for a specific date
   * @param deviceId Device identifier
   * @param date Date in YYYY-MM-DD format
   */
  async getHistoryByDate(deviceId: string, date: string): Promise<HistoryResponse> {
    const data = await request<HistoryResponse>(`/api/history?device_id=${deviceId}&date=${date}`);
    return data || { gps: [], gsm: [] };
  },

  /**
   * Get today's statistics
   */
  async getStats(deviceId: string): Promise<Stats | null> {
    return request<Stats>(`/api/stats?device_id=${deviceId}`);
  },

  /**
   * Get SMS inbox
   * @param limit Maximum messages to fetch (default: 50)
   */
  async getSmsInbox(limit = 50): Promise<SmsMessage[]> {
    const data = await request<SmsMessage[]>(`/api/sms/list?limit=${limit}`);
    return data || [];
  },

  /**
   * Get server logs
   * @param limit Maximum logs to fetch (default: 100)
   */
  async getServerLogs(limit = 100): Promise<ServerLog[]> {
    const data = await request<any>(`/api/admin/logs`);
    return data?.logs || [];
  },

  /**
   * Clear server logs
   */
  async clearServerLogs(): Promise<boolean> {
    const result = await request('/api/admin/clear-data', { 
      method: 'POST',
      body: JSON.stringify({ pin: '1477' })
    });
    return result !== null;
  },

  /**
   * Reset device
   * @param deviceId Device identifier
   * @param pin Security PIN
   */
  async resetDevice(deviceId: string, pin: string): Promise<boolean> {
    const result = await request('/api/admin/reset-device', {
      method: 'POST',
      body: JSON.stringify({ device_id: deviceId, pin })
    });
    return result !== null;
  },

  /**
   * Delete SMS from inbox
   * @param id SMS ID
   */
  async deleteSms(id: number): Promise<boolean> {
    const result = await request(`/api/sms/${id}`, { method: 'DELETE' });
    return result !== null;
  },

  /**
   * Clear all GPS/GSM data
   * @param pin Security PIN (default: 1477)
   */
  async clearAllData(pin = '1477'): Promise<boolean> {
    const result = await request('/api/admin/clear-data', { 
      method: 'POST',
      body: JSON.stringify({ pin })
    });
    return result !== null;
  },

  /**
   * Get device diagnosis
   */
  async getDiagnosis(deviceId: string): Promise<any | null> {
    return request<any>(`/api/diagnose?device_id=${deviceId}`);
  },
};

export default api;
