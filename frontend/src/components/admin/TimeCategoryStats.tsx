import React from 'react';
import { TimeCategoryStats as StatsType } from '../../store/api/timeCategoryApi';
import './TimeCategoryStats.css';

interface TimeCategoryStatsProps {
  stats: StatsType;
}

const TimeCategoryStats: React.FC<TimeCategoryStatsProps> = ({ stats }) => {
  const activePercentage = stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0;

  return (
    <div className="time-category-stats">
      <div className="stats-grid">
        <div className="stat-card total">
          <div className="stat-icon">🏷️</div>
          <div className="stat-content">
            <div className="stat-number">{stats.total}</div>
            <div className="stat-label">Total Categories</div>
          </div>
        </div>

        <div className="stat-card active">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <div className="stat-number">{stats.active}</div>
            <div className="stat-label">Active</div>
            <div className="stat-percentage">{activePercentage}%</div>
          </div>
        </div>

        <div className="stat-card inactive">
          <div className="stat-icon">❌</div>
          <div className="stat-content">
            <div className="stat-number">{stats.inactive}</div>
            <div className="stat-label">Inactive</div>
            <div className="stat-percentage">{100 - activePercentage}%</div>
          </div>
        </div>

        <div className={`stat-card conflicts ${stats.conflicts.length > 0 ? 'warning' : ''}`}>
          <div className="stat-icon">{stats.conflicts.length > 0 ? '⚠️' : '✅'}</div>
          <div className="stat-content">
            <div className="stat-number">{stats.conflicts.length}</div>
            <div className="stat-label">Conflicts</div>
            {stats.conflicts.length > 0 && (
              <div className="stat-warning">Needs attention</div>
            )}
          </div>
        </div>
      </div>

      {stats.conflicts.length > 0 && (
        <div className="conflicts-summary">
          <h4>Configuration Issues:</h4>
          <ul>
            {stats.conflicts.slice(0, 3).map((conflict, index) => (
              <li key={index}>
                <strong>{conflict.category1.name}</strong> conflicts with{' '}
                <strong>{conflict.category2.name}</strong>: {conflict.reason}
              </li>
            ))}
            {stats.conflicts.length > 3 && (
              <li>...and {stats.conflicts.length - 3} more conflicts</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default TimeCategoryStats;