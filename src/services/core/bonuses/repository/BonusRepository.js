const notionClient = require('../../../integrations/notion');
const Bonus = require('../models/Bonus');

class BonusRepository {
  constructor() {
    this.databaseId = process.env.BONUSES_DATABASE_ID;
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

  async findByWeek(weekOf) {
    const response = await notionClient.queryDatabase({
      database_id: this.databaseId,
      filter: {
        property: 'Week Of',
        date: { equals: weekOf }
      }
    });
    
    return response.results.map(this.mapToModel);
  }

  async findPendingBonuses() {
    const response = await notionClient.queryDatabase({
      database_id: this.databaseId,
      filter: {
        property: 'Status',
        select: { equals: 'pending' }
      }
    });
    
    return response.results.map(this.mapToModel);
  }

  async create(bonusData) {
    const response = await notionClient.createPage({
      parent: { database_id: this.databaseId },
      properties: this.mapToProperties(bonusData)
    });
    
    return this.mapToModel(response);
  }

  async createMany(bonusDataArray) {
    const createdBonuses = [];
    for (const bonusData of bonusDataArray) {
      const bonus = await this.create(bonusData);
      createdBonuses.push(bonus);
    }
    return createdBonuses;
  }

  async updateStatus(id, status) {
    await notionClient.updatePage({
      page_id: id,
      properties: {
        'Status': { select: { name: status }}
      }
    });
  }

  mapToModel(notionPage) {
    const props = notionPage.properties;
    return new Bonus({
      id: notionPage.id,
      name: props['Name']?.title?.[0]?.text?.content,
      type: props['Bonus Type']?.select?.name,
      amount: props['Amount']?.number,
      weekOf: props['Week Of']?.date?.start,
      date: props['Date']?.date?.start,
      reason: props['Reason']?.rich_text?.[0]?.text?.content,
      status: props['Status']?.select?.name
    });
  }

  mapToProperties(data) {
    return {
      'Name': { title: [{ text: { content: data.name }}]},
      'Bonus Type': { select: { name: data.type }},
      'Amount': { number: data.amount },
      'Week Of': { date: { start: data.weekOf }},
      'Date': { date: { start: data.date }},
      'Reason': { rich_text: [{ text: { content: data.reason || '' }}]},
      'Status': { select: { name: 'pending' }}
    };
  }
}

module.exports = new BonusRepository();