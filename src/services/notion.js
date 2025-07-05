const { Client } = require('@notionhq/client');

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

// Database IDs from your Notion workspace
const DATABASES = {
  WORKOUTS: '227e3d1e-e83a-8031-a938-e62cedf82f83',
  BONUSES: '227e3d1e-e83a-80a4-949b-c62e6fc0c1d0',
  BALANCES: '227e3d1e-e83a-8098-b2f0-f0652bf21e24',
  DEBT_CONTRACTS: '227e3d1e-e83a-80b9-b1c3-ef4e6aafcc3e',
  PUNISHMENTS: '227e3d1e-e83a-8065-8d2e-f64bed599adf',
  MORNING_CHECKINS: '223e3d1e-e83a-808c-b94f-d2901d63b1cb'
};

class NotionService {
  // Get today's workouts
  async getTodaysWorkouts(date) {
    const response = await notion.databases.query({
      database_id: DATABASES.WORKOUTS,
      filter: {
        property: 'Date',
        date: {
          equals: date
        }
      }
    });
    return response.results;
  }

  // Get active debt contracts
  async getActiveDebts() {
    const response = await notion.databases.query({
      database_id: DATABASES.DEBT_CONTRACTS,
      filter: {
        property: 'Status',
        select: {
          equals: 'active'
        }
      }
    });
    return response.results;
  }

  // Get pending cardio assignments
  async getPendingPunishments() {
    const response = await notion.databases.query({
      database_id: DATABASES.PUNISHMENTS,
      filter: {
        property: 'Status',
        select: {
          equals: 'pending'
        }
      }
    });
    return response.results;
  }

  // Get latest account balances
  async getLatestBalances(limit = 2) {
    const response = await notion.databases.query({
      database_id: DATABASES.BALANCES,
      sorts: [
        {
          property: 'Date',
          direction: 'descending'
        }
      ],
      page_size: limit
    });
    return response.results;
  }

  // Get morning check-in for specific date
  async getMorningCheckin(date) {
    const response = await notion.databases.query({
      database_id: DATABASES.MORNING_CHECKINS,
      filter: {
        property: 'Date',
        title: {
          equals: date
        }
      }
    });
    return response.results[0] || null;
  }

  // Create new bonus entry
  async createBonus(bonusData) {
    const response = await notion.pages.create({
      parent: { database_id: DATABASES.BONUSES },
      properties: {
        Name: {
          title: [{ text: { content: bonusData.name } }]
        },
        'Bonus Type': {
          select: { name: bonusData.type }
        },
        'Amount Earned': {
          number: bonusData.amount
        },
        'Week Of': {
          date: { start: bonusData.weekOf }
        },
        Status: {
          select: { name: 'pending' }
        }
      }
    });
    return response;
  }

  // Create new debt contract
  async createDebt(debtData) {
    // Check if similar debt already exists today
    const existingDebts = await this.getActiveDebts();
    const today = debtData.dateAssigned;
    
    const duplicateDebt = existingDebts.find(debt => {
      const debtDate = debt.properties['Date Assigned '].date.start;
      const debtName = debt.properties.Name.title[0]?.text?.content || '';
      return debtDate === today && debtName.includes(debtData.name.split(':')[1]?.trim());
    });

    if (duplicateDebt) {
      console.log(`Debt already exists for ${debtData.name} on ${today}`);
      return duplicateDebt;
    }

    const response = await notion.pages.create({
      parent: { database_id: DATABASES.DEBT_CONTRACTS },
      properties: {
        Name: {
          title: [{ text: { content: debtData.name } }]
        },
        'Original Amount': {
          number: debtData.amount
        },
        'Current Amount': {
          number: debtData.amount
        },
        'Date Assigned ': {
          date: { start: debtData.dateAssigned }
        },
        'Interest Rate': {
          number: 0.30
        },
        Status: {
          select: { name: 'active' }
        }
      }
    });
    return response;
  }

  // Create new punishment assignment
  async createPunishment(punishmentData) {
    const response = await notion.pages.create({
      parent: { database_id: DATABASES.PUNISHMENTS },
      properties: {
        Name: {
          title: [{ text: { content: punishmentData.name } }]
        },
        Type: {
          select: { name: punishmentData.type }
        },
        'Minutes Required': {
          number: punishmentData.minutes
        },
        'Date Assigned': {
          date: { start: punishmentData.dateAssigned }
        },
        Status: {
          select: { name: 'pending' }
        }
      }
    });
    return response;
  }

  // Update debt amount
  async updateDebtAmount(debtId, newAmount) {
    const response = await notion.pages.update({
      page_id: debtId,
      properties: {
        'Current Amount': {
          number: newAmount
        }
      }
    });
    return response;
  }

  // Update debt status (e.g., mark as paid)
  async updateDebtStatus(debtId, status) {
    const response = await notion.pages.update({
      page_id: debtId,
      properties: {
        Status: {
          select: { name: status }
        }
      }
    });
    return response;
  }

  // Update punishment status
  async updatePunishmentStatus(punishmentId, status, completedDate = null) {
    const properties = {
      Status: {
        select: { name: status }
      }
    };

    if (completedDate) {
      properties['Date Completed'] = {
        date: { start: completedDate }
      };
    }

    const response = await notion.pages.update({
      page_id: punishmentId,
      properties
    });
    return response;
  }
}

module.exports = new NotionService();