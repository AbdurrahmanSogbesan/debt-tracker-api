export interface AuthUser {
  supabaseUid: string;
  email: string;
  /** null until POST /user creates the row, which is the only route that allows it. */
  userId: number | null;
}
