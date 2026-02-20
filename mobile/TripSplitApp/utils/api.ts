// utils/api.ts
import { Trip, Expense, User } from "../types";
import * as SecureStore from "expo-secure-store";

// ==================== CONFIG ====================

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
if (!API_BASE_URL) {
  throw new Error("Missing EXPO_PUBLIC_API_URL (API_BASE_URL). Check your .env and Expo config.");
}

const TOKEN_KEY = "token";

// ==================== AUTH TOKEN MANAGEMENT ====================

let authToken: string | null = null;

/** Set in-memory token (used by apiCall). */
export function setAuthToken(token: string) {
  authToken = token;
}

/** Clear in-memory token. */
export function clearAuthToken() {
  authToken = null;
}

/** Persist token to secure storage. */
export async function saveToken(token: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  setAuthToken(token);
}

/** Read token from secure storage. */
export async function getToken() {
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

/** Delete token from secure storage. */
export async function deleteToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  clearAuthToken();
}

/**
 * Call this once on app startup (e.g., in root layout) to re-hydrate authToken.
 * Example:
 *   useEffect(() => { initAuth(); }, []);
 */
export async function initAuth() {
  const t = await getToken();
  if (t) setAuthToken(t);
  return t;
}

/**
 * Ensure we have a token in memory (loads from SecureStore if needed).
 * apiCall uses this automatically, so you rarely need to call it yourself.
 */
async function ensureAuthToken() {
  if (authToken) return authToken;
  const t = await getToken();
  if (t) authToken = t;
  return authToken;
}

// ==================== CORE API CALL ====================

function hasHeader(headers: HeadersInit, key: string) {
  const lower = key.toLowerCase();

  if (headers instanceof Headers) {
    return headers.has(key);
  }

  if (Array.isArray(headers)) {
    return headers.some(([k]) => String(k).toLowerCase() === lower);
  }

  return Object.keys(headers).some((k) => k.toLowerCase() === lower);
}

function setHeader(headers: HeadersInit, key: string, value: string): HeadersInit {
  if (headers instanceof Headers) {
    headers.set(key, value);
    return headers;
  }

  if (Array.isArray(headers)) {
    const lower = key.toLowerCase();
    const filtered = headers.filter(([k]) => String(k).toLowerCase() !== lower);
    filtered.push([key, value]);
    return filtered;
  }

  return { ...(headers as Record<string, string>), [key]: value };
}

async function apiCall<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  // Start with caller headers
  let headers: HeadersInit = options.headers ?? {};

  // Only set JSON header if caller didn't set something else (like multipart/form-data)
  if (!hasHeader(headers, "Content-Type")) {
    headers = setHeader(headers, "Content-Type", "application/json");
  }

  // Always attach auth if available
  const token = await ensureAuthToken();
  if (token && !hasHeader(headers, "Authorization")) {
    headers = setHeader(headers, "Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (err: any) {
    throw new Error(`Network error: ${err?.message || "Failed to reach server"} (${url})`);
  }

  // Handle 204 No Content
  if (response.status === 204) return null as T;

  const rawText = await response.text();
  const contentType = response.headers.get("content-type") || "";

  let data: any = null;
  if (rawText) {
    if (contentType.includes("application/json")) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = { error: rawText };
      }
    } else {
      data = rawText;
    }
  }

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && (data.error || data.details || data.message)) ||
      (typeof data === "string" ? data : null) ||
      `HTTP ${response.status}`;

    console.log("API ERROR:", response.status, endpoint, data);
    throw new Error(message);
  }

  return data as T;
}

// ==================== AUTH ====================

export async function register(email: string, username: string, password: string): Promise<User> {
  return apiCall<User>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, username, password }),
  });
}

export async function login(
  email: string,
  password: string
): Promise<{ token: string; user: User }> {
  const data = await apiCall<{ token: string; user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  if (data?.token) {
    await saveToken(data.token);
  }

  return data;
}

export async function logout(): Promise<void> {
  await deleteToken();
}

// ==================== RECEIPT OCR ====================

export async function submitReceiptOcr(tripId: string, rawText: string) {
  return apiCall(`/trips/${tripId}/receipt/ocr`, {
    method: "POST",
    body: JSON.stringify({ rawText }),
  });
}

// ==================== TRIPS ====================

export async function fetchTrips(): Promise<Trip[]> {
  const trips = await apiCall<any[]>("/trips");

  return trips.map((trip: any) => ({
    id: trip.id,
    name: trip.name,
    // keep these in Trip shape for UI, but backend may not store location
    location: trip.location ?? null,
    startDate: trip.startDate ?? null,
    endDate: trip.endDate ?? null,
    status: trip.status ?? "planning",
    people: trip.members?.map((m: any) => m.user?.username || "Unknown") || [],
    members: trip.members || [],
    expenses: [],
    createdAt: new Date(trip.createdAt),
    totalAmount: typeof trip.totalAmount === "number" ? trip.totalAmount : 0,
    expenseCount: typeof trip.expenseCount === "number" ? trip.expenseCount : 0,
    userBalance: typeof trip.userBalance === "number" ? trip.userBalance : 0,
  }));
}

export async function fetchTrip(tripId: string): Promise<Trip | null> {
  try {
    const trip = await apiCall<any>(`/trips/${tripId}`);

    return {
      id: trip.id,
      name: trip.name,
      location: trip.location ?? null,
      startDate: trip.startDate ?? null,
      endDate: trip.endDate ?? null,
      status: trip.status ?? "planning",
      people: trip.members?.map((m: any) => m.user?.username || "Unknown") || [],
      members: trip.members || [],
      expenses:
        trip.expenses?.map((exp: any) => ({
          id: exp.id,
          name: exp.title,
          paidBy: exp.paidBy?.username || "Unknown",
          amount: parseFloat(exp.amount),
          tag: "Other",
          settled: false,
          createdAt: new Date(exp.createdAt),
        })) || [],
      payments: trip.payments || [],
      createdAt: new Date(trip.createdAt),
      totalAmount: typeof trip.totalAmount === "number" ? trip.totalAmount : 0,
      expenseCount: typeof trip.expenseCount === "number" ? trip.expenseCount : 0,
      paymentCount: typeof trip.paymentCount === "number" ? trip.paymentCount : 0,
      userBalance: typeof trip.userBalance === "number" ? trip.userBalance : 0,
      balances: trip.balances || {},
    };
  } catch (error) {
    console.error("Error fetching trip:", error);
    return null;
  }
}

export type TripBalances = {
  tripId: string;
  userBalance: number;
  balances: { userId: string; username: string; balance: number }[];
  settlements: {
    from: { userId: string; username: string };
    to: { userId: string; username: string };
    amount: number;
  }[];
  totalSettled: number;
  paymentCount: number;
};

export async function fetchTripBalances(tripId: string): Promise<TripBalances | null> {
  try {
    return await apiCall<TripBalances>(`/trips/${tripId}/balances`);
  } catch (error) {
    console.error("Error fetching trip balances:", error);
    return null;
  }
}

// IMPORTANT: backend Prisma does NOT accept `location`
// so we remove it from CreateTripData and NEVER send it.
export type TripStatus = "planning" | "active" | "completed" | "cancelled";

export type CreateTripData = {
  name: string;
  startDate?: string;
  endDate?: string;
  status?: TripStatus;
};

export async function createTrip(data: CreateTripData | string): Promise<Trip> {
  const body = typeof data === "string" ? { name: data } : data;

  const payload: any = {
    name: body.name,
    status: body.status ?? "planning",
  };

  if (body.startDate) payload.startDate = body.startDate;
  if (body.endDate) payload.endDate = body.endDate;

  return apiCall<Trip>("/trips", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type UpdateTripData = {
  name?: string;
  startDate?: string | null;
  endDate?: string | null;
  status?: TripStatus;
};

export async function updateTrip(tripId: string, data: UpdateTripData): Promise<Trip> {
  const payload: any = {};
  if (typeof data.name !== "undefined") payload.name = data.name;
  if (typeof data.startDate !== "undefined") payload.startDate = data.startDate;
  if (typeof data.endDate !== "undefined") payload.endDate = data.endDate;
  if (typeof data.status !== "undefined") payload.status = data.status;

  return apiCall<Trip>(`/trips/${tripId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/** Convenience for Edit Trip feature: cancel a trip (status = cancelled). */
export async function cancelTrip(tripId: string): Promise<Trip> {
  return updateTrip(tripId, { status: "cancelled" });
}

/** Trip cancelled stats (client-side): returns counts by status, including cancelled. */
export type TripStatusStats = {
  planning: number;
  active: number;
  completed: number;
  cancelled: number;
  total: number;
};

export function calcTripStatusStats(trips: Trip[]): TripStatusStats {
  const stats: TripStatusStats = {
    planning: 0,
    active: 0,
    completed: 0,
    cancelled: 0,
    total: 0,
  };

  for (const t of trips) {
    const s = (t.status ?? "planning") as TripStatus;
    if (s in stats) (stats as any)[s] += 1;
    stats.total += 1;
  }

  return stats;
}

/** If you want “stats from server list”, call this. */
export async function fetchTripStatusStats(): Promise<TripStatusStats> {
  const trips = await fetchTrips();
  return calcTripStatusStats(trips);
}

export async function addTripMember(tripId: string, username: string): Promise<any> {
  return apiCall(`/trips/${tripId}/members`, {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}

// ==================== EXPENSES ====================

export async function fetchExpenses(tripId: string): Promise<Expense[]> {
  const expenses = await apiCall<any[]>(`/trips/${tripId}/expenses`);

  return expenses.map((exp: any) => ({
    id: exp.id,
    name: exp.title,
    paidBy: exp.paidBy?.username || "Unknown",
    amount: parseFloat(exp.amount),
    tag: "Other",
    settled: false,
    items:
      exp.splits?.map((split: any) => ({
        label: exp.title,
        price: parseFloat(split.share),
        assignedTo: [split.userId],
        splitMode: "custom" as const,
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
    tip?: { type: "percent" | "amount"; value: number };
    items?: { name: string; price: number; assignedUserIds: string[] }[];
  }
): Promise<any> {
  return apiCall(`/trips/${tripId}/expenses`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ==================== PAYMENTS ====================

export type Payment = {
  id: string;
  tripId: string;
  amount: number | string;
  method?: string;
  status: "pending" | "confirmed" | "declined";
  declineNote?: string;
  createdAt: string;
  fromUser: { id: string; username: string };
  toUser: { id: string; username: string };
  trip?: { id: string; name: string };
};

export async function fetchPayments(tripId: string): Promise<Payment[]> {
  return apiCall<Payment[]>(`/trips/${tripId}/payments`);
}

export type CreatePaymentData = {
  toUserId?: string;
  toUsername?: string;
  amount: number;
  method?: string;
};

export async function createPayment(tripId: string, data: CreatePaymentData): Promise<Payment> {
  return apiCall<Payment>(`/trips/${tripId}/payments`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function confirmPayment(
  paymentId: string
): Promise<{ ok: boolean; payment: Payment }> {
  return apiCall(`/payments/${paymentId}/confirm`, { method: "POST" });
}

export async function declinePayment(
  paymentId: string,
  note?: string
): Promise<{ ok: boolean; payment: Payment }> {
  return apiCall(`/payments/${paymentId}/decline`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export async function deletePayment(paymentId: string): Promise<{ ok: boolean }> {
  return apiCall(`/payments/${paymentId}`, { method: "DELETE" });
}

export async function fetchPendingPayments(): Promise<Payment[]> {
  return apiCall<Payment[]>("/payments/pending");
}

// ==================== USERS ====================

export async function searchUsers(query: string): Promise<User[]> {
  if (!query || query.length < 2) return [];
  return apiCall<User[]>(`/users/search?q=${encodeURIComponent(query)}`);
}

export async function getMe(): Promise<User> {
  return apiCall<User>("/users/me");
}

// ==================== FRIENDS ====================

export async function fetchFriends(): Promise<User[]> {
  return apiCall<User[]>("/friends");
}

export async function addFriend(username: string): Promise<{ ok: boolean; message: string }> {
  return apiCall("/friends", {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}

export async function removeFriend(friendId: string): Promise<{ ok: boolean }> {
  return apiCall(`/friends/${friendId}`, { method: "DELETE" });
}

export type FriendInvite = {
  id: string;
  status: string;
  createdAt: string;
  sender: { id: string; username: string; email: string };
};

export async function fetchFriendInvites(): Promise<FriendInvite[]> {
  return apiCall<FriendInvite[]>("/friends/invites");
}

export async function acceptFriendInvite(inviteId: string): Promise<{ ok: boolean }> {
  return apiCall(`/friends/invites/${inviteId}/accept`, { method: "POST" });
}

export async function declineFriendInvite(inviteId: string): Promise<{ ok: boolean }> {
  return apiCall(`/friends/invites/${inviteId}/decline`, { method: "POST" });
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
  return apiCall<TripInvite[]>("/invites");
}

export async function acceptInvite(inviteId: string): Promise<{ ok: boolean }> {
  return apiCall(`/invites/${inviteId}/accept`, { method: "POST" });
}

export async function declineInvite(inviteId: string): Promise<{ ok: boolean }> {
  return apiCall(`/invites/${inviteId}/decline`, { method: "POST" });
}

// ==================== ACTIVITY ====================

export type ActivityItem = {
  id: string;
  type: "expense" | "payment";
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
  return apiCall<ActivityItem[]>("/activity");
}