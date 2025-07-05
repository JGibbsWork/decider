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

  // Create a todo task for cardio punishment
  async createCardioPunishmentTodo(punishmentData) {
    try {
      const todoData = {
        text: `Cardio Punishment: ${punishmentData.type} - ${punishmentData.minutes} minutes`,
        notes: `Assigned for: ${punishmentData.reason}\nDue: ${punishmentData.due_date}`,
        type: 'todo',
        priority: 2, // Hard difficulty - makes it more impactful
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

  // Complete a cardio punishment todo
  async completeCardioPunishmentTodo(habiticaTaskId) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/tasks/${habiticaTaskId}/score/up`,
        {},
        { headers: this.headers }
      );

      console.log(`Completed Habitica todo: ${habiticaTaskId}`);
      return { success: true, result: response.data.data };
    } catch (error) {
      console.error('Failed to complete Habitica todo:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  // Delete a cardio punishment todo (if punishment is forgiven)
  async deleteCardioPunishmentTodo(habiticaTaskId) {
    try {
      const response = await axios.delete(
        `${this.apiUrl}/tasks/${habiticaTaskId}`,
        { headers: this.headers }
      );

      console.log(`Deleted Habitica todo: ${habiticaTaskId}`);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete Habitica todo:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  // Create or update habit for weekly tracking
  async createOrUpdateWeeklyHabit(habitName, description) {
    try {
      // First, check if habit already exists
      const existingHabits = await this.getHabits();
      const existingHabit = existingHabits.find(habit => habit.text === habitName);

      if (existingHabit) {
        console.log(`Habit "${habitName}" already exists`);
        return { success: true, habit_id: existingHabit.id, existed: true };
      }

      // Create new habit
      const habitData = {
        text: habitName,
        notes: description,
        type: 'habit',
        priority: 1, // Medium difficulty
        up: true,    // Can be marked as positive
        down: false  // Cannot be marked as negative (we only track completion)
      };

      const response = await axios.post(
        `${this.apiUrl}/tasks/user`,
        habitData,
        { headers: this.headers }
      );

      console.log(`Created Habitica habit: ${habitName}`);
      return {
        success: true,
        habit_id: response.data.data.id,
        existed: false
      };
    } catch (error) {
      console.error('Failed to create Habitica habit:', error.response?.data || error.message);
      return { success: false, error: error.message };
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

  // Score a habit (mark as completed)
  async scoreHabit(habitId, direction = 'up') {
    try {
      const response = await axios.post(
        `${this.apiUrl}/tasks/${habitId}/score/${direction}`,
        {},
        { headers: this.headers }
      );

      console.log(`Scored habit ${habitId} in direction: ${direction}`);
      return { success: true, result: response.data.data };
    } catch (error) {
      console.error('Failed to score Habitica habit:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  // Initialize weekly tracking habits
  async initializeWeeklyHabits() {
    const habits = [
      {
        name: 'Job Applications (Weekly)',
        description: 'Track weekly job application submissions (goal: 25+ per week)'
      },
      {
        name: 'Office Attendance (Weekly)',
        description: 'Track days worked from office (goal: 4+ days per week)'
      },
      {
        name: 'AlgoExpert Problems (Weekly)',
        description: 'Track AlgoExpert problem completion (goal: 7+ per week)'
      }
    ];

    const results = [];
    for (const habit of habits) {
      const result = await this.createOrUpdateWeeklyHabit(habit.name, habit.description);
      results.push({ habit: habit.name, ...result });
    }

    return results;
  }

  // Reset habit counters for weekly tracking (call at start of new week)
  async resetWeeklyHabitCounters() {
    try {
      const habits = await this.getHabits();
      const weeklyHabits = habits.filter(habit => 
        habit.text.includes('Weekly') && 
        (habit.text.includes('Job Applications') || 
         habit.text.includes('Office Attendance') || 
         habit.text.includes('AlgoExpert'))
      );

      const results = [];
      for (const habit of weeklyHabits) {
        // Reset counter by updating the habit
        const response = await axios.put(
          `${this.apiUrl}/tasks/${habit.id}`,
          { 
            counterUp: 0,
            counterDown: 0
          },
          { headers: this.headers }
        );

        results.push({
          habitId: habit.id,
          habitName: habit.text,
          success: true,
          previousCount: habit.counterUp || 0
        });
      }

      return results;
    } catch (error) {
      console.error('Failed to reset weekly habit counters:', error);
      return [];
    }
  }

  // Score a habit multiple times (for bulk weekly updates)
  async scoreHabitMultipleTimes(habitId, times, direction = 'up') {
    const results = [];
    
    for (let i = 0; i < times; i++) {
      const result = await this.scoreHabit(habitId, direction);
      results.push(result);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }
}

module.exports = new HabiticaService();