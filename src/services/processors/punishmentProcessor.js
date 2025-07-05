// Create new file: src/services/processors/punishmentProcessor.js

const { format } = require('date-fns');
const notionService = require('../notion');
const punishmentService = require('../punishments');
const debtService = require('../debt');

class PunishmentProcessor {

  // Check for overdue punishments and create debt
  async processOverduePunishments(date) {
    try {
      console.log(`Checking for overdue punishments as of ${date}...`);
      
      const overduePunishments = await punishmentService.checkOverduePunishments(date);
      const results = [];

      for (const overdue of overduePunishments) {
        // Mark punishment as missed
        await notionService.updatePunishmentStatus(overdue.id, 'Missed');
        
        // Create debt for missed punishment
        const debtAmount = 50; // Could be configurable via rules
        const newDebt = await debtService.createViolationDebt(
          `Missed punishment: ${overdue.name}`,
          debtAmount
        );

        results.push({
          punishment_id: overdue.id,
          name: overdue.name,
          debt_created: newDebt,
          debt_amount: debtAmount
        });

        console.log(`Marked punishment as missed and created $${debtAmount} debt: ${overdue.name}`);
      }

      return results;

    } catch (error) {
      console.error('Error processing overdue punishments:', error);
      return [];
    }
  }

  // Check if today's punishments were completed
  async processPunishmentCompletions(date) {
    try {
      console.log(`Checking punishment completions for ${date}...`);
      
      const completedPunishments = await punishmentService.checkTodaysPunishmentCompletion(date);
      
      for (const completed of completedPunishments) {
        console.log(`Punishment completed: ${completed.name}`);
      }

      return completedPunishments;

    } catch (error) {
      console.error('Error processing punishment completions:', error);
      return [];
    }
  }

  // Check for new daily violations and assign punishments
  async processNewViolations(date) {
    try {
      console.log(`Checking for new violations on ${date}...`);
      
      const violations = await punishmentService.checkForViolations(date);
      
      if (violations.length === 0) {
        console.log('No violations found');
        return [];
      }

      console.log(`Found ${violations.length} violation(s), assigning punishments...`);
      const newPunishments = await punishmentService.processViolations(violations);

      return newPunishments;

    } catch (error) {
      console.error('Error processing new violations:', error);
      return [];
    }
  }

  // Get punishment summary for a date
  async getPunishmentSummary(date = null) {
    try {
      const targetDate = date || format(new Date(), 'yyyy-MM-dd');
      
      const summary = {
        date: targetDate,
        pending_punishments: 0,
        overdue_punishments: 0,
        completed_today: 0,
        total_pending_minutes: 0
      };

      // Get all pending punishments
      const pendingPunishments = await notionService.getPendingPunishments();
      summary.pending_punishments = pendingPunishments.length;
      
      // Calculate overdue count
      summary.overdue_punishments = pendingPunishments.filter(punishment => {
        const dueDate = punishment.properties['Due Date'].date?.start;
        return dueDate && new Date(dueDate) < new Date(targetDate);
      }).length;

      // Calculate total pending minutes
      summary.total_pending_minutes = pendingPunishments.reduce((sum, punishment) => {
        return sum + (punishment.properties['Minutes'].number || 0);
      }, 0);

      // Get completed punishments for today
      const completedToday = await punishmentService.checkTodaysPunishmentCompletion(targetDate);
      summary.completed_today = completedToday.length;

      return summary;

    } catch (error) {
      console.error('Error getting punishment summary:', error);
      return null;
    }
  }

  // Process complete punishment workflow for a date
  async processAllPunishments(date) {
    try {
      const results = {
        date: date,
        overdue_processed: [],
        completions_processed: [],
        new_violations: [],
        summary: {
          total_overdue: 0,
          total_completed: 0,
          total_new_punishments: 0,
          debt_created: 0
        }
      };

      // Process overdue punishments first
      results.overdue_processed = await this.processOverduePunishments(date);
      results.summary.total_overdue = results.overdue_processed.length;
      results.summary.debt_created = results.overdue_processed.reduce((sum, overdue) => {
        return sum + (overdue.debt_amount || 0);
      }, 0);

      // Check punishment completions
      results.completions_processed = await this.processPunishmentCompletions(date);
      results.summary.total_completed = results.completions_processed.length;

      // Process new violations
      results.new_violations = await this.processNewViolations(date);
      results.summary.total_new_punishments = results.new_violations.length;

      console.log(`Punishment processing complete for ${date}: ${results.summary.total_overdue} overdue, ${results.summary.total_completed} completed, ${results.summary.total_new_punishments} new`);

      return results;

    } catch (error) {
      console.error('Error in punishment workflow:', error);
      throw error;
    }
  }

}

module.exports = new PunishmentProcessor();