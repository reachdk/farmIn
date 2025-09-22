import React, { useState } from 'react';
import {
  useGetSyncStatusQuery,
  useGetSystemHealthQuery,
  useGetSystemStatsQuery,
  useGetConflictsQuery,
  useTriggerSyncMutation,
} from '../../store/api/systemApi';
import SystemHealthCard from './SystemHealthCard';
import SyncStatusCard from './SyncStatusCard';
import SystemStatsCard from './SystemStatsCard';
import SyncLogsViewer from './SyncLogsViewer';
import ConflictManager from './ConflictManager';
import BackupManager from './BackupManager';
import SystemConfig from './SystemConfig';
import './SystemMonitoring.css';

type MonitoringTab = 'overview' | 'sync' | 'conflicts' | 'backups' | 'config';

const SystemMonitoring: React.FC = () => {
  const [activeTab, setActiveTab] = useState<MonitoringTab>('overview');

  const { data: syncStatus, isLoading: syncLoading } = useGetSyncStatusQuery();
  const { data: systemHealth, isLoading: healthLoading } = useGetSystemHealthQuery();
  const { data: systemStats, isLoading: statsLoading } = useGetSystemStatsQuery();
  const { data: conflicts } = useGetConflictsQuery();

  const [triggerSync, { isLoading: isSyncing }] = useTriggerSyncMutation();

  const handleManualSync = async () => {
    try {
      const result = await triggerSync().unwrap();
      alert(`Sync initiated: ${result.message}`);
    } catch (error) {
      console.error('Failed to trigger sync:', error);
      alert('Failed to trigger sync. Please try again.');
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="monitoring-overview">
            <div className="overview-grid">
              <SystemHealthCard 
                health={systemHealth} 
                isLoading={healthLoading} 
              />
              <SyncStatusCard 
                syncStatus={syncStatus} 
                isLoading={syncLoading}
                onManualSync={handleManualSync}
                isSyncing={isSyncing}
              />
              <SystemStatsCard 
                stats={systemStats} 
                isLoading={statsLoading} 
              />
            </div>
            
            {conflicts && conflicts.length > 0 && (
              <div className="conflicts-alert">
                <div className="alert-content">
                  <span className="alert-icon">⚠️</span>
                  <span className="alert-message">
                    {conflicts.length} sync conflict{conflicts.length !== 1 ? 's' : ''} need{conflicts.length === 1 ? 's' : ''} attention
                  </span>
                  <button 
                    className="alert-action"
                    onClick={() => setActiveTab('conflicts')}
                  >
                    Resolve Conflicts
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      case 'sync':
        return <SyncLogsViewer />;
      case 'conflicts':
        return <ConflictManager />;
      case 'backups':
        return <BackupManager />;
      case 'config':
        return <SystemConfig />;
      default:
        return null;
    }
  };

  return (
    <div className="system-monitoring">
      <div className="monitoring-header">
        <h2>System Monitoring</h2>
        <div className="header-actions">
          <button 
            className="refresh-button"
            onClick={() => window.location.reload()}
            title="Refresh all data"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      <div className="monitoring-nav">
        <button
          className={`nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`nav-tab ${activeTab === 'sync' ? 'active' : ''}`}
          onClick={() => setActiveTab('sync')}
        >
          Sync Logs
        </button>
        <button
          className={`nav-tab ${activeTab === 'conflicts' ? 'active' : ''} ${conflicts && conflicts.length > 0 ? 'has-alerts' : ''}`}
          onClick={() => setActiveTab('conflicts')}
        >
          Conflicts {conflicts && conflicts.length > 0 && (
            <span className="alert-badge">{conflicts.length}</span>
          )}
        </button>
        <button
          className={`nav-tab ${activeTab === 'backups' ? 'active' : ''}`}
          onClick={() => setActiveTab('backups')}
        >
          Backups
        </button>
        <button
          className={`nav-tab ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          Configuration
        </button>
      </div>

      <div className="monitoring-content">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default SystemMonitoring;