const axios = require('axios');

class StravaService {
  constructor() {
    this.clientId = process.env.STRAVA_CLIENT_ID;
    this.clientSecret = process.env.STRAVA_CLIENT_SECRET;
    this.accessToken = process.env.STRAVA_ACCESS_TOKEN;
    this.refreshToken = process.env.STRAVA_REFRESH_TOKEN;
    this.baseUrl = 'https://www.strava.com/api/v3';
  }

  isConfigured() {
    return !!(this.clientId && this.clientSecret && this.accessToken);
  }

  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await axios.post('https://www.strava.com/oauth/token', {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token'
      });

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;
      
      return response.data;
    } catch (error) {
      console.error('Failed to refresh Strava token:', error.response?.data || error.message);
      throw error;
    }
  }

  updateTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    console.log('✅ Strava tokens updated in memory');
  }

  async makeRequest(endpoint, params = {}) {
    if (!this.isConfigured()) {
      throw new Error('Strava not configured - missing required environment variables');
    }

    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`
        },
        params
      });
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        // Token expired, try to refresh
        await this.refreshAccessToken();
        // Retry request
        const response = await axios.get(`${this.baseUrl}${endpoint}`, {
          headers: {
            Authorization: `Bearer ${this.accessToken}`
          },
          params
        });
        return response.data;
      }
      throw error;
    }
  }

  async getTodaysActivities() {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const activities = await this.makeRequest('/athlete/activities', {
      after: Math.floor(startOfDay.getTime() / 1000),
      before: Math.floor(endOfDay.getTime() / 1000)
    });

    return activities.map(activity => this.mapToWorkout(activity));
  }

  async getActivitiesForDate(date) {
    const targetDate = new Date(date);
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const activities = await this.makeRequest('/athlete/activities', {
      after: Math.floor(startOfDay.getTime() / 1000),
      before: Math.floor(endOfDay.getTime() / 1000)
    });

    return activities.map(activity => this.mapToWorkout(activity));
  }

  async getActivitiesInDateRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1); // Include end date

    const activities = await this.makeRequest('/athlete/activities', {
      after: Math.floor(start.getTime() / 1000),
      before: Math.floor(end.getTime() / 1000),
      per_page: 200 // Increased limit for date ranges
    });

    return activities.map(activity => this.mapToWorkout(activity));
  }

  mapToWorkout(stravaActivity) {
    return {
      id: `strava_${stravaActivity.id}`,
      date: stravaActivity.start_date_local.split('T')[0],
      type: this.mapActivityType(stravaActivity.type),
      duration: Math.round(stravaActivity.moving_time / 60), // Convert to minutes
      calories: stravaActivity.calories || null,
      source: 'Strava',
      notes: `${stravaActivity.name} - Distance: ${(stravaActivity.distance / 1000).toFixed(2)}km`
    };
  }

  mapActivityType(stravaType) {
    const typeMapping = {
      'Yoga': 'Yoga',
      'WeightTraining': 'Lifting',
      'Workout': 'Lifting', // Generic workout often lifting
      'Run': 'Cardio',
      'Ride': 'Cardio',
      'Swim': 'Cardio',
      'Walk': 'Cardio',
      'Hike': 'Cardio',
      'Elliptical': 'Cardio',
      'StairStepper': 'Cardio',
      'Rowing': 'Cardio'
    };

    return typeMapping[stravaType] || 'Other';
  }

  async getAthleteInfo() {
    return await this.makeRequest('/athlete');
  }

  async testConnection() {
    try {
      const athlete = await this.getAthleteInfo();
      
      // Test if we can read activities (the main permission we need)
      try {
        await this.makeRequest('/athlete/activities', { per_page: 1 });
        return {
          connected: true,
          can_read_activities: true,
          athlete: {
            id: athlete.id,
            firstname: athlete.firstname,
            lastname: athlete.lastname
          }
        };
      } catch (activityError) {
        // Can connect to athlete but can't read activities
        return {
          connected: true,
          can_read_activities: false,
          needs_reauth: true,
          athlete: {
            id: athlete.id,
            firstname: athlete.firstname,
            lastname: athlete.lastname
          },
          error: activityError.message
        };
      }
    } catch (error) {
      return {
        connected: false,
        can_read_activities: false,
        error: error.message
      };
    }
  }
}

module.exports = new StravaService();