import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface OfflineState {
  isOnline: boolean;
  pendingActions: Array<{
    id: string;
    type: string;
    data: any;
    timestamp: number;
  }>;
  syncInProgress: boolean;
  lastSyncTime: number | null;
}

const initialState: OfflineState = {
  isOnline: navigator.onLine,
  pendingActions: [],
  syncInProgress: false,
  lastSyncTime: null,
};

const offlineSlice = createSlice({
  name: 'offline',
  initialState,
  reducers: {
    setOnlineStatus: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;
    },
    addPendingAction: (state, action: PayloadAction<{
      id: string;
      type: string;
      data: any;
    }>) => {
      state.pendingActions.push({
        ...action.payload,
        timestamp: Date.now(),
      });
    },
    removePendingAction: (state, action: PayloadAction<string>) => {
      state.pendingActions = state.pendingActions.filter(
        pendingAction => pendingAction.id !== action.payload
      );
    },
    setSyncInProgress: (state, action: PayloadAction<boolean>) => {
      state.syncInProgress = action.payload;
    },
    setLastSyncTime: (state, action: PayloadAction<number>) => {
      state.lastSyncTime = action.payload;
    },
  },
});

export const {
  setOnlineStatus,
  addPendingAction,
  removePendingAction,
  setSyncInProgress,
  setLastSyncTime,
} = offlineSlice.actions;

export default offlineSlice.reducer;