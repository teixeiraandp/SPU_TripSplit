/*
export interface User {
  id: string;
  email: string;
  username: string;
  createdAt?: Date;
}

export interface Trip {
  id: string;
  name: string;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status: 'planning' | 'active' | 'completed';
  people: string[];
  expenses: Expense[];
  createdAt?: Date;
  totalAmount?: number;
  expenseCount?: number;
  userBalance?: number;
  balances?: { [userId: string]: number };
  members?: any[];
}

export interface LineItem {
  label: string;
  price: number;
  assignedTo: string[];
  splitMode: 'custom' | 'even' | 'proportional';
  proportionalBreakdown?: ProportionalBreakdown[];
}

export interface ProportionalBreakdown {
  person: string;
  amount: number;
}

export interface Expense {
  id?: string;
  name: string;
  paidBy: string;
  amount: number;
  tag: string;
  settled: boolean;
  receiptPhoto?: string;
  items?: LineItem[];
  editHistory?: EditHistoryEntry[];
  createdAt?: Date;
}

export interface EditHistoryEntry {
  action: string;
  user: string;
  date: string;
}

export interface Balance {
  [person: string]: number;
}

export interface ExpenseBreakdown {
  person: string;
  amount: number;
}

export interface Payment {
  from: string;
  to: string;
  amount: number;
  date: string;
  method: 'Venmo' | 'Zelle' | 'Cash' | 'Other';
  tripName: string;
}

export interface Notification {
  type: 'payment' | 'expense' | 'settlement';
  message: string;
  tripName: string;
  date: string;
  read: boolean;
}

export interface Friend {
  username: string;
  name: string;
  avatar: string;
}

export interface TripFilters {
  status: 'all' | 'planning' | 'active' | 'completed';
  dateRange: 'all' | 'upcoming' | 'past' | 'current';
  hasBalance: 'all' | 'owed' | 'owing' | 'settled';
}
*/

export interface User {
  id: string;
  email: string;
  username: string;
  createdAt?: Date;
}

export interface Trip {
  id: string;
  name: string;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status: 'planning' | 'active' | 'completed' | 'cancelled';
  people: string[];
  expenses: Expense[];
  createdAt?: Date;
  totalAmount?: number;
  expenseCount?: number;
  userBalance?: number;
  balances?: { [userId: string]: number };
  members?: any[];
}

export interface LineItem {
  label: string;
  price: number;
  assignedTo: string[];
  splitMode: 'custom' | 'even' | 'proportional';
  proportionalBreakdown?: ProportionalBreakdown[];
}

export interface ProportionalBreakdown {
  person: string;
  amount: number;
}

export interface Expense {
  id?: string;
  name: string;
  paidBy: string;
  amount: number;
  tag: string;
  settled: boolean;
  receiptPhoto?: string;
  items?: LineItem[];
  editHistory?: EditHistoryEntry[];
  createdAt?: Date;
}

export interface EditHistoryEntry {
  action: string;
  user: string;
  date: string;
}

export interface Balance {
  [person: string]: number;
}

export interface ExpenseBreakdown {
  person: string;
  amount: number;
}

export interface Payment {
  from: string;
  to: string;
  amount: number;
  date: string;
  method: 'Venmo' | 'Zelle' | 'Cash' | 'Other';
  tripName: string;
}

export interface Notification {
  type: 'payment' | 'expense' | 'settlement';
  message: string;
  tripName: string;
  date: string;
  read: boolean;
}

export interface Friend {
  username: string;
  name: string;
  avatar: string;
}

export interface TripFilters {
  status: 'all' | 'planning' | 'active' | 'completed' | 'cancelled';
  dateRange: 'all' | 'upcoming' | 'past' | 'current';
  hasBalance: 'all' | 'owed' | 'owing' | 'settled';
}