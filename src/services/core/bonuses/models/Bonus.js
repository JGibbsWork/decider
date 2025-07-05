class Bonus {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.type = data.type;
    this.amount = data.amount;
    this.weekOf = data.weekOf;
    this.date = data.date;
    this.reason = data.reason;
    this.status = data.status || 'pending';
  }

  isWorkoutBonus() {
    return ['Lifting', 'Yoga', 'Cardio'].includes(this.type);
  }

  isWeeklyBonus() {
    return ['Perfect Week', 'Job Applications', 'AlgoExpert', 'Office Attendance'].includes(this.type);
  }

  isFinancialBonus() {
    return ['Uber Match', 'Base Allowance'].includes(this.type);
  }

  award() {
    this.status = 'awarded';
    this.awardedDate = new Date().toISOString().split('T')[0];
  }

  isPending() {
    return this.status === 'pending';
  }

  isAwarded() {
    return this.status === 'awarded';
  }
}

module.exports = Bonus;