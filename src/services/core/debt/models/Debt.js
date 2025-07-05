// src/services/core/debt/models/Debt.js

const { differenceInDays } = require('date-fns');

class Debt {
  constructor(notionPage) {
    this.id = notionPage.id;
    this.properties = notionPage.properties;
  }

  // Getters for common properties
  get name() {
    return this.properties.Name.title[0]?.text?.content || 'Unnamed debt';
  }

  get originalAmount() {
    return this.properties['Original Amount'].number || 0;
  }

  get currentAmount() {
    return this.properties['Current Amount'].number || 0;
  }

  get assignedDate() {
    return this.properties['Date Assigned '].date?.start;
  }

  get interestRate() {
    return this.properties['Interest Rate'].number || 0.30;
  }

  get status() {
    return this.properties.Status.select?.name || 'active';
  }

  // Calculated properties
  get daysOutstanding() {
    if (!this.assignedDate) return 0;
    return differenceInDays(new Date(), new Date(this.assignedDate));
  }

  get totalInterestAccrued() {
    return Math.round((this.currentAmount - this.originalAmount) * 100) / 100;
  }

  get isActive() {
    return this.status === 'active' && this.currentAmount > 0;
  }

  get isPaid() {
    return this.status === 'paid' || this.currentAmount <= 0;
  }

  get isOverdue() {
    return this.daysOutstanding > 3; // After 3 days, debt is considered overdue
  }

  get isCritical() {
    return this.daysOutstanding > 14; // After 2 weeks, debt is critical
  }

  // Business logic methods
  applyInterest() {
    if (!this.isActive) return this.currentAmount;
    
    const newAmount = this.currentAmount * (1 + this.interestRate);
    return Math.round(newAmount * 100) / 100;
  }

  applyPayment(paymentAmount) {
    if (!this.isActive) return 0;
    
    const actualPayment = Math.min(paymentAmount, this.currentAmount);
    const newAmount = this.currentAmount - actualPayment;
    
    return {
      payment_applied: actualPayment,
      remaining_debt: Math.max(0, newAmount),
      is_paid_off: newAmount <= 0
    };
  }

  calculateCardioBuyout(cardioMinutes) {
    const BUYOUT_RATE = 50 / 120; // $50 per 120 minutes (2 hours)
    const maxForgiveness = Math.min(cardioMinutes * BUYOUT_RATE, this.currentAmount);
    
    return {
      cardio_minutes: cardioMinutes,
      forgiveness_amount: Math.round(maxForgiveness * 100) / 100,
      remaining_debt: Math.max(0, this.currentAmount - maxForgiveness)
    };
  }

  // Validation methods
  isValidForInterest() {
    return this.isActive && this.daysOutstanding >= 1;
  }

  getUrgencyLevel() {
    if (this.isCritical) return 'critical';
    if (this.isOverdue) return 'overdue';
    if (this.daysOutstanding >= 1) return 'warning';
    return 'new';
  }

  // Display helpers
  toSummary() {
    return {
      id: this.id,
      name: this.name,
      current_amount: this.currentAmount,
      original_amount: this.originalAmount,
      days_outstanding: this.daysOutstanding,
      status: this.status,
      urgency: this.getUrgencyLevel(),
      interest_accrued: this.totalInterestAccrued
    };
  }

  toDetailedInfo() {
    return {
      ...this.toSummary(),
      assigned_date: this.assignedDate,
      interest_rate: this.interestRate,
      is_active: this.isActive,
      is_paid: this.isPaid,
      is_overdue: this.isOverdue,
      is_critical: this.isCritical
    };
  }
}

module.exports = Debt;