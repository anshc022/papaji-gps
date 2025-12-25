/*
 * GPS Data Model
 */

const supabase = require('../supabase');

class GPSModel {
  /**
   * Insert GPS points
   */
  static async insert(points) {
    const { data, error } = await supabase
      .from('gps_logs')
      .insert(points);
    
    return { data, error };
  }

  /**
   * Get latest GPS point for device
   */
  static async getLatest(deviceId) {
    const { data, error } = await supabase
      .from('gps_logs')
      .select('*')
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) return { data: null, error };
    return { data: data && data.length > 0 ? data[0] : null, error: null };
  }

  /**
   * Get GPS history for date range
   */
  static async getHistory(deviceId, startDate, endDate) {
    const { data, error } = await supabase
      .from('gps_logs')
      .select('latitude, longitude, speed, created_at, hdop, satellites')
      .eq('device_id', deviceId)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: true });
    
    return { data: data || [], error };
  }

  /**
   * Delete all GPS data
   */
  static async deleteAll() {
    const { error } = await supabase
      .from('gps_logs')
      .delete()
      .neq('id', 0);
    
    return { error };
  }
}

module.exports = GPSModel;
