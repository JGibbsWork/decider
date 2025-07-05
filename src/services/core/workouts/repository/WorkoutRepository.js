const notionClient = require('../../../integrations/notion/client');
const { DATABASE_IDS } = require('../../../integrations/notion/config');
const Workout = require('../models/Workout');

class WorkoutRepository {
  constructor() {
    this.databaseId = DATABASE_IDS.WORKOUTS;
  }

  async findByDate(date) {
    const response = await notionClient.queryDatabase({
      database_id: this.databaseId,
      filter: {
        property: 'Date',
        date: { equals: date }
      }
    });
    
    return response.results.map(this.mapToModel);
  }

  async findByDateRange(startDate, endDate) {
    const response = await notionClient.findByDateRange(
      this.databaseId,
      'Date',
      startDate,
      endDate
    );
    
    return response.results.map(this.mapToModel);
  }

  async findByTypeAndDateRange(workoutType, startDate, endDate) {
    const response = await notionClient.findWithMultipleFilters(
      this.databaseId,
      [
        {
          property: 'Workout Type',
          select: { equals: workoutType }
        },
        {
          property: 'Date',
          date: { on_or_after: startDate }
        },
        {
          property: 'Date',
          date: { on_or_before: endDate }
        }
      ]
    );
    
    return response.results.map(this.mapToModel);
  }

  async findRecentWorkouts(days = 7) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await this.findByDateRange(
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );
  }

  async create(workoutData) {
    const response = await notionClient.createPage({
      parent: { database_id: this.databaseId },
      properties: this.mapToProperties(workoutData)
    });
    
    return this.mapToModel(response);
  }

  mapToModel(notionPage) {
    const props = notionPage.properties;
    return new Workout({
      id: notionPage.id,
      date: props['Date']?.date?.start,
      type: props['Workout Type']?.select?.name,
      duration: props['Duration']?.number,
      calories: props['Calories']?.number,
      source: props['Source']?.select?.name,
      notes: props['Notes']?.rich_text?.[0]?.text?.content
    });
  }

  mapToProperties(data) {
    return {
      'Date': { date: { start: data.date }},
      'Workout Type': { select: { name: data.type }},
      'Duration': { number: data.duration },
      'Calories': { number: data.calories },
      'Source': { select: { name: data.source }},
      'Notes': { rich_text: [{ text: { content: data.notes || '' }}]}
    };
  }
}

module.exports = new WorkoutRepository();