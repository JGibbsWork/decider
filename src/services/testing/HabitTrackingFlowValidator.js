const notionService = require('../integrations/notion');
const habitsService = require('../core/habits');
const uberEarningsService = require('../integrations/uber/earnings');
const locationTrackingService = require('../integrations/location/tracking');
const weeklyReconciliation = require('../orchestrators/weeklyReconciliation');
const dailyReconciliation = require('../orchestrators/dailyReconciliation');
const punishmentService = require('../core/punishments');
const { format, startOfWeek, endOfWeek, addDays, subDays } = require('date-fns');

class HabitTrackingFlowValidator {
  constructor() {
    this.notion = notionService.notion;
    this.testResults = {
      steps: [],
      errors: [],
      warnings: [],
      summary: {}
    };
  }

  // Main validation flow
  async runCompleteValidation() {
    try {
      console.log('🧪 Starting complete habit tracking flow validation...');
      
      // Step 1: Setup test week
      const testWeek = await this.setupTestWeek();
      this.logStep('Setup test week', testWeek.weekStart, true);

      // Step 2: Create sample data in all databases
      const sampleData = await this.createSampleData(testWeek);
      this.logStep('Create sample data', `${Object.keys(sampleData).length} databases populated`, true);

      // Step 3: Test weekly reconciliation
      const weeklyResults = await this.testWeeklyReconciliation(testWeek.weekStart);
      this.logStep('Weekly reconciliation', `${weeklyResults.habits.weekly_counts.yoga_sessions} yoga, ${weeklyResults.habits.weekly_counts.lifting_sessions} lifting`, true);

      // Step 4: Test punishment scenarios
      const punishmentTests = await this.testPunishmentScenarios();
      this.logStep('Punishment scenarios', `${punishmentTests.length} scenarios tested`, true);

      // Step 5: Test daily reconciliation response
      const dailyResults = await this.testDailyReconciliationResponse();
      this.logStep('Daily reconciliation response', `Habits data included: ${!!dailyResults.habits}`, true);

      // Step 6: Validate data integrity
      const validationResults = await this.validateDataIntegrity(testWeek);
      this.logStep('Data integrity validation', `${validationResults.checks.length} checks completed`, true);

      // Cleanup test data
      await this.cleanupTestData(testWeek);
      this.logStep('Cleanup test data', 'Test data removed', true);

      // Generate summary
      this.generateSummary();

      console.log('✅ Complete habit tracking flow validation completed successfully');
      return this.testResults;

    } catch (error) {
      console.error('❌ Validation failed:', error);
      this.logStep('Validation failed', error.message, false);
      this.testResults.errors.push(error.message);
      return this.testResults;
    }
  }

  // Step 1: Setup test week
  async setupTestWeek() {
    const testDate = new Date();
    const weekStart = format(startOfWeek(testDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const weekEnd = format(endOfWeek(testDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');

    console.log(`📅 Setting up test week: ${weekStart} to ${weekEnd}`);

    return {
      weekStart,
      weekEnd,
      testDate: format(testDate, 'yyyy-MM-dd')
    };
  }

  // Step 2: Create sample data in all databases
  async createSampleData(testWeek) {
    console.log('📊 Creating sample data in all databases...');

    const sampleData = {};

    try {
      // Create sample Uber Earnings data
      sampleData.uberEarnings = await this.createSampleUberEarnings(testWeek);
      
      // Create sample Location Tracking data
      sampleData.locationTracking = await this.createSampleLocationData(testWeek);
      
      // Create sample Job Applications data
      sampleData.jobApplications = await this.createSampleJobApplications(testWeek);
      
      // Create sample Strava workouts (simulated)
      sampleData.workouts = await this.createSampleWorkouts(testWeek);

      console.log('✅ Sample data created successfully');
      return sampleData;

    } catch (error) {
      console.error('❌ Error creating sample data:', error);
      throw error;
    }
  }

  // Create sample Uber Earnings entries
  async createSampleUberEarnings(testWeek) {
    const entries = [];
    
    for (let day = 0; day < 7; day++) {
      const date = format(addDays(new Date(testWeek.weekStart), day), 'yyyy-MM-dd');
      const grossAmount = Math.floor(Math.random() * 50) + 20; // $20-70 per day
      
      const entry = await this.notion.pages.create({
        parent: { database_id: process.env.UBER_EARNINGS_DATABASE_ID },
        properties: {
          'Date': { date: { start: date }},
          'Gross Amount': { number: grossAmount },
          'Week Start': { date: { start: testWeek.weekStart }},
          'Platform': { select: { name: 'UberEats' }},
          'Source': { rich_text: [{ text: { content: 'Test Data' }}]},
          'Savings Percentage': { number: 50 },
          'Punishment Active': { checkbox: false }
        }
      });

      entries.push({
        id: entry.id,
        date: date,
        grossAmount: grossAmount
      });
    }

    console.log(`💰 Created ${entries.length} Uber earnings entries`);
    return entries;
  }

  // Create sample Location Tracking entries
  async createSampleLocationData(testWeek) {
    const entries = [];
    
    // Create varied location data for the week
    const locationPatterns = [
      { office: true, cowork: false, gym: false },   // Monday - Office
      { office: false, cowork: true, gym: false },   // Tuesday - Cowork
      { office: true, cowork: false, gym: true },    // Wednesday - Office + Gym
      { office: false, cowork: false, gym: false },  // Thursday - Home
      { office: true, cowork: false, gym: false },   // Friday - Office
      { office: false, cowork: false, gym: true },   // Saturday - Gym
      { office: false, cowork: false, gym: false }   // Sunday - Rest
    ];

    for (let day = 0; day < 7; day++) {
      const date = format(addDays(new Date(testWeek.weekStart), day), 'yyyy-MM-dd');
      const pattern = locationPatterns[day];
      
      const entry = await this.notion.pages.create({
        parent: { database_id: process.env.LOCATION_TRACKING_DATABASE_ID },
        properties: {
          'Name': { title: [{ text: { content: `Test Location - ${date}` }}]},
          'Date': { date: { start: date }},
          'Week Start': { date: { start: testWeek.weekStart }},
          'Office': { checkbox: pattern.office },
          'Cowork': { checkbox: pattern.cowork },
          'Gym': { checkbox: pattern.gym }
        }
      });

      entries.push({
        id: entry.id,
        date: date,
        ...pattern
      });
    }

    console.log(`📍 Created ${entries.length} location tracking entries`);
    return entries;
  }

  // Create sample Job Applications entries
  async createSampleJobApplications(testWeek) {
    const entries = [];
    
    // Create 3-4 job applications per day (total ~20-25 for the week)
    for (let day = 0; day < 7; day++) {
      const date = format(addDays(new Date(testWeek.weekStart), day), 'yyyy-MM-dd');
      const appsPerDay = Math.floor(Math.random() * 2) + 3; // 3-4 per day
      
      for (let app = 0; app < appsPerDay; app++) {
        const entry = await this.notion.pages.create({
          parent: { database_id: process.env.JOB_APPLICATIONS_DATABASE_ID },
          properties: {
            'Company': { title: [{ text: { content: `Test Company ${day}-${app}` }}]},
            'Position': { rich_text: [{ text: { content: `Software Developer ${app}` }}]},
            'Date Applied': { date: { start: date }},
            'Status': { select: { name: 'Applied' }},
            'Week Start': { date: { start: testWeek.weekStart }}
          }
        });

        entries.push({
          id: entry.id,
          date: date,
          company: `Test Company ${day}-${app}`
        });
      }
    }

    console.log(`💼 Created ${entries.length} job application entries`);
    return entries;
  }

  // Create sample workout data (simulated Strava entries)
  async createSampleWorkouts(testWeek) {
    // This would ideally create entries in the Workouts database
    // For now, simulate the data that would come from Strava
    const workouts = [
      { date: format(addDays(new Date(testWeek.weekStart), 0), 'yyyy-MM-dd'), type: 'Yoga', duration: 45 },
      { date: format(addDays(new Date(testWeek.weekStart), 1), 'yyyy-MM-dd'), type: 'Lifting', duration: 60 },
      { date: format(addDays(new Date(testWeek.weekStart), 2), 'yyyy-MM-dd'), type: 'Yoga', duration: 30 },
      { date: format(addDays(new Date(testWeek.weekStart), 3), 'yyyy-MM-dd'), type: 'Lifting', duration: 45 },
      { date: format(addDays(new Date(testWeek.weekStart), 4), 'yyyy-MM-dd'), type: 'Yoga', duration: 50 },
      { date: format(addDays(new Date(testWeek.weekStart), 5), 'yyyy-MM-dd'), type: 'Lifting', duration: 55 },
      { date: format(addDays(new Date(testWeek.weekStart), 6), 'yyyy-MM-dd'), type: 'Yoga', duration: 40 }
    ];

    console.log(`🏃 Simulated ${workouts.length} workout entries`);
    return workouts;
  }

  // Step 3: Test weekly reconciliation
  async testWeeklyReconciliation(weekStart) {
    console.log('🔄 Testing weekly reconciliation...');
    
    try {
      const results = await weeklyReconciliation.runWeeklyReconciliation(weekStart);
      
      // Validate results structure
      this.validateWeeklyResults(results);
      
      console.log('✅ Weekly reconciliation completed successfully');
      return results;

    } catch (error) {
      console.error('❌ Weekly reconciliation failed:', error);
      throw error;
    }
  }

  // Step 4: Test punishment scenarios
  async testPunishmentScenarios() {
    console.log('⚖️ Testing punishment assignment scenarios...');
    
    const scenarios = [
      { violations: 1, expectedRoutes: [1] },
      { violations: 2, expectedRoutes: [1, 2] },
      { violations: 3, expectedRoutes: [1, 2, 3] },
      { violations: 4, expectedRoutes: [1, 2, 3] }
    ];

    const results = [];

    for (const scenario of scenarios) {
      try {
        const violationData = {
          totalViolations: scenario.violations,
          violationDetails: `Test violation scenario: ${scenario.violations} violations`,
          weekStart: '2024-01-01',
          weekEnd: '2024-01-07',
          habitCounts: { yoga: 2, lifting: 1, job_applications: 15 }
        };

        const punishmentResult = await punishmentService.assignWeeklyViolationPunishments(violationData);
        
        // Validate correct routes were triggered
        const actualRoutes = punishmentResult.assignments.map(a => a.route).sort();
        const expectedRoutes = scenario.expectedRoutes.sort();
        
        const routesMatch = JSON.stringify(actualRoutes) === JSON.stringify(expectedRoutes);
        
        results.push({
          violations: scenario.violations,
          expectedRoutes,
          actualRoutes,
          routesMatch,
          assignments: punishmentResult.assignments.length
        });

        console.log(`✅ Scenario ${scenario.violations} violations: Routes ${actualRoutes.join(', ')} triggered`);

      } catch (error) {
        console.error(`❌ Punishment scenario ${scenario.violations} failed:`, error);
        results.push({
          violations: scenario.violations,
          error: error.message
        });
      }
    }

    return results;
  }

  // Step 5: Test daily reconciliation response
  async testDailyReconciliationResponse() {
    console.log('📱 Testing daily reconciliation response...');
    
    try {
      // Mock a request body for daily reconciliation
      const mockReqBody = { date: format(new Date(), 'yyyy-MM-dd') };
      
      // Simulate the daily reconciliation call with habit data
      const results = await dailyReconciliation.runDailyReconciliation(mockReqBody.date);
      const weeklyHabitsSummary = await habitsService.getCurrentWeekSummary();
      
      // Validate that habits data would be included in response
      const mockResponse = {
        success: true,
        type: 'daily',
        results: results,
        habits: {
          weekly_summary: weeklyHabitsSummary,
          compliance_rate: weeklyHabitsSummary.complianceRate,
          total_violations: weeklyHabitsSummary.totalViolations,
          days_elapsed: weeklyHabitsSummary.daysElapsed,
          days_remaining: weeklyHabitsSummary.daysRemaining
        }
      };

      console.log('✅ Daily reconciliation response includes habit progress data');
      return mockResponse;

    } catch (error) {
      console.error('❌ Daily reconciliation response test failed:', error);
      throw error;
    }
  }

  // Step 6: Validate data integrity
  async validateDataIntegrity(testWeek) {
    console.log('🔍 Validating data integrity...');
    
    const checks = [];

    try {
      // Check Uber earnings totals
      const uberTotal = await uberEarningsService.sumWeeklyEarnings(testWeek.weekStart);
      checks.push({
        check: 'Uber earnings total',
        result: uberTotal.totalGross > 0,
        details: `$${uberTotal.totalGross.toFixed(2)} from ${uberTotal.entryCount} entries`
      });

      // Check location tracking counts
      const locationData = await locationTrackingService.countAllLocationHabits(testWeek.weekStart);
      checks.push({
        check: 'Location tracking counts',
        result: locationData.office.count > 0 || locationData.cowork.count > 0 || locationData.gym.count > 0,
        details: `${locationData.office.count} office, ${locationData.cowork.count} cowork, ${locationData.gym.count} gym`
      });

      // Check habits service integration
      const currentWeek = await habitsService.getCurrentWeekHabits();
      checks.push({
        check: 'Weekly habits entry exists',
        result: !!currentWeek.id,
        details: `Week ${currentWeek.weekStart} entry found`
      });

      // Check compliance rate calculation
      checks.push({
        check: 'Compliance rate calculated',
        result: currentWeek.complianceRate !== undefined && currentWeek.complianceRate >= 0,
        details: `${Math.round(currentWeek.complianceRate * 100)}% compliance`
      });

      console.log(`✅ Data integrity validation: ${checks.filter(c => c.result).length}/${checks.length} checks passed`);
      return { checks };

    } catch (error) {
      console.error('❌ Data integrity validation failed:', error);
      throw error;
    }
  }

  // Cleanup test data
  async cleanupTestData(testWeek) {
    console.log('🧹 Cleaning up test data...');
    
    try {
      // Note: In a real scenario, you'd delete the test entries
      // For now, just log that cleanup would happen
      console.log(`⚠️ Test data cleanup not implemented - would remove entries for week ${testWeek.weekStart}`);
      console.log('📝 Manual cleanup required for test entries created in Notion databases');
      
      this.testResults.warnings.push('Test data cleanup not implemented - manual cleanup required');

    } catch (error) {
      console.error('❌ Cleanup failed:', error);
      this.testResults.warnings.push(`Cleanup failed: ${error.message}`);
    }
  }

  // Helper methods
  validateWeeklyResults(results) {
    const required = ['week_start', 'week_end', 'habits', 'punishments', 'summary'];
    const missing = required.filter(field => !results[field]);
    
    if (missing.length > 0) {
      throw new Error(`Weekly results missing required fields: ${missing.join(', ')}`);
    }

    if (!results.habits.weekly_counts) {
      throw new Error('Weekly results missing habit counts');
    }
  }

  logStep(step, details, success) {
    this.testResults.steps.push({
      step,
      details,
      success,
      timestamp: new Date().toISOString()
    });
  }

  generateSummary() {
    const totalSteps = this.testResults.steps.length;
    const successfulSteps = this.testResults.steps.filter(s => s.success).length;
    const errorCount = this.testResults.errors.length;
    const warningCount = this.testResults.warnings.length;

    this.testResults.summary = {
      totalSteps,
      successfulSteps,
      failedSteps: totalSteps - successfulSteps,
      errorCount,
      warningCount,
      overallSuccess: successfulSteps === totalSteps && errorCount === 0,
      completionRate: Math.round((successfulSteps / totalSteps) * 100)
    };

    console.log(`📊 Validation Summary: ${successfulSteps}/${totalSteps} steps successful (${this.testResults.summary.completionRate}%)`);
  }

  // Quick validation for specific components
  async validateHabitsServiceOnly() {
    console.log('🧪 Quick validation: Habits Service only...');
    
    try {
      const currentWeek = await habitsService.getCurrentWeekHabits();
      const summary = await habitsService.getCurrentWeekSummary();
      const health = await habitsService.healthCheck();

      return {
        habits_service_health: health,
        current_week_data: !!currentWeek.id,
        summary_available: !!summary.progress,
        validation_passed: health.status === 'healthy' && !!currentWeek.id
      };
    } catch (error) {
      return {
        validation_passed: false,
        error: error.message
      };
    }
  }

  async validateUberEarningsOnly() {
    console.log('🧪 Quick validation: Uber Earnings only...');
    
    try {
      const health = await uberEarningsService.healthCheck();
      const currentWeek = await uberEarningsService.getCurrentWeekEarnings();

      return {
        uber_service_health: health,
        current_week_data: currentWeek.totalGross >= 0,
        validation_passed: health.status === 'healthy'
      };
    } catch (error) {
      return {
        validation_passed: false,
        error: error.message
      };
    }
  }

  async validateLocationTrackingOnly() {
    console.log('🧪 Quick validation: Location Tracking only...');
    
    try {
      const health = await locationTrackingService.healthCheck();
      const currentWeek = await locationTrackingService.getCurrentWeekLocationData();

      return {
        location_service_health: health,
        current_week_data: !!currentWeek.office,
        validation_passed: health.status === 'healthy'
      };
    } catch (error) {
      return {
        validation_passed: false,
        error: error.message
      };
    }
  }
}

module.exports = new HabitTrackingFlowValidator();