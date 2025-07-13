const punishmentRepo = require('../repository/PunishmentRepository');
const { format, addDays } = require('date-fns');

class ThreeRoutePunishmentAssigner {
  
  // Main method to assign punishments based on weekly habit violations
  async assignWeeklyViolationPunishments(violationData) {
    const { totalViolations, violationDetails, weekStart, weekEnd, habitCounts } = violationData;
    
    console.log(`⚖️ Processing ${totalViolations} weekly violations for week ${weekStart}`);
    
    const assignments = [];
    
    // Route 1: Cardio Assignment (always assigned if violations > 0)
    if (totalViolations > 0) {
      const cardioAssignment = await this.assignRoute1Cardio(totalViolations, violationDetails, weekStart);
      assignments.push(cardioAssignment);
    }
    
    // Route 2: Savings Percentage Increase (if violations >= 2)
    if (totalViolations >= 2) {
      const savingsAssignment = await this.assignRoute2SavingsIncrease(totalViolations, weekStart, weekEnd);
      assignments.push(savingsAssignment);
    }
    
    // Route 3: Earnings Requirement Increase (if violations >= 3)
    if (totalViolations >= 3) {
      const earningsAssignment = await this.assignRoute3EarningsIncrease(totalViolations, weekStart);
      assignments.push(earningsAssignment);
    }
    
    console.log(`✅ Assigned ${assignments.length} punishments for ${totalViolations} violations`);
    
    return {
      totalViolations: totalViolations,
      assignmentsCreated: assignments.length,
      assignments: assignments,
      routes: {
        route1_cardio: totalViolations > 0,
        route2_savings: totalViolations >= 2,
        route3_earnings: totalViolations >= 3
      }
    };
  }

  // Route 1: Cardio Assignment Logic
  async assignRoute1Cardio(totalViolations, violationDetails, weekStart) {
    try {
      console.log(`🏃 Route 1: Assigning cardio punishment for ${totalViolations} violations`);
      
      // Calculate minutes: Base 30 + 15 per additional violation
      const baseMinutes = 30;
      const escalationMinutes = 15;
      const totalMinutes = baseMinutes + ((totalViolations - 1) * escalationMinutes);
      
      const assignmentDate = format(new Date(), 'yyyy-MM-dd');
      const dueDate = format(addDays(new Date(), 7), 'yyyy-MM-dd'); // Due in 7 days
      
      const cardioTypes = ['Bike', 'Treadmill', 'Stairstepper', 'Run'];
      const selectedType = cardioTypes[Math.floor(Math.random() * cardioTypes.length)];
      
      const punishment = {
        name: `Weekly Violations Cardio - Week ${weekStart}`,
        type: selectedType,
        minutes: totalMinutes,
        dateAssigned: assignmentDate,
        dueDate: dueDate,
        reason: `Weekly habit violations: ${violationDetails}`,
        route: 'Route 1: Cardio',
        violationCount: totalViolations,
        weekStart: weekStart,
        punishmentCategory: 'weekly_cardio',
        escalationLevel: Math.min(totalViolations, 5) // Cap at level 5
      };

      const createdPunishment = await punishmentRepo.create(punishment);
      
      console.log(`✅ Route 1: Assigned ${totalMinutes}min ${selectedType} cardio (due ${dueDate})`);
      
      return {
        route: 1,
        type: 'cardio',
        punishment: createdPunishment,
        details: {
          cardioType: selectedType,
          minutes: totalMinutes,
          dueDate: dueDate,
          violationCount: totalViolations
        }
      };

    } catch (error) {
      console.error('❌ Error assigning Route 1 cardio punishment:', error);
      throw error;
    }
  }

  // Route 2: Savings Percentage Increase Logic
  async assignRoute2SavingsIncrease(totalViolations, weekStart, weekEnd) {
    try {
      console.log(`💰 Route 2: Assigning savings percentage increase for ${totalViolations} violations`);
      
      // Calculate savings rate increase based on violations
      const baseSavingsRate = 50; // 50% base
      const increaseLevels = {
        2: 60, // 2 violations = 60%
        3: 70, // 3 violations = 70%
        4: 80, // 4+ violations = 80%
      };
      
      const newSavingsRate = increaseLevels[Math.min(totalViolations, 4)] || increaseLevels[4];
      const increase = newSavingsRate - baseSavingsRate;
      
      const assignmentDate = format(new Date(), 'yyyy-MM-dd');
      
      const punishment = {
        name: `Savings Rate Increase - Week ${weekStart}`,
        type: 'Savings Increase',
        minutes: 0, // Not time-based
        dateAssigned: assignmentDate,
        dueDate: weekEnd, // Applied to current week's earnings
        reason: `${totalViolations} weekly violations require increased savings rate`,
        route: 'Route 2: Savings',
        violationCount: totalViolations,
        weekStart: weekStart,
        weekEnd: weekEnd,
        punishmentCategory: 'savings_increase',
        savingsRateOriginal: baseSavingsRate,
        savingsRateNew: newSavingsRate,
        savingsIncrease: increase,
        applicationPeriod: 'current_week'
      };

      const createdPunishment = await punishmentRepo.create(punishment);
      
      console.log(`✅ Route 2: Increased savings rate from ${baseSavingsRate}% to ${newSavingsRate}% (+${increase}%)`);
      
      return {
        route: 2,
        type: 'savings_increase',
        punishment: createdPunishment,
        details: {
          originalRate: baseSavingsRate,
          newRate: newSavingsRate,
          increase: increase,
          applicationWeek: weekStart,
          violationCount: totalViolations
        }
      };

    } catch (error) {
      console.error('❌ Error assigning Route 2 savings increase:', error);
      throw error;
    }
  }

  // Route 3: Earnings Requirement Increase Logic
  async assignRoute3EarningsIncrease(totalViolations, weekStart) {
    try {
      console.log(`📈 Route 3: Assigning earnings requirement increase for ${totalViolations} violations`);
      
      // Calculate earnings requirement increase based on violations
      const baseRequirement = 100; // $100 base weekly target
      const increaseLevels = {
        3: 125, // 3 violations = $125
        4: 150, // 4 violations = $150
        5: 175, // 5+ violations = $175
      };
      
      const newRequirement = increaseLevels[Math.min(totalViolations, 5)] || increaseLevels[5];
      const increase = newRequirement - baseRequirement;
      
      // Calculate next week start date
      const currentWeekDate = new Date(weekStart);
      const nextWeekStart = format(addDays(currentWeekDate, 7), 'yyyy-MM-dd');
      const nextWeekEnd = format(addDays(currentWeekDate, 13), 'yyyy-MM-dd');
      
      const assignmentDate = format(new Date(), 'yyyy-MM-dd');
      
      const punishment = {
        name: `Earnings Requirement Increase - Week ${nextWeekStart}`,
        type: 'Earnings Increase',
        minutes: 0, // Not time-based
        dateAssigned: assignmentDate,
        dueDate: nextWeekEnd, // Applied to following week
        reason: `${totalViolations} weekly violations require increased earnings target`,
        route: 'Route 3: Earnings',
        violationCount: totalViolations,
        weekStart: weekStart, // Week that caused the violation
        targetWeekStart: nextWeekStart, // Week the requirement applies to
        targetWeekEnd: nextWeekEnd,
        punishmentCategory: 'earnings_increase',
        earningsRequirementOriginal: baseRequirement,
        earningsRequirementNew: newRequirement,
        earningsIncrease: increase,
        applicationPeriod: 'following_week'
      };

      const createdPunishment = await punishmentRepo.create(punishment);
      
      console.log(`✅ Route 3: Increased earnings requirement from $${baseRequirement} to $${newRequirement} (+$${increase}) for week ${nextWeekStart}`);
      
      return {
        route: 3,
        type: 'earnings_increase',
        punishment: createdPunishment,
        details: {
          originalRequirement: baseRequirement,
          newRequirement: newRequirement,
          increase: increase,
          applicationWeek: nextWeekStart,
          violationWeek: weekStart,
          violationCount: totalViolations
        }
      };

    } catch (error) {
      console.error('❌ Error assigning Route 3 earnings increase:', error);
      throw error;
    }
  }

  // Get active punishment adjustments for a given week
  async getActivePunishmentAdjustments(weekStart) {
    try {
      // This would query the Punishments database for active Route 2 and Route 3 punishments
      // that apply to the given week
      
      const activeSavingsAdjustments = await this.getActiveSavingsAdjustments(weekStart);
      const activeEarningsAdjustments = await this.getActiveEarningsAdjustments(weekStart);
      
      return {
        weekStart: weekStart,
        savings: activeSavingsAdjustments,
        earnings: activeEarningsAdjustments,
        hasPunishmentAdjustments: activeSavingsAdjustments.isActive || activeEarningsAdjustments.isActive
      };

    } catch (error) {
      console.error('❌ Error getting active punishment adjustments:', error);
      return {
        weekStart: weekStart,
        savings: { isActive: false, rate: 50 },
        earnings: { isActive: false, requirement: 100 },
        hasPunishmentAdjustments: false,
        error: error.message
      };
    }
  }

  // Helper: Get active savings adjustments for a week
  async getActiveSavingsAdjustments(weekStart) {
    // TODO: Query Punishments database for Route 2 punishments affecting this week
    // For now, return default
    return {
      isActive: false,
      originalRate: 50,
      adjustedRate: 50,
      increase: 0,
      punishmentId: null
    };
  }

  // Helper: Get active earnings adjustments for a week
  async getActiveEarningsAdjustments(weekStart) {
    // TODO: Query Punishments database for Route 3 punishments affecting this week
    // For now, return default
    return {
      isActive: false,
      originalRequirement: 100,
      adjustedRequirement: 100,
      increase: 0,
      punishmentId: null
    };
  }

  // Validate punishment escalation levels
  validateEscalationLevels(totalViolations) {
    return {
      violations: totalViolations,
      route1_triggered: totalViolations > 0,
      route2_triggered: totalViolations >= 2,
      route3_triggered: totalViolations >= 3,
      escalation_level: totalViolations > 5 ? 'maximum' : totalViolations.toString(),
      severity: totalViolations >= 4 ? 'severe' : totalViolations >= 2 ? 'moderate' : 'light'
    };
  }

  // Get punishment summary for reporting
  async getPunishmentSummary(assignments) {
    const summary = {
      total_assignments: assignments.length,
      routes_activated: [],
      total_cardio_minutes: 0,
      savings_adjustments: [],
      earnings_adjustments: [],
      summary_text: ''
    };

    for (const assignment of assignments) {
      summary.routes_activated.push(`Route ${assignment.route}`);
      
      if (assignment.type === 'cardio') {
        summary.total_cardio_minutes += assignment.details.minutes;
      } else if (assignment.type === 'savings_increase') {
        summary.savings_adjustments.push(assignment.details);
      } else if (assignment.type === 'earnings_increase') {
        summary.earnings_adjustments.push(assignment.details);
      }
    }

    // Generate summary text
    const parts = [];
    if (summary.total_cardio_minutes > 0) {
      parts.push(`${summary.total_cardio_minutes}min cardio`);
    }
    if (summary.savings_adjustments.length > 0) {
      const savingsAdj = summary.savings_adjustments[0];
      parts.push(`savings rate → ${savingsAdj.newRate}%`);
    }
    if (summary.earnings_adjustments.length > 0) {
      const earningsAdj = summary.earnings_adjustments[0];
      parts.push(`earnings target → $${earningsAdj.newRequirement}`);
    }

    summary.summary_text = parts.length > 0 ? parts.join(', ') : 'No punishments assigned';

    return summary;
  }
}

module.exports = new ThreeRoutePunishmentAssigner();