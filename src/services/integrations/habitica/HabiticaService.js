const axios = require('axios');

class HabiticaService {
  constructor() {
    this.apiUrl = 'https://habitica.com/api/v3';
    this.headers = {
      'x-api-user': process.env.HABITICA_USER_ID,
      'x-api-key': process.env.HABITICA_API_TOKEN,
      'Content-Type': 'application/json'
    };
  }

  // Test API connection
  async testConnection() {
    try {
      const response = await axios.get(`${this.apiUrl}/user`, { headers: this.headers });
      return { success: true, user: response.data.data };
    } catch (error) {
      console.error('Habitica connection test failed:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  // Get all user's todos
  async getTodos() {
    try {
      const response = await axios.get(
        `${this.apiUrl}/tasks/user?type=todos`,
        { headers: this.headers }
      );
      return response.data.data;
    } catch (error) {
      console.error('Failed to get Habitica todos:', error.response?.data || error.message);
      return [];
    }
  }

  // Get all user's habits
  async getHabits() {
    try {
      const response = await axios.get(
        `${this.apiUrl}/tasks/user?type=habits`,
        { headers: this.headers }
      );
      return response.data.data;
    } catch (error) {
      console.error('Failed to get Habitica habits:', error.response?.data || error.message);
      return [];
    }
  }

  // Create punishment todo
  async createPunishmentTodo(punishmentData) {
    try {
      const todoData = {
        text: `Cardio Punishment: ${punishmentData.type} - ${punishmentData.minutes} minutes`,
        notes: `Assigned for: ${punishmentData.reason}\nDue: ${punishmentData.due_date}`,
        type: 'todo',
        priority: 2, // Hard difficulty
        date: new Date(punishmentData.due_date).toISOString()
      };

      const response = await axios.post(
        `${this.apiUrl}/tasks/user`,
        todoData,
        { headers: this.headers }
      );

      console.log(`Created Habitica todo for punishment: ${punishmentData.reason}`);
      return {
        success: true,
        habitica_task_id: response.data.data.id,
        task_data: response.data.data
      };
    } catch (error) {
      console.error('Failed to create Habitica todo:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  // Complete a todo
  async completeTodo(todoId) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/tasks/${todoId}/score/up`,
        {},
        { headers: this.headers }
      );

      console.log(`Completed Habitica todo: ${todoId}`);
      return { success: true, result: response.data.data };
    } catch (error) {
      console.error('Failed to complete Habitica todo:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  // Delete a todo
  async deleteTodo(todoId) {
    try {
      const response = await axios.delete(
        `${this.apiUrl}/tasks/${todoId}`,
        { headers: this.headers }
      );

      console.log(`Deleted Habitica todo: ${todoId}`);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete Habitica todo:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new HabiticaService();