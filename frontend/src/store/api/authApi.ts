import { apiSlice } from './apiSlice';

interface LoginRequest {
  employeeId: string;
  password: string;
}

interface LoginResponse {
  user: {
    id: string;
    employeeId: string;
    name: string;
    role: 'employee' | 'manager' | 'admin';
  };
  token: string;
}

export const authApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
    }),
    logout: builder.mutation<void, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
    }),
    refreshToken: builder.mutation<{ token: string }, void>({
      query: () => ({
        url: '/auth/refresh',
        method: 'POST',
      }),
    }),
  }),
});

export const { useLoginMutation, useLogoutMutation, useRefreshTokenMutation } = authApi;