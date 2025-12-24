/**
 * ============================================
 * PAPAJI GPS TRACKER - API SERVICE v2.0 (CLEAN)
 * ============================================
 * 
 * Centralized API functions for the mobile app
 */

// ============================================
// CONFIGURATION
// ============================================
const API_BASE_URL = 'http://3.27.84.253:3000';
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
  source: 'gps' | 'gsm';
  signal?: number;
  hdop?: number;
  satellites?: number;
  battery_voltage?: number;
  created_at: string;
}

export interface StopPoint {
  latitude: number;
  longitude: number;
  duration_minutes: number;
  start_time: string;
  end_time?: string;
  ongoing?: boolean;
}

export interface Stats {
  distance_km: string;
  max_speed_kmh: string;
  avg_speed_kmh: string;
  active_time_hours: string;
  data_points: number;
  stops: StopPoint[];
  last_update: string | null;
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
  async getLatest(): Promise<LocationPoint | null> {
    return request<LocationPoint>('/api/latest');
  },

  /**
   * Get location history
   * @param hours Number of hours to fetch (default: 24)
   */
  async getHistory(hours = 24): Promise<LocationPoint[]> {
    const data = await request<LocationPoint[]>(`/api/history?hours=${hours}`);
    return data || [];
  },

  /**
   * Get today's statistics
   */
  async getStats(): Promise<Stats | null> {
    return request<Stats>('/api/stats');
  },

  /**
   * Get stop locations
   * @param hours Number of hours to analyze (default: 24)
   */
  async getStops(hours = 24): Promise<StopPoint[]> {
    const data = await request<StopPoint[]>(`/api/stops?hours=${hours}`);
    return data || [];
  },

  /**
   * Get SMS inbox
   * @param limit Maximum messages to fetch (default: 50)
   */
  async getSmsInbox(limit = 50): Promise<SmsMessage[]> {
    const data = await request<SmsMessage[]>(`/api/admin/sms?limit=${limit}`);
    return data || [];
  },

  /**
   * Get server logs
   * @param limit Maximum logs to fetch (default: 100)
   */
  async getServerLogs(limit = 100): Promise<ServerLog[]> {
    const data = await request<ServerLog[]>(`/api/admin/logs?limit=${limit}`);
    return data || [];
  },

  /**
   * Clear server logs
   */
  async clearServerLogs(): Promise<boolean> {
    const result = await request('/api/admin/clear-logs', { method: 'POST' });
    return result !== null;
  },

  /**
   * Reset device
   * @param type 'hard' = full restart, 'soft' = reconnect only
   */
  async resetDevice(type: 'hard' | 'soft'): Promise<boolean> {
    const result = await request('/api/admin/reset-device', {
      method: 'POST',
      body: JSON.stringify({ type }),
    });
    return result !== null;
  },

  /**
   * Clear all GPS/GSM data
   */
  async clearAllData(): Promise<boolean> {
    const result = await request('/api/admin/data', { method: 'DELETE' });
    return result !== null;
  },

  /**
   * Check server health
   */
  async healthCheck(): Promise<boolean> {
    const result = await request<{ status: string }>('/api/health');
    return result?.status === 'healthy';
  },
};

// ============================================
// EXPORT
// ============================================
export default api;
