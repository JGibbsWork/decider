const notionClient = require('../../../integrations/notion/client');
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
      reason: props['Reason']?.rich_text?.[0]?.text?.content,
      // New 3-route system properties
      route: props['Route']?.rich_text?.[0]?.text?.content,
      violationCount: props['Violation Count']?.number,
      weekStart: props['Week Start']?.date?.start,
      weekEnd: props['Week End']?.date?.start,
      punishmentCategory: props['Punishment Category']?.select?.name,
      escalationLevel: props['Escalation Level']?.number,
      // Route 2 specific
      savingsRateOriginal: props['Savings Rate Original']?.number,
      savingsRateNew: props['Savings Rate New']?.number,
      savingsIncrease: props['Savings Increase']?.number,
      // Route 3 specific
      earningsRequirementOriginal: props['Earnings Requirement Original']?.number,
      earningsRequirementNew: props['Earnings Requirement New']?.number,
      earningsIncrease: props['Earnings Increase']?.number,
      targetWeekStart: props['Target Week Start']?.date?.start,
      targetWeekEnd: props['Target Week End']?.date?.start,
      applicationPeriod: props['Application Period']?.select?.name
    });
  }

  mapToProperties(data) {
    const properties = {
      'Name': { title: [{ text: { content: data.name }}]},
      'Type': { select: { name: data.type }},
      'Minutes': { number: data.minutes },
      'Date Assigned': { date: { start: data.dateAssigned }},
      'Due Date': { date: { start: data.dueDate }},
      'Status': { select: { name: 'pending' }},
      'Reason': { rich_text: [{ text: { content: data.reason || '' }}]}
    };

    // Add 3-route system properties if they exist
    if (data.route) {
      properties['Route'] = { rich_text: [{ text: { content: data.route }}]};
    }
    if (data.violationCount !== undefined) {
      properties['Violation Count'] = { number: data.violationCount };
    }
    if (data.weekStart) {
      properties['Week Start'] = { date: { start: data.weekStart }};
    }
    if (data.weekEnd) {
      properties['Week End'] = { date: { start: data.weekEnd }};
    }
    if (data.punishmentCategory) {
      properties['Punishment Category'] = { select: { name: data.punishmentCategory }};
    }
    if (data.escalationLevel !== undefined) {
      properties['Escalation Level'] = { number: data.escalationLevel };
    }

    // Route 2 specific properties
    if (data.savingsRateOriginal !== undefined) {
      properties['Savings Rate Original'] = { number: data.savingsRateOriginal };
    }
    if (data.savingsRateNew !== undefined) {
      properties['Savings Rate New'] = { number: data.savingsRateNew };
    }
    if (data.savingsIncrease !== undefined) {
      properties['Savings Increase'] = { number: data.savingsIncrease };
    }

    // Route 3 specific properties
    if (data.earningsRequirementOriginal !== undefined) {
      properties['Earnings Requirement Original'] = { number: data.earningsRequirementOriginal };
    }
    if (data.earningsRequirementNew !== undefined) {
      properties['Earnings Requirement New'] = { number: data.earningsRequirementNew };
    }
    if (data.earningsIncrease !== undefined) {
      properties['Earnings Increase'] = { number: data.earningsIncrease };
    }
    if (data.targetWeekStart) {
      properties['Target Week Start'] = { date: { start: data.targetWeekStart }};
    }
    if (data.targetWeekEnd) {
      properties['Target Week End'] = { date: { start: data.targetWeekEnd }};
    }
    if (data.applicationPeriod) {
      properties['Application Period'] = { select: { name: data.applicationPeriod }};
    }

    return properties;
  }
}

module.exports = new PunishmentRepository();