import { Trip, Expense, User } from '../types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001';

console.log('API_BASE_URL:', API_BASE_URL);

let authToken: string | null = null;

export function setAuthToken(token: string) {
  authToken = token;
}

export function clearAuthToken() {
  authToken = null;
}

async function apiCall(endpoint: string, options: RequestInit = {}) {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// ==================== AUTH ====================

export async function register(email: string, username: string, password: string): Promise<User> {
  return apiCall('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, username, password }),
  });
}

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const data = await apiCall('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (data.token) setAuthToken(data.token);
  return data;
}

// ==================== TRIPS ====================

export async function fetchTrips(): Promise<Trip[]> {
  const trips = await apiCall('/trips');

  return trips.map((trip: any) => ({
    id: trip.id,
    name: trip.name,
    location: trip.location || null,
    startDate: trip.startDate || null,
    endDate: trip.endDate || null,
    status: trip.status || 'planning',
    people: trip.members?.map((m: any) => m.user?.username || 'Unknown') || [],
    members: trip.members || [],
    expenses: [],
    createdAt: new Date(trip.createdAt),
    totalAmount: typeof trip.totalAmount === 'number' ? trip.totalAmount : 0,
    expenseCount: typeof trip.expenseCount === 'number' ? trip.expenseCount : 0,
    userBalance: typeof trip.userBalance === 'number' ? trip.userBalance : 0,
  }));
}

export async function fetchTrip(tripId: string): Promise<Trip | null> {
  try {
    const trip = await apiCall(`/trips/${tripId}`);

    return {
      id: trip.id,
      name: trip.name,
      location: trip.location || null,
      startDate: trip.startDate || null,
      endDate: trip.endDate || null,
      status: trip.status || 'planning',
      people: trip.members?.map((m: any) => m.user?.username || 'Unknown') || [],
      members: trip.members || [],
      expenses: trip.expenses?.map((exp: any) => ({
        id: exp.id,
        name: exp.title,
        paidBy: exp.paidBy?.username || 'Unknown',
        amount: parseFloat(exp.amount),
        tag: 'Other',
        settled: false,
        createdAt: new Date(exp.createdAt),
      })) || [],
      payments: trip.payments || [],
      createdAt: new Date(trip.createdAt),
      totalAmount: typeof trip.totalAmount === 'number' ? trip.totalAmount : 0,
      expenseCount: typeof trip.expenseCount === 'number' ? trip.expenseCount : 0,
      paymentCount: typeof trip.paymentCount === 'number' ? trip.paymentCount : 0,
      userBalance: typeof trip.userBalance === 'number' ? trip.userBalance : 0,
      balances: trip.balances || {},
    };
  } catch (error) {
    console.error('Error fetching trip:', error);
    return null;
  }
}

export type TripBalances = {
  tripId: string;
  userBalance: number;
  balances: { userId: string; username: string; balance: number }[];
  settlements: { from: { userId: string; username: string }; to: { userId: string; username: string }; amount: number }[];
  totalSettled: number;
  paymentCount: number;
};

export async function fetchTripBalances(tripId: string): Promise<TripBalances | null> {
  try {
    return await apiCall(`/trips/${tripId}/balances`);
  } catch (error) {
    console.error('Error fetching trip balances:', error);
    return null;
  }
}

export type CreateTripData = {
  name: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  status?: 'planning' | 'active' | 'completed';
};

export async function createTrip(data: CreateTripData | string): Promise<Trip> {
  const body = typeof data === 'string' ? { name: data } : data;

  return apiCall('/trips', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export type UpdateTripData = {
  name?: string;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: 'planning' | 'active' | 'completed';
};

export async function updateTrip(tripId: string, data: UpdateTripData): Promise<Trip> {
  return apiCall(`/trips/${tripId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function addTripMember(tripId: string, username: string): Promise<any> {
  return apiCall(`/trips/${tripId}/members`, {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}

// ==================== EXPENSES ====================

export async function fetchExpenses(tripId: string): Promise<Expense[]> {
  const expenses = await apiCall(`/trips/${tripId}/expenses`);

  return expenses.map((exp: any) => ({
    id: exp.id,
    name: exp.title,
    paidBy: exp.paidBy?.username || 'Unknown',
    amount: parseFloat(exp.amount),
    tag: 'Other',
    settled: false,
    items: exp.splits?.map((split: any) => ({
      label: exp.title,
      price: parseFloat(split.share),
      assignedTo: [split.userId],
      splitMode: 'custom' as const,
    })) || [],
    createdAt: new Date(exp.createdAt),
  }));
}

export async function createExpense(
  tripId: string,
  data: {
    title: string;
    amount?: number;
    splits?: { userId: string; share: number }[];
    tax?: number;
    tip?: { type: 'percent' | 'amount'; value: number };
    items?: { name: string; price: number; assignedUserIds: string[] }[];
  }
): Promise<any> {
  return apiCall(`/trips/${tripId}/expenses`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ==================== PAYMENTS ====================

export type Payment = {
  id: string;
  tripId: string;
  amount: number | string;
  method?: string;
  status: 'pending' | 'confirmed' | 'declined';
  declineNote?: string;
  createdAt: string;
  fromUser: { id: string; username: string };
  toUser: { id: string; username: string };
  trip?: { id: string; name: string };
};

export async function fetchPayments(tripId: string): Promise<Payment[]> {
  return apiCall(`/trips/${tripId}/payments`);
}

export type CreatePaymentData = {
  toUserId?: string;
  toUsername?: string;
  amount: number;
  method?: string;
};

export async function createPayment(tripId: string, data: CreatePaymentData): Promise<Payment> {
  return apiCall(`/trips/${tripId}/payments`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function confirmPayment(paymentId: string): Promise<{ ok: boolean; payment: Payment }> {
  return apiCall(`/payments/${paymentId}/confirm`, { method: 'POST' });
}

export async function declinePayment(paymentId: string, note?: string): Promise<{ ok: boolean; payment: Payment }> {
  return apiCall(`/payments/${paymentId}/decline`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

export async function deletePayment(paymentId: string): Promise<{ ok: boolean }> {
  return apiCall(`/payments/${paymentId}`, { method: 'DELETE' });
}

export async function fetchPendingPayments(): Promise<Payment[]> {
  return apiCall('/payments/pending');
}

// ==================== USERS ====================

export async function searchUsers(query: string): Promise<User[]> {
  if (!query || query.length < 2) return [];
  return apiCall(`/users/search?q=${encodeURIComponent(query)}`);
}

export async function getMe(): Promise<User> {
  return apiCall('/users/me');
}

// ==================== FRIENDS ====================

export async function fetchFriends(): Promise<User[]> {
  return apiCall('/friends');
}

export async function addFriend(username: string): Promise<{ ok: boolean; message: string }> {
  return apiCall('/friends', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}

export async function removeFriend(friendId: string): Promise<{ ok: boolean }> {
  return apiCall(`/friends/${friendId}`, { method: 'DELETE' });
}

export type FriendInvite = {
  id: string;
  status: string;
  createdAt: string;
  sender: { id: string; username: string; email: string };
};

export async function fetchFriendInvites(): Promise<FriendInvite[]> {
  return apiCall('/friends/invites');
}

export async function acceptFriendInvite(inviteId: string): Promise<{ ok: boolean }> {
  return apiCall(`/friends/invites/${inviteId}/accept`, { method: 'POST' });
}

export async function declineFriendInvite(inviteId: string): Promise<{ ok: boolean }> {
  return apiCall(`/friends/invites/${inviteId}/decline`, { method: 'POST' });
}

// ==================== TRIP INVITES ====================

export type TripInvite = {
  id: string;
  tripId: string;
  status: string;
  createdAt: string;
  trip: { id: string; name: string };
  inviter: { id: string; username: string };
};

export async function fetchInvites(): Promise<TripInvite[]> {
  return apiCall('/invites');
}

export async function acceptInvite(inviteId: string): Promise<{ ok: boolean }> {
  return apiCall(`/invites/${inviteId}/accept`, { method: 'POST' });
}

export async function declineInvite(inviteId: string): Promise<{ ok: boolean }> {
  return apiCall(`/invites/${inviteId}/decline`, { method: 'POST' });
}

// ==================== ACTIVITY ====================

export type ActivityItem = {
  id: string;
  type: 'expense' | 'payment';
  tripId: string;
  tripName: string;
  title: string;
  amount: string;
  paidBy?: string;
  fromUserId?: string;
  fromUser?: string;
  toUserId?: string;
  toUser?: string;
  method?: string;
  status?: string;
  createdAt: string;
};

export async function fetchActivity(): Promise<ActivityItem[]> {
  return apiCall('/activity');
}