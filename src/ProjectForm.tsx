import React, { useState } from 'react';

interface ProjectFormData {
  name: string;
  description: string;
  estimate_hours: number;
}

interface ProjectFormProps {
  onSubmit: (data: ProjectFormData) => void;
  onCancel: () => void;
  initialData?: ProjectFormData; // Optional initial data for editing
  isEditing?: boolean; // Flag to indicate if we're editing
}

const ProjectForm: React.FC<ProjectFormProps> = ({ onSubmit, onCancel, initialData, isEditing = false }) => {
  const [formData, setFormData] = useState<ProjectFormData>(
    initialData || {
      name: '',
      description: '',
      estimate_hours: 100
    }
  );

  const [errors, setErrors] = useState<{ name?: string; estimate_hours?: string }>({});


  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'estimate_hours' ? (value === '' ? 0 : Number(value)) : value
    }));
    
    // Clear error when user starts typing
    if (errors[name as keyof typeof errors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { name?: string; estimate_hours?: string } = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Project name is required';
    }
    
    if (formData.estimate_hours <= 0) {
      newErrors.estimate_hours = 'Estimate hours must be greater than 0';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      onSubmit(formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="project-form">
      <div className="form-group">
        <label htmlFor="name" className="form-label">
          Project Name *
        </label>
        <input
          type="text"
          id="name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          className={`form-input ${errors.name ? 'error' : ''}`}
          placeholder="Enter project name"
        />
        {errors.name && <span className="error-message">{errors.name}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="description" className="form-label">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          className="form-textarea"
          placeholder="Enter project description"
          rows={3}
        />
      </div>

      <div className="form-group">
        <label htmlFor="estimate_hours" className="form-label">
          Estimated Hours *
        </label>
        <input
          type="number"
          id="estimate_hours"
          name="estimate_hours"
          value={formData.estimate_hours || ''}
          onChange={handleChange}
          className={`form-input ${errors.estimate_hours ? 'error' : ''}`}
          placeholder="100"
          min="1"
          step="0.5"
        />
        {errors.estimate_hours && <span className="error-message">{errors.estimate_hours}</span>}
      </div>


      <div className="form-actions">
        <button type="button" className="form-cancel-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="form-submit-button">
          {isEditing ? 'Update Project' : 'Create Project'}
        </button>
      </div>
    </form>
  );
};

export default ProjectForm;