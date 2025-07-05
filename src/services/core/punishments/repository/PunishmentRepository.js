const notionClient = require('../../../integrations/notion');
const Punishment = require('../models/Punishment');

class PunishmentRepository {
  constructor() {
    this.databaseId = process.env.PUNISHMENTS_DATABASE_ID;
  }

  async findPending() {
    const response = await notionClient.queryDatabase({
      database_id: this.databaseId,
      filter: {
        property: 'Status',
        select: { equals: 'pending' }
      }
    });
    
    return response.results.map(this.mapToModel);
  }

  async findOverdue(currentDate) {
    const pending = await this.findPending();
    return pending.filter(punishment => punishment.isOverdue(currentDate));
  }

  async findCompletedOnDate(date) {
    const response = await notionClient.queryDatabase({
      database_id: this.databaseId,
      filter: {
        and: [
          { property: 'Status', select: { equals: 'completed' }},
          { property: 'Date Completed', date: { equals: date }}
        ]
      }
    });
    
    return response.results.map(this.mapToModel);
  }

  async create(punishmentData) {
    const response = await notionClient.createPage({
      parent: { database_id: this.databaseId },
      properties: this.mapToProperties(punishmentData)
    });
    
    return this.mapToModel(response);
  }

  async updateStatus(id, status, completedDate = null) {
    const properties = {
      'Status': { select: { name: status }}
    };
    
    if (completedDate) {
      properties['Date Completed'] = { date: { start: completedDate }};
    }

    await notionClient.updatePage({
      page_id: id,
      properties
    });
  }

  mapToModel(notionPage) {
    const props = notionPage.properties;
    return new Punishment({
      id: notionPage.id,
      name: props['Name']?.title?.[0]?.text?.content,
      type: props['Type']?.select?.name,
      minutes: props['Minutes']?.number,
      dateAssigned: props['Date Assigned']?.date?.start,
      dueDate: props['Due Date']?.date?.start,
      status: props['Status']?.select?.name,
      reason: props['Reason']?.rich_text?.[0]?.text?.content
    });
  }

  mapToProperties(data) {
    return {
      'Name': { title: [{ text: { content: data.name }}]},
      'Type': { select: { name: data.type }},
      'Minutes': { number: data.minutes },
      'Date Assigned': { date: { start: data.dateAssigned }},
      'Due Date': { date: { start: data.dueDate }},
      'Status': { select: { name: 'pending' }},
      'Reason': { rich_text: [{ text: { content: data.reason || '' }}]}
    };
  }
}

module.exports = new PunishmentRepository();