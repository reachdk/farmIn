import { apiSlice } from './apiSlice';

export interface TimeCategory {
  id: string;
  name: string;
  minHours: number;
  maxHours?: number;
  payMultiplier: number;
  color: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTimeCategoryRequest {
  name: string;
  minHours: number;
  maxHours?: number;
  payMultiplier?: number;
  color?: string;
}

export interface UpdateTimeCategoryRequest {
  id: string;
  name?: string;
  minHours?: number;
  maxHours?: number;
  payMultiplier?: number;
  color?: string;
  isActive?: boolean;
}

export interface TimeCategoryConflict {
  category1: TimeCategory;
  category2: TimeCategory;
  reason: string;
}

export interface TimeCategoryPreview {
  hours: number;
  assignedCategory: TimeCategory | null;
  calculatedPay: number;
}

export interface TimeCategoryStats {
  total: number;
  active: number;
  inactive: number;
  conflicts: TimeCategoryConflict[];
}

export interface SuggestedCategory {
  name: string;
  minHours: number;
  maxHours?: number;
  payMultiplier: number;
  color: string;
}

export const timeCategoryApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Get all time categories
    getTimeCategories: builder.query<TimeCategory[], void>({
      query: () => '/admin/time-categories',
      providesTags: ['TimeCategory'],
    }),

    // Get single time category by ID
    getTimeCategory: builder.query<TimeCategory, string>({
      query: (id) => `/admin/time-categories/${id}`,
      providesTags: (result, error, id) => [{ type: 'TimeCategory', id }],
    }),

    // Create new time category
    createTimeCategory: builder.mutation<TimeCategory, CreateTimeCategoryRequest>({
      query: (data) => ({
        url: '/admin/time-categories',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['TimeCategory'],
    }),

    // Update existing time category
    updateTimeCategory: builder.mutation<TimeCategory, UpdateTimeCategoryRequest>({
      query: ({ id, ...data }) => ({
        url: `/admin/time-categories/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [
        'TimeCategory',
        { type: 'TimeCategory', id },
      ],
    }),

    // Delete time category (soft delete - sets isActive to false)
    deleteTimeCategory: builder.mutation<void, string>({
      query: (id) => ({
        url: `/admin/time-categories/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, id) => [
        'TimeCategory',
        { type: 'TimeCategory', id },
      ],
    }),

    // Get time category statistics and conflicts
    getTimeCategoryStats: builder.query<TimeCategoryStats, void>({
      query: () => '/admin/time-categories/stats',
      providesTags: ['TimeCategory'],
    }),

    // Preview category assignment for given hours
    previewCategoryAssignment: builder.query<TimeCategoryPreview, { hours: number; baseRate?: number }>({
      query: ({ hours, baseRate = 15 }) => 
        `/admin/time-categories/preview?hours=${hours}&baseRate=${baseRate}`,
      providesTags: ['TimeCategory'],
    }),

    // Get suggested time categories
    getSuggestedCategories: builder.query<SuggestedCategory[], void>({
      query: () => '/admin/time-categories/suggestions',
    }),

    // Validate category configuration (check for conflicts)
    validateCategoryConfiguration: builder.mutation<{ valid: boolean; conflicts: TimeCategoryConflict[] }, {
      categories: Partial<TimeCategory>[];
    }>({
      query: (data) => ({
        url: '/admin/time-categories/validate',
        method: 'POST',
        body: data,
      }),
    }),

    // Bulk update category order/priority
    updateCategoryOrder: builder.mutation<TimeCategory[], { categoryIds: string[] }>({
      query: (data) => ({
        url: '/admin/time-categories/reorder',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['TimeCategory'],
    }),
  }),
});

export const {
  useGetTimeCategoriesQuery,
  useGetTimeCategoryQuery,
  useCreateTimeCategoryMutation,
  useUpdateTimeCategoryMutation,
  useDeleteTimeCategoryMutation,
  useGetTimeCategoryStatsQuery,
  usePreviewCategoryAssignmentQuery,
  useGetSuggestedCategoriesQuery,
  useValidateCategoryConfigurationMutation,
  useUpdateCategoryOrderMutation,
} = timeCategoryApi;