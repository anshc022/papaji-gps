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
  source: 'gps' | 'none'; // 'none' when no GPS available
  signal?: number;
  hdop?: number;
  satellites?: number;
  battery_voltage?: number;
  created_at: string;
}

// Response from history endpoint - GPS ONLY MODE (gsm kept for backward compatibility)
export interface HistoryResponse {
  gps: LocationPoint[];
  gsm?: LocationPoint[]; // Ignored, GPS only
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
  async getLatest(deviceId: string): Promise<LocationPoint | null> {
    return request<LocationPoint>(`/api/latest?device_id=${deviceId}`);
  },

  /**
   * Get location history
   * @param deviceId Device identifier
   * @param hours Number of hours to fetch (default: 24)
   */
  async getHistory(deviceId: string, hours = 24): Promise<LocationPoint[]> {
    const data = await request<LocationPoint[]>(`/api/history?device_id=${deviceId}&hours=${hours}`);
    return data || [];
  },

  /**
   * Get location history for a specific date
   * @param deviceId Device identifier
   * @param date Date in YYYY-MM-DD format
   * @returns Separate GPS and GSM point arrays
   */
  async getHistoryByDate(deviceId: string, date: string): Promise<HistoryResponse> {
    const data = await request<HistoryResponse>(`/api/history?device_id=${deviceId}&date=${date}`);
    return data || { gps: [], gsm: [] };
  },

  /**
   * Get today's statistics
   */
  async getStats(deviceId: string): Promise<any | null> {
    return request<any>(`/api/stats?device_id=${deviceId}`);
  },

  /**
   * Get stop locations
   * @param deviceId Device identifier
   * @param hours Number of hours to analyze (default: 24)
   */
  async getStops(deviceId: string, hours = 24): Promise<StopPoint[]> {
    const data = await request<StopPoint[]>(`/api/stops?device_id=${deviceId}&hours=${hours}`);
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
   * @param deviceId Device identifier
   * @param pin Security PIN
   */
  async resetDevice(deviceId: string, pin: string): Promise<boolean> {
    const result = await request('/api/admin/reset-device', {
      method: 'POST',
      body: JSON.stringify({ device_id: deviceId, type: 'hard', pin }),
    });
    return result !== null;
  },

  /**
   * Soft reconnect device
   * @param deviceId Device identifier  
   * @param pin Security PIN
   */
  async reconnectDevice(deviceId: string, pin: string): Promise<boolean> {
    const result = await request('/api/admin/reset-device', {
      method: 'POST',
      body: JSON.stringify({ device_id: deviceId, type: 'soft', pin }),
    });
    return result !== null;
  },

  /**
   * Delete SMS from inbox
   * @param id SMS ID
   */
  async deleteSms(id: number): Promise<boolean> {
    const result = await request(`/api/admin/sms/${id}`, { method: 'DELETE' });
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
   * Check server health
   */
  async healthCheck(): Promise<boolean> {
    const result = await request<{ status: string }>('/api/logs');
    return result !== null;
  },

  /**
   * Get device diagnosis
   */
  async getDiagnosis(deviceId: string): Promise<any | null> {
    return request<any>(`/api/diagnose?device_id=${deviceId}`);
  },
};

// ============================================
// EXPORT
// ============================================
export default api;
