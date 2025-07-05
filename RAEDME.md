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

### GET /health
Health check endpoint to verify service status and Notion connectivity.

## Environment Variables

- `NOTION_TOKEN` - Your Notion integration token
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

## How It Works

The reconciliation service performs these steps daily:

1. **Apply Interest** - Add 30% daily compound interest to active debts
2. **Check Punishments** - Mark overdue assignments as missed, create $50 debts
3. **Process Violations** - Check for new violations, assign cardio punishments
4. **Calculate Uber Earnings** - Compare Account B balance changes
5. **Pay Debts** - Apply Uber earnings to oldest debts first (FIFO)
6. **Award Bonuses** - Grant workout bonuses and Uber match bonuses
7. **Generate Summary** - Create human-readable results

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