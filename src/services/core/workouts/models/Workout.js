class Workout {
  constructor(data) {
    this.id = data.id;
    this.date = data.date;
    this.type = data.type;
    this.duration = data.duration;
    this.calories = data.calories;
    this.source = data.source;
    this.notes = data.notes;
  }

  isYoga() {
    return this.type === 'Yoga';
  }

  isLifting() {
    return this.type === 'Lifting';
  }

  isCardio() {
    return this.type === 'Cardio';
  }

  isValidForBonus() {
    // Business logic for what qualifies for bonus
    return this.isYoga() || this.isLifting();
  }

  getDurationInMinutes() {
    // Handle different duration formats if needed
    if (typeof this.duration === 'number') {
      return this.duration;
    }
    // Could parse duration string like "45 min" -> 45
    return parseInt(this.duration) || 0;
  }
}

module.exports = Workout;