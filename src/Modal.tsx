import React, { useState } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  showActions?: boolean;
  onDelete?: () => void;
  onAdjustDate?: () => void;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, showActions = false, onDelete, onAdjustDate }) => {
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          
          {showActions && (
            <div className="project-actions">
              <button 
                className="ellipsis-button"
                onClick={() => setShowActionsMenu(!showActionsMenu)}
                title="Project actions"
              >...
              </button>
              {showActionsMenu && (
                <div className="project-menu">
                  {onAdjustDate && (
                    <button 
                      className="menu-item adjust-date-item"
                      onClick={() => {
                        onAdjustDate();
                        setShowActionsMenu(false);
                      }}
                    >
                      Adjust Date
                    </button>
                  )}
                  {onDelete && (
                    <button 
                      className="menu-item delete-item"
                      onClick={() => {
                        onDelete();
                        setShowActionsMenu(false);
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          
          <button className="modal-close-button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;