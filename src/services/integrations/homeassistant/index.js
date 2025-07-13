const axios = require('axios');

class HomeAssistantService {
  constructor() {
    this.baseUrl = process.env.HOME_ASSISTANT_URL;
    this.token = process.env.HOME_ASSISTANT_TOKEN;
    this.configured = !!(this.baseUrl && this.token);
  }

  isConfigured() {
    return this.configured;
  }

  // Get the current state of an entity
  async getEntityState(entityId) {
    if (!this.isConfigured()) {
      throw new Error('Home Assistant not configured. Missing HOME_ASSISTANT_URL or HOME_ASSISTANT_TOKEN');
    }

    try {
      const response = await axios.get(`${this.baseUrl}/api/states/${entityId}`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error(`Error getting Home Assistant entity ${entityId}:`, error.message);
      throw error;
    }
  }

  // Check if a boolean input/toggle is ON
  async isBooleanToggleOn(entityId) {
    try {
      const state = await this.getEntityState(entityId);
      return state.state === 'on';
    } catch (error) {
      console.error(`Error checking boolean toggle ${entityId}:`, error.message);
      return false;
    }
  }

  // Check multiple boolean toggles and return their states
  async checkBooleanToggles(entityIds) {
    const results = {};
    
    for (const entityId of entityIds) {
      try {
        results[entityId] = await this.isBooleanToggleOn(entityId);
      } catch (error) {
        console.error(`Failed to check toggle ${entityId}:`, error.message);
        results[entityId] = false;
      }
    }

    return results;
  }

  // Check location tracking toggles (the 3 specific ones you mentioned)
  async checkLocationTrackingToggles() {
    const locationToggles = [
      process.env.HOME_ASSISTANT_LOCATION_TOGGLE_1 || 'input_boolean.location_toggle_1',
      process.env.HOME_ASSISTANT_LOCATION_TOGGLE_2 || 'input_boolean.location_toggle_2', 
      process.env.HOME_ASSISTANT_LOCATION_TOGGLE_3 || 'input_boolean.location_toggle_3'
    ];

    const toggleStates = await this.checkBooleanToggles(locationToggles);
    
    const allOn = Object.values(toggleStates).every(state => state === true);
    const summary = Object.entries(toggleStates).map(([entityId, state]) => 
      `${entityId}: ${state ? 'ON' : 'OFF'}`
    ).join(', ');

    return {
      all_toggles_on: allOn,
      toggle_states: toggleStates,
      summary: summary,
      checked_at: new Date().toISOString()
    };
  }

  // Health check for Home Assistant connection
  async healthCheck() {
    if (!this.isConfigured()) {
      return {
        status: 'not_configured',
        configured: false,
        message: 'Missing HOME_ASSISTANT_URL or HOME_ASSISTANT_TOKEN'
      };
    }

    try {
      const response = await axios.get(`${this.baseUrl}/api/`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        status: 'healthy',
        configured: true,
        connected: true,
        message: response.data.message || 'Connected',
        version: response.data.version
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        configured: true,
        connected: false,
        error: error.message
      };
    }
  }

  // Get all available entities (useful for debugging/setup)
  async getAllEntities() {
    if (!this.isConfigured()) {
      throw new Error('Home Assistant not configured');
    }

    try {
      const response = await axios.get(`${this.baseUrl}/api/states`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error getting Home Assistant entities:', error.message);
      throw error;
    }
  }

  // Get only input_boolean entities (toggles)
  async getBooleanInputs() {
    try {
      const allEntities = await this.getAllEntities();
      return allEntities.filter(entity => entity.entity_id.startsWith('input_boolean.'));
    } catch (error) {
      console.error('Error getting boolean inputs:', error.message);
      return [];
    }
  }
}

module.exports = new HomeAssistantService();