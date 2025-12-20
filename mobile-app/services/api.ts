import Config from '@/constants/Config';

const BASE_URL = Config.API_URL;

export const api = {
  /**
   * Get tracking history for a specific date
   */
  getHistory: async (deviceId: string, date?: string) => {
    try {
      const query = date ? `?device_id=${deviceId}&date=${date}` : `?device_id=${deviceId}`;
      const response = await fetch(`${BASE_URL}/api/history${query}`);
      if (!response.ok) throw new Error('Network response was not ok');
      return await response.json();
    } catch (error) {
      console.error('API Error (getHistory):', error);
      throw error;
    }
  },

  /**
   * Get daily statistics (distance, max speed, etc.)
   */
  getStats: async (deviceId: string) => {
    try {
      const response = await fetch(`${BASE_URL}/api/stats?device_id=${deviceId}`);
      if (!response.ok) throw new Error('Network response was not ok');
      return await response.json();
    } catch (error) {
      console.error('API Error (getStats):', error);
      throw error;
    }
  },

  /**
   * Run system diagnosis and auto-repair check
   */
  diagnoseSystem: async (deviceId: string) => {
    try {
      const response = await fetch(`${BASE_URL}/api/diagnose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId })
      });
      if (!response.ok) throw new Error('Network response was not ok');
      return await response.json();
    } catch (error) {
      console.error('API Error (diagnoseSystem):', error);
      throw error;
    }
  },

  /**
   * Start Route Learning Mode (48 Hours)
   */
  startLearning: async (deviceId: string) => {
    try {
      const response = await fetch(`${BASE_URL}/api/learn/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId })
      });
      if (!response.ok) throw new Error('Network response was not ok');
      return await response.json();
    } catch (error) {
      console.error('API Error (startLearning):', error);
      throw error;
    }
  },

  /**
   * Delete Learned Route Data
   */
  deleteLearning: async (deviceId: string) => {
    try {
      const response = await fetch(`${BASE_URL}/api/learn/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId })
      });
      if (!response.ok) throw new Error('Network response was not ok');
      return await response.json();
    } catch (error) {
      console.error('API Error (deleteLearning):', error);
      throw error;
    }
  }
};
