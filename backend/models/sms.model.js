/*
 * SMS Data Model
 */

const supabase = require('../supabase');

class SMSModel {
  /**
   * Insert SMS message
   */
  static async insert(message) {
    const { data, error } = await supabase
      .from('sms_inbox')
      .insert(message);
    
    return { data, error };
  }

  /**
   * Get recent SMS messages
   */
  static async getRecent(limit = 50) {
    const { data, error } = await supabase
      .from('sms_inbox')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(limit);
    
    return { data: data || [], error };
  }

  /**
   * Delete SMS by ID
   */
  static async delete(id) {
    const { error } = await supabase
      .from('sms_inbox')
      .delete()
      .eq('id', id);
    
    return { error };
  }

  /**
   * Delete all SMS
   */
  static async deleteAll() {
    const { error } = await supabase
      .from('sms_inbox')
      .delete()
      .neq('id', 0);
    
    return { error };
  }
}

module.exports = SMSModel;
