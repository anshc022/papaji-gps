/*
 * Device Data Model
 */

const supabase = require('../supabase');

class DeviceModel {
  /**
   * Register/update push token
   */
  static async registerToken(deviceId, token) {
    const { data, error } = await supabase
      .from('device_tokens')
      .upsert({
        device_id: deviceId,
        token: token,
        updated_at: new Date().toISOString()
      });
    
    return { data, error };
  }

  /**
   * Get device token
   */
  static async getToken(deviceId) {
    const { data, error } = await supabase
      .from('device_tokens')
      .select('token')
      .eq('device_id', deviceId)
      .single();
    
    return { data, error };
  }
}

module.exports = DeviceModel;
