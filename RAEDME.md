### POST /reconcile
Runs the complete daily reconciliation process.

**Request Body (optional):**
```json
{
  "date": "2025-07-05"
}
```

**Response:**
```json
{
  # Decider Service

The decision engine for the LLM accountability system. Handles daily reconciliation, debt management, bonus calculations, and punishment assignments.

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your Notion integration token
   ```

3. **Start the service**
   ```bash
   # Development mode (with auto-restart)
   npm run dev
   
   # Production mode
   npm start
   ```

## API Endpoints

### POST /reconcile
Runs the complete daily reconciliation process.

**Response:**
```json
{
  "success": true,
  "type": "daily",
  "results": {
    "date": "2025-07-05",
    "debt_updates": [...],
    "new_bonuses": [...],
    "new_punishments": [...],
    "completed_punishments": [...],
    "debt_payments_made": [...],
    "new_debt_assigned": [...],
    "uber_earnings_processed": 25,
    "total_bonus_amount": 15,
    "summary": "Today's bonuses total $15. Your $25 Uber earnings paid debt."
  }
}
```

### POST /reconcile/weekly
Runs the weekly reconciliation process for end-of-week bonuses and violations.

**Request Body (optional):**
```json
{
  "week_start": "2025-06-30"
}
```

**Response:**
```json
{
  "success": true,
  "type": "weekly",
  "results": {
    "week_start": "2025-06-30",
    "week_end": "2025-07-06", 
    "weekly_bonuses": [...],
    "weekly_violations": [...],
    "weekly_punishments": [...],
    "habitica_updates": [...],
    "summary": "Earned $100 in weekly bonuses. 1 weekly violation detected."
  }
}
```

### GET /health
Health check endpoint to verify service status and Notion connectivity.

## Environment Variables

- `NOTION_TOKEN` - Your Notion integration token
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

## How It Works

### Daily Reconciliation (`POST /reconcile`)
The daily reconciliation service performs these steps:

1. **Apply Interest** - Add 30% daily compound interest to active debts
2. **Check Punishments** - Mark overdue assignments as missed, create $50 debts
3. **Process Violations** - Check for new violations, assign cardio punishments
4. **Calculate Uber Earnings** - Compare Account B balance changes
5. **Pay Debts** - Apply Uber earnings to oldest debts first (FIFO)
6. **Award Bonuses** - Grant per-occurrence bonuses (lifting, yoga, Uber match)
7. **Create Habitica Todos** - Add punishment cardio tasks
8. **Generate Summary** - Create human-readable results

### Weekly Reconciliation (`POST /reconcile/weekly`)  
The weekly reconciliation service performs these steps:

1. **Award Base Allowance** - $50 weekly allowance if not already given
2. **Check Workout Performance** - Count yoga/lifting sessions for the week  
3. **Award Weekly Bonuses** - Perfect week, job applications, AlgoExpert, etc.
4. **Check Weekly Violations** - Missed yoga minimum, office attendance, etc.
5. **Assign Weekly Punishments** - Create cardio assignments for violations
6. **Update Habitica Habits** - Score weekly habit performance
7. **Generate Summary** - Weekly performance overview

## Notion Database Dependencies

The service expects these databases in your Notion workspace:

- **workout** - Exercise tracking
- **bonuses** - Reward tracking  
- **balances** - Account balance history
- **debt contracts** - Active debt management
- **punishments** - Cardio assignment tracking
- **Morning Check In** - Daily check-in logs

## Development

```bash
# Install dev dependencies
npm install

# Run with auto-restart
npm run dev

# Run tests (when implemented)
npm test
```

## Integration

This service is designed to be called by a Discord bot:

```javascript
// Discord bot integration example
const response = await fetch('http://localhost:3000/reconcile', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
});

const { results } = await response.json();
// Format results.summary for Discord message
```