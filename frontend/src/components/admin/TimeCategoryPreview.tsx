import React, { useState } from 'react';
import { TimeCategory, usePreviewCategoryAssignmentQuery } from '../../store/api/timeCategoryApi';
import './TimeCategoryPreview.css';

interface TimeCategoryPreviewProps {
  categories: TimeCategory[];
  onClose: () => void;
}

const TimeCategoryPreview: React.FC<TimeCategoryPreviewProps> = ({ categories, onClose }) => {
  const [testHours, setTestHours] = useState<number>(8);
  const [baseRate, setBaseRate] = useState<number>(15);

  const { data: preview } = usePreviewCategoryAssignmentQuery(
    { hours: testHours, baseRate },
    { skip: !testHours || testHours <= 0 }
  );

  const testScenarios = [
    { hours: 2, label: '2 hours (Quarter day)' },
    { hours: 4, label: '4 hours (Half day)' },
    { hours: 6, label: '6 hours (3/4 day)' },
    { hours: 8, label: '8 hours (Full day)' },
    { hours: 10, label: '10 hours (Overtime)' },
    { hours: 12, label: '12 hours (Double time)' },
  ];

  const getAssignedCategory = (hours: number): TimeCategory | null => {
    const activeCategories = categories
      .filter(c => c.isActive)
      .sort((a, b) => b.minHours - a.minHours);

    for (const category of activeCategories) {
      if (hours >= category.minHours) {
        if (category.maxHours === undefined || hours <= category.maxHours) {
          return category;
        }
      }
    }
    return null;
  };

  const calculatePay = (hours: number, category: TimeCategory | null): number => {
    const multiplier = category?.payMultiplier || 1.0;
    return hours * baseRate * multiplier;
  };

  return (
    <div className="time-category-preview-overlay">
      <div className="time-category-preview-modal">
        <div className="preview-header">
          <h3>Category Assignment Preview</h3>
          <button className="close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="preview-content">
          <div className="preview-controls">
            <div className="control-group">
              <label htmlFor="testHours">Test Hours:</label>
              <input
                id="testHours"
                type="number"
                value={testHours}
                onChange={(e) => setTestHours(Number(e.target.value))}
                min="0"
                max="24"
                step="0.25"
              />
            </div>
            <div className="control-group">
              <label htmlFor="baseRate">Base Rate ($/hour):</label>
              <input
                id="baseRate"
                type="number"
                value={baseRate}
                onChange={(e) => setBaseRate(Number(e.target.value))}
                min="0"
                step="0.50"
              />
            </div>
          </div>

          {testHours > 0 && (
            <div className="preview-result">
              <h4>Result for {testHours} hours:</h4>
              {(() => {
                const assignedCategory = getAssignedCategory(testHours);
                const calculatedPay = calculatePay(testHours, assignedCategory);
                
                return (
                  <div className="result-details">
                    {assignedCategory ? (
                      <>
                        <div className="assigned-category">
                          <div 
                            className="category-color"
                            style={{ backgroundColor: assignedCategory.color }}
                          />
                          <span className="category-name">{assignedCategory.name}</span>
                          <span className="category-multiplier">
                            ({assignedCategory.payMultiplier}x multiplier)
                          </span>
                        </div>
                        <div className="pay-calculation">
                          <strong>Pay: ${calculatedPay.toFixed(2)}</strong>
                          <small>
                            ({testHours} hours × ${baseRate}/hour × {assignedCategory.payMultiplier})
                          </small>
                        </div>
                      </>
                    ) : (
                      <div className="no-category">
                        <span className="warning">⚠️ No category matches {testHours} hours</span>
                        <div className="pay-calculation">
                          <strong>Pay: ${(testHours * baseRate).toFixed(2)}</strong>
                          <small>(Default rate: {testHours} hours × ${baseRate}/hour × 1.0)</small>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          <div className="scenario-testing">
            <h4>Quick Test Scenarios:</h4>
            <div className="scenarios-grid">
              {testScenarios.map((scenario) => {
                const assignedCategory = getAssignedCategory(scenario.hours);
                const calculatedPay = calculatePay(scenario.hours, assignedCategory);
                
                return (
                  <div 
                    key={scenario.hours}
                    className="scenario-card"
                    onClick={() => setTestHours(scenario.hours)}
                  >
                    <div className="scenario-label">{scenario.label}</div>
                    {assignedCategory ? (
                      <div className="scenario-result">
                        <div 
                          className="scenario-color"
                          style={{ backgroundColor: assignedCategory.color }}
                        />
                        <span className="scenario-category">{assignedCategory.name}</span>
                        <span className="scenario-pay">${calculatedPay.toFixed(2)}</span>
                      </div>
                    ) : (
                      <div className="scenario-result no-match">
                        <span className="scenario-warning">No match</span>
                        <span className="scenario-pay">${(scenario.hours * baseRate).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="category-overview">
            <h4>Current Categories:</h4>
            <div className="categories-list">
              {categories
                .filter(c => c.isActive)
                .sort((a, b) => a.minHours - b.minHours)
                .map((category) => (
                  <div key={category.id} className="category-item">
                    <div 
                      className="category-color"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="category-name">{category.name}</span>
                    <span className="category-range">
                      {category.minHours}h{category.maxHours ? `-${category.maxHours}h` : '+'}
                    </span>
                    <span className="category-multiplier">{category.payMultiplier}x</span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div className="preview-actions">
          <button onClick={onClose} className="close-preview-button">
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
};

export default TimeCategoryPreview;