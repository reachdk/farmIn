import React from 'react';
import { TimeCategoryConflict, TimeCategory } from '../../store/api/timeCategoryApi';
import './ConflictResolution.css';

interface ConflictResolutionProps {
  conflicts: TimeCategoryConflict[];
  categories: TimeCategory[];
  onClose: () => void;
  onResolve: () => void;
}

const ConflictResolution: React.FC<ConflictResolutionProps> = ({
  conflicts,
  categories,
  onClose,
  onResolve,
}) => {
  const formatRange = (category: TimeCategory) => {
    if (category.maxHours) {
      return `${category.minHours} - ${category.maxHours} hours`;
    }
    return `${category.minHours}+ hours`;
  };

  const getSuggestions = (conflict: TimeCategoryConflict) => {
    const suggestions = [];
    
    if (conflict.reason === 'Overlapping hour ranges') {
      const cat1 = conflict.category1;
      const cat2 = conflict.category2;
      
      // Suggest adjusting ranges
      if (cat1.minHours < cat2.minHours) {
        suggestions.push(`Set ${cat1.name} max hours to ${cat2.minHours - 0.25}`);
        suggestions.push(`Increase ${cat2.name} min hours to ${cat1.maxHours || cat1.minHours + 1}`);
      } else {
        suggestions.push(`Set ${cat2.name} max hours to ${cat1.minHours - 0.25}`);
        suggestions.push(`Increase ${cat1.name} min hours to ${cat2.maxHours || cat2.minHours + 1}`);
      }
      
      // Suggest deactivating one
      suggestions.push(`Deactivate ${cat1.name} temporarily`);
      suggestions.push(`Deactivate ${cat2.name} temporarily`);
    }
    
    return suggestions;
  };

  return (
    <div className="conflict-resolution-overlay">
      <div className="conflict-resolution-modal">
        <div className="conflict-header">
          <h3>Resolve Configuration Conflicts</h3>
          <button className="close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="conflict-content">
          <div className="conflict-summary">
            <p>
              Found {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} in your time category configuration. 
              These conflicts can cause unpredictable behavior when assigning categories to work hours.
            </p>
          </div>

          <div className="conflicts-list">
            {conflicts.map((conflict, index) => (
              <div key={index} className="conflict-item">
                <div className="conflict-header-info">
                  <h4>Conflict #{index + 1}</h4>
                  <span className="conflict-type">{conflict.reason}</span>
                </div>

                <div className="conflict-details">
                  <div className="conflicting-categories">
                    <div className="category-info">
                      <div 
                        className="category-color"
                        style={{ backgroundColor: conflict.category1.color }}
                      />
                      <div className="category-details">
                        <strong>{conflict.category1.name}</strong>
                        <span className="category-range">
                          {formatRange(conflict.category1)}
                        </span>
                        <span className="category-multiplier">
                          {conflict.category1.payMultiplier}x pay
                        </span>
                      </div>
                    </div>

                    <div className="conflict-vs">vs</div>

                    <div className="category-info">
                      <div 
                        className="category-color"
                        style={{ backgroundColor: conflict.category2.color }}
                      />
                      <div className="category-details">
                        <strong>{conflict.category2.name}</strong>
                        <span className="category-range">
                          {formatRange(conflict.category2)}
                        </span>
                        <span className="category-multiplier">
                          {conflict.category2.payMultiplier}x pay
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="conflict-explanation">
                    <p>
                      These categories have overlapping hour ranges, which means some work hours 
                      could match both categories. The system will use the first matching category 
                      it finds, which may not be the intended behavior.
                    </p>
                  </div>

                  <div className="resolution-suggestions">
                    <h5>Suggested Solutions:</h5>
                    <ul>
                      {getSuggestions(conflict).map((suggestion, suggestionIndex) => (
                        <li key={suggestionIndex}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="resolution-actions">
            <div className="action-info">
              <p>
                To resolve these conflicts, edit the conflicting categories to ensure their 
                hour ranges don't overlap, or deactivate categories that are no longer needed.
              </p>
            </div>
            
            <div className="action-buttons">
              <button 
                className="resolve-button"
                onClick={() => {
                  onResolve();
                  onClose();
                }}
              >
                I'll Fix These Manually
              </button>
              <button 
                className="cancel-button"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConflictResolution;