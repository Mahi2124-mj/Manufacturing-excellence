import { useState } from 'react';
import {
  ArrowUp,
  ArrowDown,
  Edit2,
  Trash2,
  Plus,
  Save,
  X,
  Link,
  Settings,
  GripVertical,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useActivitySteps } from '../lib/activitySteps';
import type { ActivityStep } from '../types';

export default function ActivityStepsSettings() {
  const { steps, addStep, updateStep, deleteStep, moveStep, toggleActive } = useActivitySteps();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ActivityStep>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStep, setNewStep] = useState({ name: '', description: '' });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleEdit = (step: ActivityStep) => {
    setEditingId(step.id);
    setEditForm({ name: step.name, description: step.description });
  };

  const handleSaveEdit = (id: string) => {
    if (!editForm.name?.trim()) {
      showNotification('error', 'Step name is required');
      return;
    }
    updateStep(id, { name: editForm.name.trim(), description: editForm.description ?? '' });
    setEditingId(null);
    setEditForm({});
    showNotification('success', 'Activity step updated — reflected in every QCC Workflow');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    moveStep(steps[index].id, -1);
    showNotification('success', 'Step moved up — workflow sequence updated');
  };

  const handleMoveDown = (index: number) => {
    if (index === steps.length - 1) return;
    moveStep(steps[index].id, 1);
    showNotification('success', 'Step moved down — workflow sequence updated');
  };

  const handleAddStep = () => {
    if (!newStep.name.trim()) {
      showNotification('error', 'Step name is required');
      return;
    }
    addStep(newStep.name, newStep.description);
    setNewStep({ name: '', description: '' });
    setShowAddForm(false);
    showNotification('success', 'New activity step added to every QCC Workflow');
  };

  const handleDeleteStep = (id: string) => {
    deleteStep(id);
    setDeleteConfirmId(null);
    showNotification('success', 'Activity step deleted — removed from every QCC Workflow');
  };

  const handleToggleActive = (id: string) => {
    toggleActive(id);
    showNotification('success', 'Step status updated across the workflow');
  };

  return (
    <div className="space-y-6">
      {/* Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg ${
            notification.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 size={18} className="text-emerald-600" />
          ) : (
            <AlertCircle size={18} className="text-red-600" />
          )}
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Settings size={24} className="text-blue-600" />
              </div>
              <h1 className="text-2xl font-bold text-slate-800">Activity Steps Configuration</h1>
            </div>
            <p className="text-sm text-slate-600 ml-14">
              Configure the default activity steps that apply to all QCC teams. These steps define the standard workflow for quality improvement projects.
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Add Activity
          </button>
        </div>

        {/* Info Banner */}
        <div className="mt-4 ml-14 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-3">
            <Link size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900 mb-1">
                Single source of truth for the QCC Workflow
              </p>
              <p className="text-xs text-blue-700">
                Every QCC Workflow is generated from this list. Add, edit, rename, reorder, deactivate or delete a step here and it instantly reflects in every team's workflow — step numbers, names and sequence stay in sync automatically.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Add New Step Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Add New Activity Step</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Step Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newStep.name}
                onChange={(e) => setNewStep({ ...newStep, name: e.target.value })}
                placeholder="Enter step name"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Description
              </label>
              <textarea
                value={newStep.description}
                onChange={(e) => setNewStep({ ...newStep, description: e.target.value })}
                placeholder="Enter step description"
                rows={3}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewStep({ name: '', description: '' });
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddStep}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Add Step
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Steps List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-800">Default Activity Steps ({steps.length})</h2>
          <p className="text-xs text-slate-600 mt-1">
            Drag to reorder or use the arrow buttons to change the sequence
          </p>
        </div>

        <div className="divide-y divide-slate-200">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`p-6 transition-colors ${
                !step.isActive ? 'bg-slate-50 opacity-60' : 'hover:bg-slate-50'
              }`}
            >
              {editingId === step.id ? (
                // Edit Mode
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Step Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editForm.name || ''}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Description
                    </label>
                    <textarea
                      value={editForm.description || ''}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={handleCancelEdit}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      <X size={16} />
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveEdit(step.id)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                    >
                      <Save size={16} />
                      Save Changes
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div className="flex items-start gap-4">
                  {/* Order Number */}
                  <div className="flex-shrink-0 flex items-center gap-2">
                    <GripVertical size={18} className="text-slate-400" />
                    <div className="w-10 h-10 flex items-center justify-center bg-blue-100 text-blue-700 font-bold rounded-lg">
                      {step.order}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-2">
                      <h3 className="text-base font-semibold text-slate-800">{step.name}</h3>
                      {step.linkedToWorkflow && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                          <Link size={12} />
                          Linked to QCC Workflow
                        </span>
                      )}
                      {step.isDefault && (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
                          Default
                        </span>
                      )}
                      {!step.isActive && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                          Inactive
                        </span>
                      )}
                    </div>
                    {step.description && (
                      <p className="text-sm text-slate-600 mb-2">{step.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>Last updated: {new Date(step.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex-shrink-0 flex items-center gap-2">
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move Up"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === steps.length - 1}
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move Down"
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      onClick={() => handleToggleActive(step.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        step.isActive
                          ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                          : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
                      }`}
                    >
                      {step.isActive ? 'Active' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleEdit(step)}
                      className="p-2 text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={16} />
                    </button>
                    {deleteConfirmId === step.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDeleteStep(step.id)}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(step.id)}
                        className="p-2 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900 mb-1">Important Notes</p>
            <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
              <li>Changes here apply live to every team's QCC Workflow — no separate setup needed</li>
              <li>Reordering changes the step sequence; renaming changes the step title everywhere</li>
              <li>Deactivating hides a step from the workflow; deleting removes it entirely</li>
              <li>Per-step approval status stays tied to each step's position in the sequence</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
