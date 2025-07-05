const { format, subDays, subWeeks, startOfWeek, endOfWeek } = require('date-fns');
const notionService = require('./notion');

class HistoryService {
  
  // Get daily reconciliation history
  async getDailyHistory(days = 30) {
    try {
      const endDate = new Date();
      const startDate = subDays(endDate, days);
      
      const history = {
        period: {
          start: format(startDate, 'yyyy-MM-dd'),
          end: format(endDate, 'yyyy-MM-dd'),
          days: days
        },
        summary: {},
        daily_breakdown: []
      };

      // Get bonuses for the period
      const bonuses = await this.getBonusesForPeriod(history.period.start, history.period.end);
      
      // Get punishments for the period  
      const punishments = await this.getPunishmentsForPeriod(history.period.start, history.period.end);
      
      // Get debts created in the period
      const debts = await this.getDebtsForPeriod(history.period.start, history.period.end);
      
      // Get workouts for the period
      const workouts = await this.getWorkoutsForPeriod(history.period.start, history.period.end);

      // Generate daily breakdown
      history.daily_breakdown = this.generateDailyBreakdown(
        history.period.start, 
        history.period.end, 
        bonuses, 
        punishments, 
        debts, 
        workouts
      );

      // Generate summary statistics
      history.summary = this.generateDailySummary(bonuses, punishments, debts, workouts, days);

      return history;

    } catch (error) {
      console.error('Error getting daily history:', error);
      throw error;
    }
  }

  // Get weekly reconciliation history
  async getWeeklyHistory(weeks = 12) {
    try {
      const endDate = endOfWeek(new Date());
      const startDate = startOfWeek(subWeeks(endDate, weeks));
      
      const history = {
        period: {
          start: format(startDate, 'yyyy-MM-dd'),
          end: format(endDate, 'yyyy-MM-dd'),
          weeks: weeks
        },
        summary: {},
        weekly_breakdown: []
      };

      // Get weekly bonuses
      const weeklyBonuses = await this.getWeeklyBonuses(history.period.start, history.period.end);
      
      // Get workout performance by week
      const weeklyWorkouts = await this.getWeeklyWorkoutBreakdown(history.period.start, history.period.end);

      // Generate weekly breakdown
      history.weekly_breakdown = this.generateWeeklyBreakdown(
        history.period.start,
        history.period.end,
        weeklyBonuses,
        weeklyWorkouts
      );

      // Generate summary statistics
      history.summary = this.generateWeeklySummary(weeklyBonuses, weeklyWorkouts, weeks);

      return history;

    } catch (error) {
      console.error('Error getting weekly history:', error);
      throw error;
    }
  }

  // Get bonuses for a date range
  async getBonusesForPeriod(startDate, endDate) {
    try {
      const response = await notionService.notion.databases.query({
        database_id: '227e3d1e-e83a-80a4-949b-c62e6fc0c1d0', // BONUSES
        filter: {
          and: [
            {
              property: 'Week Of',
              date: {
                on_or_after: startDate
              }
            },
            {
              property: 'Week Of',
              date: {
                on_or_before: endDate
              }
            }
          ]
        },
        sorts: [
          {
            property: 'Week Of',
            direction: 'ascending'
          }
        ]
      });

      return response.results.map(bonus => ({
        id: bonus.id,
        name: bonus.properties.Name.title[0]?.text?.content || 'Unnamed',
        type: bonus.properties['Bonus Type'].select?.name || 'Unknown',
        amount: bonus.properties['Amount Earned'].number || 0,
        week_of: bonus.properties['Week Of'].date?.start || null,
        status: bonus.properties.Status.select?.name || 'pending'
      }));

    } catch (error) {
      console.error('Error getting bonuses for period:', error);
      return [];
    }
  }

  // Get punishments for a date range
  async getPunishmentsForPeriod(startDate, endDate) {
    try {
      const response = await notionService.notion.databases.query({
        database_id: '227e3d1e-e83a-8065-8d2e-f64bed599adf', // PUNISHMENTS
        filter: {
          and: [
            {
              property: 'Date Assigned',
              date: {
                on_or_after: startDate
              }
            },
            {
              property: 'Date Assigned',
              date: {
                on_or_before: endDate
              }
            }
          ]
        },
        sorts: [
          {
            property: 'Date Assigned',
            direction: 'ascending'
          }
        ]
      });

      return response.results.map(punishment => ({
        id: punishment.id,
        name: punishment.properties.Name.title[0]?.text?.content || 'Unnamed',
        type: punishment.properties.Type.select?.name || 'Unknown',
        minutes: punishment.properties['Minutes Required'].number || 0,
        assigned_date: punishment.properties['Date Assigned'].date?.start || null,
        due_date: punishment.properties['Due Date']?.date?.start || null,
        completed_date: punishment.properties['Date Completed']?.date?.start || null,
        status: punishment.properties.Status.select?.name || 'pending'
      }));

    } catch (error) {
      console.error('Error getting punishments for period:', error);
      return [];
    }
  }

  // Get debts created in a date range
  async getDebtsForPeriod(startDate, endDate) {
    try {
      const response = await notionService.notion.databases.query({
        database_id: '227e3d1e-e83a-80b9-b1c3-ef4e6aafcc3e', // DEBT_CONTRACTS
        filter: {
          and: [
            {
              property: 'Date Assigned ',
              date: {
                on_or_after: startDate
              }
            },
            {
              property: 'Date Assigned ',
              date: {
                on_or_before: endDate
              }
            }
          ]
        },
        sorts: [
          {
            property: 'Date Assigned ',
            direction: 'ascending'
          }
        ]
      });

      return response.results.map(debt => ({
        id: debt.id,
        name: debt.properties.Name.title[0]?.text?.content || 'Unnamed',
        original_amount: debt.properties['Original Amount'].number || 0,
        current_amount: debt.properties['Current Amount'].number || 0,
        assigned_date: debt.properties['Date Assigned '].date?.start || null,
        status: debt.properties.Status.select?.name || 'active'
      }));

    } catch (error) {
      console.error('Error getting debts for period:', error);
      return [];
    }
  }

  // Get workouts for a date range
  async getWorkoutsForPeriod(startDate, endDate) {
    try {
      const response = await notionService.notion.databases.query({
        database_id: '227e3d1e-e83a-8031-a938-e62cedf82f83', // WORKOUTS
        filter: {
          and: [
            {
              property: 'Date',
              date: {
                on_or_after: startDate
              }
            },
            {
              property: 'Date',
              date: {
                on_or_before: endDate
              }
            }
          ]
        },
        sorts: [
          {
            property: 'Date',
            direction: 'ascending'
          }
        ]
      });

      return response.results.map(workout => ({
        id: workout.id,
        name: workout.properties.Name.title[0]?.text?.content || 'Unnamed',
        type: workout.properties['Workout Type'].select?.name || 'Unknown',
        duration: workout.properties.Duration.number || 0,
        calories: workout.properties.Calories.number || 0,
        date: workout.properties.Date.date?.start || null,
        source: workout.properties.Source.select?.name || 'manual'
      }));

    } catch (error) {
      console.error('Error getting workouts for period:', error);
      return [];
    }
  }

  // Generate daily breakdown
  generateDailyBreakdown(startDate, endDate, bonuses, punishments, debts, workouts) {
    const breakdown = [];
    const currentDate = new Date(startDate);
    const end = new Date(endDate);

    while (currentDate <= end) {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      
      const dayData = {
        date: dateStr,
        bonuses: bonuses.filter(b => b.week_of === dateStr || this.getDateFromWeekOf(b.week_of) === dateStr),
        punishments: punishments.filter(p => p.assigned_date === dateStr),
        debts: debts.filter(d => d.assigned_date === dateStr),
        workouts: workouts.filter(w => w.date === dateStr),
        total_bonuses: 0,
        total_punishment_minutes: 0,
        total_debt: 0
      };

      // Calculate totals
      dayData.total_bonuses = dayData.bonuses.reduce((sum, b) => sum + b.amount, 0);
      dayData.total_punishment_minutes = dayData.punishments.reduce((sum, p) => sum + p.minutes, 0);
      dayData.total_debt = dayData.debts.reduce((sum, d) => sum + d.original_amount, 0);

      breakdown.push(dayData);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return breakdown;
  }

  // Generate daily summary statistics
  generateDailySummary(bonuses, punishments, debts, workouts, days) {
    return {
      total_bonuses: bonuses.reduce((sum, b) => sum + b.amount, 0),
      average_daily_bonuses: bonuses.reduce((sum, b) => sum + b.amount, 0) / days,
      total_punishments: punishments.length,
      total_punishment_minutes: punishments.reduce((sum, p) => sum + p.minutes, 0),
      punishment_completion_rate: this.calculateCompletionRate(punishments),
      total_debt_assigned: debts.reduce((sum, d) => sum + d.original_amount, 0),
      total_workouts: workouts.length,
      average_daily_workouts: workouts.length / days,
      workout_breakdown: this.getWorkoutTypeBreakdown(workouts),
      most_common_punishment_reason: this.getMostCommonPunishmentReason(punishments),
      best_day: this.getBestDay(bonuses),
      worst_day: this.getWorstDay(debts, punishments)
    };
  }

  // Helper methods
  calculateCompletionRate(punishments) {
    if (punishments.length === 0) return 100;
    const completed = punishments.filter(p => p.status === 'completed').length;
    return Math.round((completed / punishments.length) * 100);
  }

  getWorkoutTypeBreakdown(workouts) {
    const breakdown = {};
    workouts.forEach(w => {
      breakdown[w.type] = (breakdown[w.type] || 0) + 1;
    });
    return breakdown;
  }

  getMostCommonPunishmentReason(punishments) {
    const reasons = {};
    punishments.forEach(p => {
      const reason = p.name.split(' - ')[0] || 'Unknown';
      reasons[reason] = (reasons[reason] || 0) + 1;
    });
    
    return Object.keys(reasons).reduce((a, b) => reasons[a] > reasons[b] ? a : b, 'None');
  }

  getBestDay(bonuses) {
    const dailyTotals = {};
    bonuses.forEach(b => {
      const date = this.getDateFromWeekOf(b.week_of);
      dailyTotals[date] = (dailyTotals[date] || 0) + b.amount;
    });
    
    return Object.keys(dailyTotals).reduce((a, b) => dailyTotals[a] > dailyTotals[b] ? a : b, null);
  }

  getWorstDay(debts, punishments) {
    const dailyBadness = {};
    
    debts.forEach(d => {
      dailyBadness[d.assigned_date] = (dailyBadness[d.assigned_date] || 0) + d.original_amount;
    });
    
    punishments.forEach(p => {
      dailyBadness[p.assigned_date] = (dailyBadness[p.assigned_date] || 0) + p.minutes;
    });
    
    return Object.keys(dailyBadness).reduce((a, b) => dailyBadness[a] > dailyBadness[b] ? a : b, null);
  }

  getDateFromWeekOf(weekOf) {
    // Simple helper - assumes weekOf is the date the bonus was earned
    return weekOf;
  }

  // Generate weekly breakdown and summary (simplified for now)
  generateWeeklyBreakdown(startDate, endDate, bonuses, workouts) {
    // TODO: Implement weekly breakdown logic
    return [];
  }

  generateWeeklySummary(bonuses, workouts, weeks) {
    // TODO: Implement weekly summary logic
    return {
      total_weekly_bonuses: bonuses.length,
      average_weekly_bonuses: bonuses.length / weeks
    };
  }

  // Get weekly workout breakdown (helper for weekly history)
  async getWeeklyWorkoutBreakdown(startDate, endDate) {
    // TODO: Implement weekly workout breakdown
    return [];
  }

  async getWeeklyBonuses(startDate, endDate) {
    // Get bonuses that are specifically weekly type
    const bonuses = await this.getBonusesForPeriod(startDate, endDate);
    return bonuses.filter(b => 
      ['Perfect Week', 'Job Applications', 'AlgoExpert', 'Office Attendance'].includes(b.type)
    );
  }
}

module.exports = new HistoryService();