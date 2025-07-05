const { format, startOfWeek, endOfWeek, differenceInDays, parseISO, isValid } = require('date-fns');

class DateUtils {
  // Get today's date in YYYY-MM-DD format
  static getToday() {
    return format(new Date(), 'yyyy-MM-dd');
  }

  // Get yesterday's date in YYYY-MM-DD format
  static getYesterday() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return format(yesterday, 'yyyy-MM-dd');
  }

  // Get start of current week
  static getCurrentWeekStart() {
    return format(startOfWeek(new Date()), 'yyyy-MM-dd');
  }

  // Get end of current week
  static getCurrentWeekEnd() {
    return format(endOfWeek(new Date()), 'yyyy-MM-dd');
  }

  // Calculate compound interest
  static calculateCompoundInterest(principal, rate, days) {
    return Math.round(principal * Math.pow(1 + rate, days) * 100) / 100;
  }

  // Check if a date string is valid
  static isValidDate(dateString) {
    try {
      const parsed = parseISO(dateString);
      return isValid(parsed);
    } catch {
      return false;
    }
  }

  // Get days between two dates
  static getDaysBetween(startDate, endDate) {
    try {
      const start = typeof startDate === 'string' ? parseISO(startDate) : startDate;
      const end = typeof endDate === 'string' ? parseISO(endDate) : endDate;
      return differenceInDays(end, start);
    } catch {
      return 0;
    }
  }

  // Format date for display
  static formatForDisplay(date) {
    try {
      const dateObj = typeof date === 'string' ? parseISO(date) : date;
      return format(dateObj, 'MMM dd, yyyy');
    } catch {
      return 'Invalid date';
    }
  }

  // Check if date is today
  static isToday(date) {
    try {
      const dateObj = typeof date === 'string' ? parseISO(date) : date;
      return format(dateObj, 'yyyy-MM-dd') === this.getToday();
    } catch {
      return false;
    }
  }

  // Check if date is in the past
  static isPastDate(date) {
    try {
      const dateObj = typeof date === 'string' ? parseISO(date) : date;
      return format(dateObj, 'yyyy-MM-dd') < this.getToday();
    } catch {
      return false;
    }
  }
}

module.exports = DateUtils;