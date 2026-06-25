import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { AuthUser } from '@dasems/shared-types';
import { api } from '../../shared/api/client';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
}

const initialState: AuthState = {
  user: null,
  loading: false,
  error: null,
  initialized: false,
};

export const initializeAuth = createAsyncThunk('auth/initialize', async () => {
  if (!api.getAccessToken()) return null;
  return api.getMe();
});

export const login = createAsyncThunk(
  'auth/login',
  async ({ employeeId, password }: { employeeId: string; password: string }) => {
    const tokens = await api.login(employeeId, password);
    api.setTokens(tokens.accessToken, tokens.refreshToken);
    return tokens.user;
  }
);

export const logout = createAsyncThunk('auth/logout', async () => {
  await api.logout();
  api.clearTokens();
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(initializeAuth.pending, (state) => {
        state.loading = true;
      })
      .addCase(initializeAuth.fulfilled, (state, action: PayloadAction<AuthUser | null>) => {
        state.loading = false;
        state.initialized = true;
        state.user = action.payload;
      })
      .addCase(initializeAuth.rejected, (state) => {
        state.loading = false;
        state.initialized = true;
        state.user = null;
        api.clearTokens();
      })
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action: PayloadAction<AuthUser>) => {
        state.loading = false;
        state.user = action.payload;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Login failed';
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
      });
  },
});

export const { clearError } = authSlice.actions;
export default authSlice.reducer;
