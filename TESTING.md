# Habit Tracking Flow Validation

This document explains how to validate the complete habit tracking integration before connecting to the Discord bot.

## Quick Health Check

Start with a basic health check to ensure all services are accessible:

```bash
curl http://localhost:3005/test/integration-health
```

This validates:
- ✅ Habits Service database connection
- ✅ Uber Earnings Service database connection  
- ✅ Location Tracking Service database connection
- ✅ Punishment Service functionality

## Individual Service Validation

Test each service independently:

### Habits Service Only
```bash
curl http://localhost:3005/test/habits-service
```

### Uber Earnings Service Only
```bash
curl http://localhost:3005/test/uber-earnings
```

### Location Tracking Service Only
```bash
curl http://localhost:3005/test/location-tracking
```

## Complete Flow Validation

⚠️ **WARNING**: This creates real test data in your Notion databases!

```bash
curl -X POST http://localhost:3005/test/complete-flow
```

This comprehensive test:

1. **Creates a test week** in Weekly Habits database
2. **Adds sample data** to all supporting databases:
   - Uber Earnings: 7 days of earnings ($20-70/day)
   - Location Tracking: Varied office/cowork/gym patterns
   - Job Applications: 3-4 applications per day
   - Workouts: Mix of yoga and lifting sessions
3. **Runs weekly reconciliation** and validates habit counting
4. **Tests punishment assignment** for different violation scenarios
5. **Validates daily reconciliation** response includes habit progress
6. **Checks data integrity** across all integrations

### Expected Results

The validation should return:
```json
{
  "success": true,
  "validation_results": {
    "steps": [
      {"step": "Setup test week", "success": true},
      {"step": "Create sample data", "success": true},
      {"step": "Weekly reconciliation", "success": true},
      {"step": "Punishment scenarios", "success": true},
      {"step": "Daily reconciliation response", "success": true},
      {"step": "Data integrity validation", "success": true}
    ],
    "summary": {
      "completionRate": 100,
      "overallSuccess": true
    }
  }
}
```

## Individual Component Testing

### Test Sample Data Creation Only
```bash
curl -X POST http://localhost:3005/test/sample-data \
  -H "Content-Type: application/json" \
  -d '{"weekStart": "2024-01-15", "weekEnd": "2024-01-21"}'
```

### Test Punishment Scenarios Only
```bash
curl -X POST http://localhost:3005/test/punishment-scenarios
```

This tests all 3-route punishment assignments:
- 1 violation → Route 1 (cardio only)
- 2 violations → Route 1 + Route 2 (cardio + savings increase)
- 3 violations → Route 1 + Route 2 + Route 3 (cardio + savings + earnings increase)

### Test Daily Reconciliation Response
```bash
curl http://localhost:3005/test/daily-reconciliation-response
```

Validates that daily reconciliation includes habit progress data for Discord bot.

### Test Discord Bot Data Structure
```bash
curl http://localhost:3005/test/discord-bot-data
```

Simulates the exact data structure that would be sent to the Discord bot.

## Expected Habit Counts

With the test data, you should see approximately:

- **Yoga Sessions**: 4 (Monday, Wednesday, Friday, Sunday)
- **Lifting Sessions**: 3 (Tuesday, Thursday, Saturday)  
- **Job Applications**: ~20-25 (3-4 per day)
- **Office Days**: 3 (Monday, Wednesday, Friday)
- **Cowork Days**: 1 (Tuesday)
- **Gym Days**: 2 (Wednesday, Saturday)
- **Uber Earnings**: ~$280-350 total for the week

## Troubleshooting

### Database Connection Issues
If health checks fail, verify:
1. Environment variables are set correctly in `.env`
2. Notion integration has access to all databases
3. Database IDs match your actual Notion databases

### Sample Data Creation Fails
Common issues:
- Missing database properties
- Incorrect property types in Notion
- Insufficient Notion API permissions

### Punishment Assignment Issues
Check:
- Punishments database has all required properties
- 3-route system properties are created
- Property types match expectations (number, date, select, etc.)

### Weekly Reconciliation Fails
Verify:
- All services can access their respective databases
- Date ranges are calculated correctly
- Notion formulas in Weekly Habits database are working

## Manual Cleanup

⚠️ **Important**: Test data is not automatically cleaned up to prevent accidental data loss.

After testing, manually delete test entries from:
- Weekly Habits database (entries with "Test" in the name)
- Uber Earnings database (entries with Source = "Test Data")
- Location Tracking database (entries with "Test Location" names)
- Job Applications database (companies starting with "Test Company")
- Punishments database (test punishment entries)

## Discord Bot Integration

Once all validations pass, the Discord bot can safely call:
- `POST /reconcile` - Daily reconciliation with habit progress
- `POST /reconcile/weekly` - Weekly reconciliation with punishment assignment
- `GET /habits/current-week` - Current week habit status
- `GET /habits/summary` - Weekly progress summary

The habit progress data will be included in the daily reconciliation response under the `habits` key, providing the Discord bot with all necessary information for progress updates and accountability messaging.