import React, { useEffect, useState } from 'react';
import Modal from './Modal';

interface DeletedProject {
  id: number;
  name: string;
  deleted_at: string;
  hours: number;
}

interface DeletedProjectsProps {
  isOpen: boolean;
  onClose: () => void;
  onRestored: () => void;
}

/** Lists soft-deleted projects; tick any and restore them to the project list. */
const DeletedProjects: React.FC<DeletedProjectsProps> = ({ isOpen, onClose, onRestored }) => {
  const [projects, setProjects] = useState<DeletedProject[] | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let live = true;
    fetch('/api/projects/deleted')
      .then(res => res.json())
      .then((list: DeletedProject[]) => {
        if (!live) return;
        setProjects(list);
        setChecked(new Set());
      });
    return () => { live = false; };
  }, [isOpen]);

  const toggle = (id: number) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      await fetch('/api/projects/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...checked] }),
      });
      onRestored();
      onClose();
    } catch (error) {
      console.error('Error restoring projects:', error);
    } finally {
      setIsRestoring(false);
    }
  };

  const formatDeleted = (sqlDate: string) =>
    new Date(sqlDate.replace(' ', 'T') + 'Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Deleted Projects">
      {projects == null ? (
        <p className="text-secondary">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="text-secondary">No deleted projects.</p>
      ) : (
        <div className="deleted-list">
          {projects.map(p => (
            <label key={p.id} className="deleted-row">
              <input type="checkbox" checked={checked.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="deleted-name">{p.name}</span>
              <span className="deleted-meta">{p.hours.toFixed(1)}h · deleted {formatDeleted(p.deleted_at)}</span>
            </label>
          ))}
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="form-cancel-button" onClick={onClose}>
          Close
        </button>
        <button type="button" className="form-submit-button" onClick={handleRestore}
          disabled={checked.size === 0 || isRestoring}>
          {isRestoring ? 'Restoring…' : checked.size ? `Restore (${checked.size})` : 'Restore'}
        </button>
      </div>
    </Modal>
  );
};

export default DeletedProjects;
