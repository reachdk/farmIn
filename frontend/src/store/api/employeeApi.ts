import { apiSlice } from './apiSlice';

export interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email?: string;
  role: 'employee' | 'manager' | 'admin';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
}

export interface CreateEmployeeRequest {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email?: string;
  role?: 'employee' | 'manager' | 'admin';
}

export interface UpdateEmployeeRequest {
  id: string;
  employeeNumber?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: 'employee' | 'manager' | 'admin';
  isActive?: boolean;
}

export interface BulkEmployeeOperation {
  operation: 'activate' | 'deactivate' | 'delete' | 'updateRole';
  employeeIds: string[];
  newRole?: 'employee' | 'manager' | 'admin';
}

export interface EmployeeFilter {
  search?: string;
  role?: 'employee' | 'manager' | 'admin';
  isActive?: boolean;
  sortBy?: 'firstName' | 'lastName' | 'employeeNumber' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface EmployeeListResponse {
  employees: Employee[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const employeeApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Get all employees with filtering and pagination
    getEmployees: builder.query<EmployeeListResponse, EmployeeFilter>({
      query: (filters) => {
        const params = new URLSearchParams();
        
        if (filters.search) params.append('search', filters.search);
        if (filters.role) params.append('role', filters.role);
        if (filters.isActive !== undefined) params.append('isActive', filters.isActive.toString());
        if (filters.sortBy) params.append('sortBy', filters.sortBy);
        if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);
        if (filters.page) params.append('page', filters.page.toString());
        if (filters.limit) params.append('limit', filters.limit.toString());
        
        return `/admin/employees?${params.toString()}`;
      },
      providesTags: ['Employees'],
    }),

    // Get single employee by ID
    getEmployee: builder.query<Employee, string>({
      query: (id) => `/admin/employees/${id}`,
      providesTags: (result, error, id) => [{ type: 'Employee', id }],
    }),

    // Get employee by RFID card
    getEmployeeByCard: builder.query<Employee, string>({
      query: (cardId) => `/employees/by-card/${cardId}`,
      providesTags: (result, error, cardId) => [
        { type: 'Employee', id: result?.id },
        { type: 'Employee', id: 'CARD_' + cardId }
      ],
    }),

    // Create new employee
    createEmployee: builder.mutation<Employee, CreateEmployeeRequest>({
      query: (data) => ({
        url: '/admin/employees',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Employees'],
    }),

    // Update existing employee
    updateEmployee: builder.mutation<Employee, UpdateEmployeeRequest>({
      query: ({ id, ...data }) => ({
        url: `/admin/employees/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [
        'Employees',
        { type: 'Employee', id },
      ],
    }),

    // Delete employee (soft delete - sets isActive to false)
    deleteEmployee: builder.mutation<void, string>({
      query: (id) => ({
        url: `/admin/employees/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, id) => [
        'Employees',
        { type: 'Employee', id },
      ],
    }),

    // Bulk operations on multiple employees
    bulkEmployeeOperation: builder.mutation<{ success: number; failed: number }, BulkEmployeeOperation>({
      query: (data) => ({
        url: '/admin/employees/bulk',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Employees'],
    }),

    // Check if employee number is available
    checkEmployeeNumber: builder.query<{ available: boolean }, string>({
      query: (employeeNumber) => `/admin/employees/check-number/${employeeNumber}`,
    }),

    // Get employee statistics
    getEmployeeStats: builder.query<{
      total: number;
      active: number;
      inactive: number;
      byRole: { employee: number; manager: number; admin: number };
    }, void>({
      query: () => '/admin/employees/stats',
      providesTags: ['Employees'],
    }),
  }),
});

export const {
  useGetEmployeesQuery,
  useGetEmployeeQuery,
  useGetEmployeeByCardQuery,
  useCreateEmployeeMutation,
  useUpdateEmployeeMutation,
  useDeleteEmployeeMutation,
  useBulkEmployeeOperationMutation,
  useCheckEmployeeNumberQuery,
  useGetEmployeeStatsQuery,
} = employeeApi;