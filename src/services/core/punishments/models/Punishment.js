class Punishment {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.type = data.type;
    this.minutes = data.minutes;
    this.dateAssigned = data.dateAssigned;
    this.dueDate = data.dueDate;
    this.status = data.status;
    this.reason = data.reason;
  }

  isOverdue(currentDate) {
    return this.status === 'pending' && new Date(this.dueDate) < new Date(currentDate);
  }

  isPending() {
    return this.status === 'pending';
  }

  isCompleted() {
    return this.status === 'completed';
  }

  complete(completedDate = null) {
    this.status = 'completed';
    this.dateCompleted = completedDate || new Date().toISOString().split('T')[0];
  }

  markMissed() {
    this.status = 'missed';
  }
}

module.exports = Punishment;