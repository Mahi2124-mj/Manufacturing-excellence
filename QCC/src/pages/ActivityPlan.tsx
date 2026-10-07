import { useState, useMemo, useRef, useEffect } from 'react';
import { Calendar, Plus, Download, Filter, Search, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Clock, TrendingUp, Users, Edit2, Trash2, Save, X, ArrowUpDown, Eye, Moon, Sun, FileText, History, CheckSquare, Move } from 'lucide-react';
import { mockQCCActivities, mockProjects, mockUsers } from '../lib/data';
import { useAuth } from '../lib/auth';
import type { QCCActivity, ActivityPriority, ActivityStatus, ActivityAuditEntry } from '../types';
import { useConfirm } from '../components/ConfirmDialog';

const DEFAULT_ACTIVITIES = [
  'Grasp Current Situation & Set Target',
  'Create Activity Plan',
  'Root Cause Analysis',
  'Countermeasure Study & Implementation',
  'Check Results',
  'Standardization & Control',
  'Future Plan'
];

const PRIORITY_CONFIG = {
  high: { color: 'bg-red-100 text-red-700 border-red-300', label: 'High' },
  medium: { color: 'bg-yellow-100 text-yellow-700 border-yellow-300', label: 'Medium' },
  low: { color: 'bg-green-100 text-green-700 border-green-300', label: 'Low' }
};

const STATUS_CONFIG = {
  not_started: { color: 'bg-gray-100 text-gray-700', label: 'Not Started', icon: '⚪' },
  planned: { color: 'bg-blue-100 text-blue-700', label: 'Planned', icon: '📋' },
  in_progress: { color: 'bg-orange-100 text-orange-700', label: 'In Progress', icon: '🟧' },
  on_hold: { color: 'bg-purple-100 text-purple-700', label: 'On Hold', icon: '⏸️' },
  completed: { color: 'bg-green-100 text-green-700', label: 'Completed', icon: '✅' }
};

export default function ActivityPlan() {
  const { user } = useAuth();
  const askConfirm = useConfirm();
  const [activities, setActivities] = useState<QCCActivity[]>(mockQCCActivities);
  const [selectedProject, setSelectedProject] = useState('PRJ-001');
  const [showForm, setShowForm] = useState(false);
  const [editingActivity, setEditingActivity] = useState<QCCActivity | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterPIC, setFilterPIC] = useState<string>('all');
  const [timelineView, setTimelineView] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [showFilters, setShowFilters] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [showDefaultActivities, setShowDefaultActivities] = useState(false);
  const [auditTrail, setAuditTrail] = useState<ActivityAuditEntry[]>([]);
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [draggedActivity, setDraggedActivity] = useState<QCCActivity | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<'draft' | 'pending' | 'approved' | 'rejected'>('draft');
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [draggedBar, setDraggedBar] = useState<{ id: string; edge: 'start' | 'end'; type: 'planned' | 'actual' } | null>(null);
  const ganttRef = useRef<HTMLDivElement>(null);
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Filter activities by selected project
  const projectActivities = useMemo(() => 
    activities.filter(a => a.projectId === selectedProject),
    [activities, selectedProject]
  );

  // Apply filters
  const filteredActivities = useMemo(() => {
    return projectActivities.filter(activity => {
      const matchesSearch = activity.activityName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           activity.activityDescription.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'all' || activity.status === filterStatus;
      const matchesPriority = filterPriority === 'all' || activity.priority === filterPriority;
      const matchesPIC = filterPIC === 'all' || activity.personInCharge === filterPIC;
      return matchesSearch && matchesStatus && matchesPriority && matchesPIC;
    });
  }, [projectActivities, searchTerm, filterStatus, filterPriority, filterPIC]);

  // Dashboard statistics
  const stats = useMemo(() => {
    const total = projectActivities.length;
    const completed = projectActivities.filter(a => a.status === 'completed').length;
    const inProgress = projectActivities.filter(a => a.status === 'in_progress').length;
    const delayed = projectActivities.filter(a => {
      if (a.status === 'completed') return false;
      const today = new Date();
      const plannedEnd = new Date(a.plannedEndDate);
      return today > plannedEnd;
    }).length;
    const pending = projectActivities.filter(a => a.status === 'not_started' || a.status === 'planned').length;
    const completionPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    const avgDelay = projectActivities.filter(a => a.delayDays > 0).reduce((sum, a) => sum + a.delayDays, 0) / 
                     (projectActivities.filter(a => a.delayDays > 0).length || 1);

    return { total, completed, inProgress, delayed, pending, completionPercentage, avgDelay: Math.round(avgDelay) };
  }, [projectActivities]);

  // Smart alerts
  const alerts = useMemo(() => {
    const today = new Date();
    return projectActivities
      .filter(a => a.status !== 'completed' && a.status !== 'on_hold')
      .map(activity => {
        const plannedEnd = new Date(activity.plannedEndDate);
        const daysUntilDue = Math.ceil((plannedEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysUntilDue < 0) {
          return { activity, type: 'overdue', message: `Overdue by ${Math.abs(daysUntilDue)} days`, severity: 'error' };
        } else if (daysUntilDue === 0) {
          return { activity, type: 'due_today', message: 'Due today', severity: 'warning' };
        } else if (daysUntilDue <= 3) {
          return { activity, type: 'due_soon', message: `Due in ${daysUntilDue} days`, severity: 'warning' };
        }
        return null;
      })
      .filter(Boolean) as any[];
  }, [projectActivities]);

  // Form state
  const [formData, setFormData] = useState<Partial<QCCActivity>>({
    activityName: '',
    activityDescription: '',
    personInCharge: '',
    priority: 'medium',
    plannedStartDate: '',
    plannedEndDate: '',
    actualStartDate: '',
    actualEndDate: '',
    status: 'not_started',
    progressPercentage: 0,
    remarks: ''
  });

  // Autosave functionality
  useEffect(() => {
    if (!autosaveEnabled || activities.length === 0) return;
    
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    
    autosaveTimerRef.current = setTimeout(() => {
      // Simulate autosave
      setLastSaved(new Date());
    }, 5000);
    
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [activities, autosaveEnabled]);

  // Audit trail logging
  const logAuditEntry = (action: ActivityAuditEntry['action'], activityId: string, changes?: ActivityAuditEntry['changes']) => {
    const entry: ActivityAuditEntry = {
      id: `AUDIT-${Date.now()}`,
      activityId,
      action,
      performedBy: user?.id || '',
      performedByName: user?.name || 'Unknown',
      performedAt: new Date().toISOString(),
      changes
    };
    setAuditTrail(prev => [entry, ...prev]);
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['SR', 'Activity', 'Description', 'PIC', 'Priority', 'Planned Start', 'Planned End', 'Actual Start', 'Actual End', 'Progress %', 'Delay Days', 'Status', 'Remarks'];
    const rows = filteredActivities.map((a, idx) => [
      idx + 1,
      a.activityName,
      a.activityDescription,
      a.personInChargeName,
      a.priority,
      a.plannedStartDate,
      a.plannedEndDate,
      a.actualStartDate || '',
      a.actualEndDate || '',
      a.progressPercentage,
      a.delayDays,
      a.status,
      a.remarks
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `activity_plan_${selectedProject}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Add default activity
  const addDefaultActivity = (activityName: string) => {
    const newActivity: QCCActivity = {
      id: `ACT-${Date.now()}`,
      projectId: selectedProject,
      serialNumber: projectActivities.length + 1,
      activityName,
      activityDescription: '',
      personInCharge: '',
      personInChargeName: '',
      priority: 'medium',
      plannedStartDate: new Date().toISOString().split('T')[0],
      plannedEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      actualStartDate: '',
      actualEndDate: '',
      status: 'not_started',
      progressPercentage: 0,
      delayDays: 0,
      remarks: '',
      createdBy: user?.id || '',
      createdByName: user?.name || '',
      createdAt: new Date().toISOString(),
      isDefaultActivity: true
    };
    setActivities(prev => [...prev, newActivity]);
    logAuditEntry('created', newActivity.id);
    setShowDefaultActivities(false);
  };

  // Drag and drop handlers
  const handleDragStart = (activity: QCCActivity) => {
    setDraggedActivity(activity);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetActivity: QCCActivity) => {
    if (!draggedActivity || draggedActivity.id === targetActivity.id) return;
    
    const newActivities = [...activities];
    const draggedIdx = newActivities.findIndex(a => a.id === draggedActivity.id);
    const targetIdx = newActivities.findIndex(a => a.id === targetActivity.id);
    
    newActivities.splice(draggedIdx, 1);
    newActivities.splice(targetIdx, 0, draggedActivity);
    
    // Update serial numbers
    const updatedActivities = newActivities.map((a, idx) => ({
      ...a,
      serialNumber: idx + 1
    }));
    
    setActivities(updatedActivities);
    logAuditEntry('reordered', draggedActivity.id);
    setDraggedActivity(null);
  };

  // Submit for approval
  const submitForApproval = () => {
    setApprovalStatus('pending');
    logAuditEntry('status_changed', '', [{ field: 'approval_status', oldValue: 'draft', newValue: 'pending' }]);
    alert('Activity plan submitted for approval!');
  };

  const handleAddActivity = () => {
    setEditingActivity(null);
    setFormData({
      activityName: '',
      activityDescription: '',
      personInCharge: '',
      priority: 'medium',
      plannedStartDate: '',
      plannedEndDate: '',
      actualStartDate: '',
      actualEndDate: '',
      status: 'not_started',
      progressPercentage: 0,
      remarks: ''
    });
    setShowForm(true);
  };

  const handleEditActivity = (activity: QCCActivity) => {
    setEditingActivity(activity);
    setFormData(activity);
    setShowForm(true);
  };

  const handleSaveActivity = () => {
    if (!formData.activityName || !formData.plannedStartDate || !formData.plannedEndDate || !formData.personInCharge) {
      alert('Please fill in all required fields');
      return;
    }

    const now = new Date().toISOString();
    
    if (editingActivity) {
      // Track changes for audit
      const changes: ActivityAuditEntry['changes'] = [];
      if (formData.activityName !== editingActivity.activityName) {
        changes.push({ field: 'activityName', oldValue: editingActivity.activityName, newValue: formData.activityName || '' });
      }
      if (formData.status !== editingActivity.status) {
        changes.push({ field: 'status', oldValue: editingActivity.status, newValue: formData.status || '' });
      }
      if (formData.progressPercentage !== editingActivity.progressPercentage) {
        changes.push({ field: 'progressPercentage', oldValue: String(editingActivity.progressPercentage), newValue: String(formData.progressPercentage || 0) });
      }
      
      // Update existing activity
      setActivities(prev => prev.map(a => 
        a.id === editingActivity.id 
          ? {
              ...a,
              ...formData,
              personInChargeName: mockUsers.find(u => u.id === formData.personInCharge)?.name || '',
              updatedBy: user?.id || '',
              updatedByName: user?.name || '',
              updatedAt: now
            }
          : a
      ));
      
      logAuditEntry('updated', editingActivity.id, changes.length > 0 ? changes : undefined);
    } else {
      // Create new activity
      const newActivity: QCCActivity = {
        id: `ACT-${Date.now()}`,
        projectId: selectedProject,
        serialNumber: projectActivities.length + 1,
        activityName: formData.activityName || '',
        activityDescription: formData.activityDescription || '',
        personInCharge: formData.personInCharge || '',
        personInChargeName: mockUsers.find(u => u.id === formData.personInCharge)?.name || '',
        priority: (formData.priority as ActivityPriority) || 'medium',
        plannedStartDate: formData.plannedStartDate || '',
        plannedEndDate: formData.plannedEndDate || '',
        actualStartDate: formData.actualStartDate,
        actualEndDate: formData.actualEndDate,
        status: (formData.status as ActivityStatus) || 'not_started',
        progressPercentage: formData.progressPercentage || 0,
        delayDays: 0,
        remarks: formData.remarks || '',
        createdBy: user?.id || '',
        createdByName: user?.name || '',
        createdAt: now
      };
      setActivities(prev => [...prev, newActivity]);
      logAuditEntry('created', newActivity.id);
    }
    
    setShowForm(false);
    setEditingActivity(null);
  };

  const handleDeleteActivity = (id: string) => {
    // Confirmation is handled by the ConfirmDialog at the call site.
    setActivities(prev => prev.filter(a => a.id !== id));
    logAuditEntry('deleted', id);
  };

  const calculateDelay = (activity: QCCActivity): number => {
    if (!activity.actualEndDate || activity.status !== 'completed') return 0;
    const plannedEnd = new Date(activity.plannedEndDate);
    const actualEnd = new Date(activity.actualEndDate);
    const diffTime = actualEnd.getTime() - plannedEnd.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const getRowStatus = (activity: QCCActivity): { bgColor: string; statusLabel: string; statusIcon: string; alertType?: string } => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const plannedStart = new Date(activity.plannedStartDate);
    const plannedEnd = new Date(activity.plannedEndDate);
    plannedEnd.setHours(0, 0, 0, 0);
    
    // Completed activities
    if (activity.status === 'completed') {
      if (activity.actualEndDate) {
        const actualEnd = new Date(activity.actualEndDate);
        actualEnd.setHours(0, 0, 0, 0);
        if (actualEnd > plannedEnd) {
          return { bgColor: 'bg-red-50', statusLabel: `Completed Late (${activity.delayDays}d)`, statusIcon: '⚠️', alertType: 'completed_late' };
        }
      }
      return { bgColor: 'bg-green-50', statusLabel: 'Completed On Time', statusIcon: '✅', alertType: 'completed_on_time' };
    }
    
    // Overdue (past planned end date and not completed)
    if (today > plannedEnd) {
      const daysOverdue = Math.ceil((today.getTime() - plannedEnd.getTime()) / (1000 * 60 * 60 * 24));
      return { bgColor: 'bg-red-50', statusLabel: `Overdue (${daysOverdue}d)`, statusIcon: '🔴', alertType: 'overdue' };
    }
    
    // Due today
    if (today.getTime() === plannedEnd.getTime()) {
      return { bgColor: 'bg-orange-50', statusLabel: 'Due Today', statusIcon: '🟠', alertType: 'due_today' };
    }
    
    // Due in 3 days
    const daysUntilDue = Math.ceil((plannedEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilDue <= 3 && daysUntilDue > 0) {
      return { bgColor: 'bg-yellow-50', statusLabel: `Due in ${daysUntilDue}d`, statusIcon: '🟡', alertType: 'due_soon' };
    }
    
    // Risk of delay (behind schedule based on progress)
    if (activity.status === 'in_progress' && activity.actualStartDate) {
      const actualStart = new Date(activity.actualStartDate);
      const totalDays = Math.ceil((plannedEnd.getTime() - actualStart.getTime()) / (1000 * 60 * 60 * 24));
      const elapsedDays = Math.ceil((today.getTime() - actualStart.getTime()) / (1000 * 60 * 60 * 24));
      const expectedProgress = totalDays > 0 ? (elapsedDays / totalDays) * 100 : 0;
      
      if (activity.progressPercentage < expectedProgress - 20) {
        return { bgColor: 'bg-orange-50', statusLabel: 'Risk of Delay', statusIcon: '⚠️', alertType: 'risk_of_delay' };
      }
    }
    
    // Upcoming (not started yet, within 7 days)
    if (today < plannedStart) {
      const daysUntilStart = Math.ceil((plannedStart.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilStart <= 7) {
        return { bgColor: 'bg-blue-50', statusLabel: `Upcoming (${daysUntilStart}d)`, statusIcon: '📅', alertType: 'upcoming' };
      }
    }
    
    return { bgColor: '', statusLabel: STATUS_CONFIG[activity.status].label, statusIcon: STATUS_CONFIG[activity.status].icon };
  };

  // Gantt Chart Component
  const GanttChart = () => {
    const chartRef = useRef<HTMLDivElement>(null);
    const today = new Date();
    const [zoomLevel, setZoomLevel] = useState(1); // 0.5 to 2
    
    // Calculate date range
    const allDates = projectActivities.flatMap(a => [
      new Date(a.plannedStartDate),
      new Date(a.plannedEndDate),
      a.actualStartDate ? new Date(a.actualStartDate) : null,
      a.actualEndDate ? new Date(a.actualEndDate) : null
    ]).filter(Boolean) as Date[];
    
    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
    
    // Add padding
    minDate.setDate(minDate.getDate() - 7);
    maxDate.setDate(maxDate.getDate() + 7);
    
    const totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
    
    const getPosition = (date: string) => {
      const d = new Date(date);
      const daysFromStart = Math.ceil((d.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
      return (daysFromStart / totalDays) * 100;
    };

    const getWidth = (start: string, end: string) => {
      const startDate = new Date(start);
      const endDate = new Date(end);
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      return (days / totalDays) * 100;
    };

    const getDateFromPosition = (positionPercent: number) => {
      const daysFromStart = (positionPercent / 100) * totalDays;
      const date = new Date(minDate);
      date.setDate(date.getDate() + Math.round(daysFromStart));
      return date.toISOString().split('T')[0];
    };

    // Handle bar drag
    const handleBarMouseDown = (e: React.MouseEvent, activityId: string, edge: 'start' | 'end', type: 'planned' | 'actual') => {
      e.stopPropagation();
      setDraggedBar({ id: activityId, edge, type });
    };

    const handleBarMouseMove = (e: React.MouseEvent) => {
      if (!draggedBar || !chartRef.current) return;

      const chartRect = chartRef.current.getBoundingClientRect();
      const relativeX = e.clientX - chartRect.left;
      const positionPercent = (relativeX / chartRect.width) * 100;
      const newDate = getDateFromPosition(positionPercent);

      const activity = activities.find(a => a.id === draggedBar.id);
      if (!activity) return;

      if (draggedBar.type === 'planned') {
        if (draggedBar.edge === 'start') {
          updateActivityField(draggedBar.id, 'plannedStartDate', newDate);
        } else {
          updateActivityField(draggedBar.id, 'plannedEndDate', newDate);
        }
      } else {
        if (draggedBar.edge === 'start') {
          updateActivityField(draggedBar.id, 'actualStartDate', newDate);
        } else {
          updateActivityField(draggedBar.id, 'actualEndDate', newDate);
        }
      }
    };

    const handleBarMouseUp = () => {
      setDraggedBar(null);
    };

    const updateActivityField = (id: string, field: string, value: string) => {
      setActivities(prev => prev.map(a => 
        a.id === id ? { ...a, [field]: value } : a
      ));
    };

    // Generate timeline headers
    const generateTimelineHeaders = () => {
      const headers = [];
      const current = new Date(minDate);
      
      while (current <= maxDate) {
        const position = getPosition(current.toISOString());
        
        if (timelineView === 'daily') {
          headers.push(
            <div key={current.toISOString()} className="absolute top-0 text-xs text-slate-500 dark:text-slate-400" style={{ left: `${position}%` }}>
              {current.getDate()}/{current.getMonth() + 1}
            </div>
          );
        } else if (timelineView === 'weekly' && current.getDay() === 1) {
          headers.push(
            <div key={current.toISOString()} className="absolute top-0 text-xs text-slate-500 dark:text-slate-400" style={{ left: `${position}%` }}>
              Week {Math.ceil(current.getDate() / 7)}
            </div>
          );
        } else if (timelineView === 'monthly' && current.getDate() === 1) {
          headers.push(
            <div key={current.toISOString()} className="absolute top-0 text-xs font-semibold text-slate-700 dark:text-slate-300" style={{ left: `${position}%` }}>
              {current.toLocaleString('default', { month: 'short' })}
            </div>
          );
        }
        
        current.setDate(current.getDate() + 1);
      }
      
      return headers;
    };

    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Gantt Chart - Plan vs Actual</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setTimelineView('daily')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                timelineView === 'daily' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              Daily
            </button>
            <button
              onClick={() => setTimelineView('weekly')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                timelineView === 'weekly' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => setTimelineView('monthly')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                timelineView === 'monthly' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              Monthly
            </button>
            <div className="border-l border-slate-300 dark:border-slate-600 pl-2 ml-2">
              <button
                onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}
                className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors dark:text-slate-300"
                title="Zoom Out"
              >
                −
              </button>
              <span className="px-2 text-xs text-slate-600 dark:text-slate-400">{Math.round(zoomLevel * 100)}%</span>
              <button
                onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.25))}
                className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors dark:text-slate-300"
                title="Zoom In"
              >
                +
              </button>
            </div>
          </div>
        </div>
        
        <div 
          className="overflow-x-auto" 
          ref={chartRef}
          onMouseMove={handleBarMouseMove}
          onMouseUp={handleBarMouseUp}
          onMouseLeave={handleBarMouseUp}
        >
          <div className="min-w-[1200px]" style={{ transform: `scaleX(${zoomLevel})`, transformOrigin: 'left' }}>
            {/* Timeline Header - Sticky */}
            <div className="sticky top-0 z-10 relative h-8 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
              {generateTimelineHeaders()}
            </div>
            
            {/* Gantt Bars */}
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {filteredActivities.map(activity => {
                const rowStatus = getRowStatus(activity);
                const plannedStart = getPosition(activity.plannedStartDate);
                const plannedWidth = getWidth(activity.plannedStartDate, activity.plannedEndDate);
                const isSelected = selectedActivityId === activity.id;
                
                let actualStart = null;
                let actualWidth = null;
                if (activity.actualStartDate) {
                  actualStart = getPosition(activity.actualStartDate);
                  const endDate = activity.actualEndDate || new Date().toISOString();
                  actualWidth = getWidth(activity.actualStartDate, endDate);
                }
                
                const todayPosition = getPosition(today.toISOString());
                
                return (
                  <div 
                    key={activity.id} 
                    className={`relative h-16 transition-colors cursor-pointer ${rowStatus.bgColor} ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500' : 'hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                    onClick={() => setSelectedActivityId(activity.id === selectedActivityId ? null : activity.id)}
                  >
                    {/* Activity Name - Sticky */}
                    <div className="sticky left-0 z-5 absolute top-0 bottom-0 w-64 px-4 py-2 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{activity.activityName}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{activity.personInChargeName}</div>
                    </div>
                    
                    {/* Timeline Area */}
                    <div className="absolute left-64 right-0 top-0 bottom-0">
                      {/* Planned Bar (Blue) */}
                      <div
                        className="absolute h-5 bg-blue-500 dark:bg-blue-600 rounded opacity-70 hover:opacity-100 transition-opacity cursor-move group"
                        style={{
                          left: `${plannedStart}%`,
                          width: `${plannedWidth}%`,
                          top: '12px'
                        }}
                        title={`Planned: ${activity.plannedStartDate} to ${activity.plannedEndDate}`}
                      >
                        <div className="text-xs text-white px-2 py-0.5 truncate">Planned</div>
                        {/* Drag handles */}
                        <div 
                          className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-700"
                          onMouseDown={(e) => handleBarMouseDown(e, activity.id, 'start', 'planned')}
                        />
                        <div 
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-700"
                          onMouseDown={(e) => handleBarMouseDown(e, activity.id, 'end', 'planned')}
                        />
                      </div>
                      
                      {/* Actual Bar (Green) */}
                      {actualStart !== null && actualWidth !== null && (
                        <>
                          <div
                            className="absolute h-5 bg-green-500 dark:bg-green-600 rounded hover:opacity-80 transition-opacity cursor-move group"
                            style={{
                              left: `${actualStart}%`,
                              width: `${Math.min(actualWidth, plannedWidth)}%`,
                              top: '28px'
                            }}
                            title={`Actual: ${activity.actualStartDate} to ${activity.actualEndDate || 'In Progress'}`}
                          >
                            <div className="text-xs text-white px-2 py-0.5 truncate">Actual</div>
                            {/* Drag handles */}
                            <div 
                              className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-green-700"
                              onMouseDown={(e) => handleBarMouseDown(e, activity.id, 'start', 'actual')}
                            />
                            <div 
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-green-700"
                              onMouseDown={(e) => handleBarMouseDown(e, activity.id, 'end', 'actual')}
                            />
                          </div>
                          
                          {/* Delay Extension (Red) */}
                          {activity.delayDays > 0 && (
                            <div
                              className="absolute h-5 bg-red-500 dark:bg-red-600 rounded-r hover:opacity-80 transition-opacity cursor-pointer"
                              style={{
                                left: `${plannedStart + plannedWidth}%`,
                                width: `${actualWidth - plannedWidth}%`,
                                top: '28px'
                              }}
                              title={`Delayed by ${activity.delayDays} days`}
                            >
                              <div className="text-xs text-white px-2 py-0.5 whitespace-nowrap">
                                DELAYED BY {activity.delayDays} DAYS
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      
                      {/* Today Marker */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                        style={{ left: `${todayPosition}%` }}
                      >
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-red-600 dark:text-red-400 font-semibold whitespace-nowrap">
                          Today
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* Legend */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex gap-6 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 dark:bg-blue-600 rounded opacity-70"></div>
            <span className="text-slate-600 dark:text-slate-400">Planned Timeline</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 dark:bg-green-600 rounded"></div>
            <span className="text-slate-600 dark:text-slate-400">Actual Timeline</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 dark:bg-red-600 rounded"></div>
            <span className="text-slate-600 dark:text-slate-400">Delay Extension</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-0.5 h-4 bg-red-500"></div>
            <span className="text-slate-600 dark:text-slate-400">Today</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`space-y-6 ${darkMode ? 'dark' : ''}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">QCC Activity Plan</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Step 3: Create and manage project activities with Gantt chart visualization</p>
          {lastSaved && autosaveEnabled && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
              <Save size={12} /> Last saved: {lastSaved.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {mockProjects.map(p => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
          
          {/* Dark Mode Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title={darkMode ? 'Light Mode' : 'Dark Mode'}
          >
            {darkMode ? <Sun size={16} className="text-yellow-500" /> : <Moon size={16} className="text-slate-600" />}
          </button>
          
          {/* Audit Trail */}
          <button
            onClick={() => setShowAuditTrail(!showAuditTrail)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors dark:text-slate-100"
          >
            <History size={16} /> Audit Trail
          </button>
          
          {/* Export */}
          <button
            onClick={exportToCSV}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors dark:text-slate-100"
          >
            <Download size={16} /> Export CSV
          </button>
          
          {/* Default Activities */}
          <div className="relative">
            <button
              onClick={() => setShowDefaultActivities(!showDefaultActivities)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <FileText size={16} /> Templates
            </button>
            {showDefaultActivities && (
              <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-10">
                <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Default QCC Activities</h3>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {DEFAULT_ACTIVITIES.map((activity, idx) => (
                    <button
                      key={idx}
                      onClick={() => addDefaultActivity(activity)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 dark:text-slate-100 transition-colors"
                    >
                      {activity}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Add Activity */}
          <button
            onClick={handleAddActivity}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} /> Add Activity
          </button>
        </div>
      </div>

      {/* Approval Workflow */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              approvalStatus === 'draft' ? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300' :
              approvalStatus === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
              approvalStatus === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
              'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
            }`}>
              {approvalStatus === 'draft' ? '📝 Draft' :
               approvalStatus === 'pending' ? '⏳ Pending Approval' :
               approvalStatus === 'approved' ? '✅ Approved' :
               '❌ Rejected'}
            </span>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {approvalStatus === 'draft' && 'Ready to submit for approval'}
              {approvalStatus === 'pending' && 'Waiting for manager approval'}
              {approvalStatus === 'approved' && 'Activity plan approved and active'}
              {approvalStatus === 'rejected' && 'Please review and resubmit'}
            </span>
          </div>
          <div className="flex gap-2">
            {approvalStatus === 'draft' && (
              <button
                onClick={submitForApproval}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Submit for Approval
              </button>
            )}
            {approvalStatus === 'rejected' && (
              <button
                onClick={() => setApprovalStatus('draft')}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Revise & Resubmit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Autosave Toggle */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={autosaveEnabled}
            onChange={(e) => setAutosaveEnabled(e.target.checked)}
            className="rounded border-slate-300"
          />
          Enable Autosave
        </label>
      </div>

      {/* Dashboard Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={20} className="text-blue-600 dark:text-blue-400" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Total</span>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.total}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={20} className="text-green-600 dark:text-green-400" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Completed</span>
          </div>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.completed}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={20} className="text-orange-600 dark:text-orange-400" />
            <span className="text-xs text-slate-500 dark:text-slate-400">In Progress</span>
          </div>
          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.inProgress}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={20} className="text-red-600 dark:text-red-400" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Delayed</span>
          </div>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.delayed}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={20} className="text-slate-600 dark:text-slate-400" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Pending</span>
          </div>
          <p className="text-2xl font-bold text-slate-600 dark:text-slate-400">{stats.pending}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={20} className="text-blue-600 dark:text-blue-400" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Completion</span>
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.completionPercentage}%</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={20} className="text-purple-600 dark:text-purple-400" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Avg Delay</span>
          </div>
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.avgDelay}d</p>
        </div>
      </div>

      {/* Smart Alerts */}
      {alerts.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-600" />
            Smart Alerts ({alerts.length})
          </h3>
          <div className="space-y-2">
            {alerts.slice(0, 5).map((alert, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  alert.severity === 'error' ? 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800' : 'bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">
                    {alert.type === 'overdue' ? '🔴' : alert.type === 'due_today' ? '🟡' : '⚠️'}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{alert.activity.activityName}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{alert.message}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  alert.severity === 'error' ? 'bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300' : 'bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-300'
                }`}>
                  {alert.activity.personInChargeName}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit Trail Panel */}
      {showAuditTrail && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <History size={16} className="text-blue-600" />
              Audit Trail ({auditTrail.length} entries)
            </h3>
            <button
              onClick={() => setShowAuditTrail(false)}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X size={16} className="text-slate-600 dark:text-slate-400" />
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {auditTrail.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No audit entries yet</p>
            ) : (
              auditTrail.slice(0, 20).map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                    {entry.action === 'created' && <Plus size={14} className="text-blue-600 dark:text-blue-400" />}
                    {entry.action === 'updated' && <Edit2 size={14} className="text-blue-600 dark:text-blue-400" />}
                    {entry.action === 'deleted' && <Trash2 size={14} className="text-red-600 dark:text-red-400" />}
                    {entry.action === 'reordered' && <Move size={14} className="text-blue-600 dark:text-blue-400" />}
                    {entry.action === 'status_changed' && <CheckSquare size={14} className="text-blue-600 dark:text-blue-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {entry.performedByName} {entry.action} activity
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(entry.performedAt).toLocaleString()}
                    </p>
                    {entry.changes && entry.changes.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {entry.changes.map((change, idx) => (
                          <div key={idx} className="text-xs text-slate-600 dark:text-slate-400">
                            <span className="font-medium">{change.field}:</span>{' '}
                            <span className="line-through text-red-600 dark:text-red-400">{change.oldValue}</span>{' '}
                            → <span className="text-green-600 dark:text-green-400">{change.newValue}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Gantt Chart */}
      <GanttChart />

      {/* Filters and Search */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Activity Table</h3>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <Filter size={16} />
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Search</label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search activities..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">All Statuses</option>
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Priority</label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">All Priorities</option>
                {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Person in Charge</label>
              <select
                value={filterPIC}
                onChange={(e) => setFilterPIC(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">All Members</option>
                {mockUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Activity Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">SR</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Activity</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">PIC</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Priority</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Planned Start</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Planned End</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Actual Start</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Actual End</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Progress</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Delay</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filteredActivities.map((activity, idx) => {
                const rowStatus = getRowStatus(activity);
                const delay = calculateDelay(activity);
                const isSelected = selectedActivityId === activity.id;
                
                return (
                  <tr
                    key={activity.id}
                    draggable
                    onDragStart={() => handleDragStart(activity)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(activity)}
                    onClick={() => setSelectedActivityId(activity.id === selectedActivityId ? null : activity.id)}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-move ${rowStatus.bgColor} ${
                      draggedActivity?.id === activity.id ? 'opacity-50' : ''
                    } ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500' : ''}`}
                  >
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                      <div className="flex items-center gap-2">
                        <Move size={12} className="text-slate-400 dark:text-slate-500" />
                        {idx + 1}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{activity.activityName}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">{activity.activityDescription}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{activity.personInChargeName}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${PRIORITY_CONFIG[activity.priority].color}`}>
                        {PRIORITY_CONFIG[activity.priority].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{activity.plannedStartDate}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{activity.plannedEndDate}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{activity.actualStartDate || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{activity.actualEndDate || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${activity.progressPercentage}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{activity.progressPercentage}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {delay > 0 ? (
                        <span className="px-2 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-full text-xs font-semibold">
                          {delay} days
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${STATUS_CONFIG[activity.status].color}`}>
                        {rowStatus.statusIcon} {rowStatus.statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditActivity(activity)}
                          className="p-1.5 text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={async () => { if (await askConfirm({ title: 'Delete this activity?', message: 'This activity will be permanently deleted.', confirmText: 'Delete' })) handleDeleteActivity(activity.id); }}
                          className="p-1.5 text-slate-600 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Activity Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {editingActivity ? 'Edit Activity' : 'Add New Activity'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-600 dark:text-slate-400" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Activity Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.activityName || ''}
                  onChange={(e) => setFormData({ ...formData, activityName: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Enter activity name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Activity Description</label>
                <textarea
                  value={formData.activityDescription || ''}
                  onChange={(e) => setFormData({ ...formData, activityDescription: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  placeholder="Describe the activity..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Person in Charge <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.personInCharge || ''}
                    onChange={(e) => setFormData({ ...formData, personInCharge: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Select person</option>
                    {mockUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Priority <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.priority || 'medium'}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as ActivityPriority })}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                      <option key={key} value={key}>{config.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Planned Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.plannedStartDate || ''}
                    onChange={(e) => setFormData({ ...formData, plannedStartDate: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Planned End Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.plannedEndDate || ''}
                    onChange={(e) => setFormData({ ...formData, plannedEndDate: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Actual Start Date</label>
                  <input
                    type="date"
                    value={formData.actualStartDate || ''}
                    onChange={(e) => setFormData({ ...formData, actualStartDate: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Actual End Date</label>
                  <input
                    type="date"
                    value={formData.actualEndDate || ''}
                    onChange={(e) => setFormData({ ...formData, actualEndDate: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                  <select
                    value={formData.status || 'not_started'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as ActivityStatus })}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                      <option key={key} value={key}>{config.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Progress (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.progressPercentage || 0}
                    onChange={(e) => setFormData({ ...formData, progressPercentage: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Remarks</label>
                <textarea
                  value={formData.remarks || ''}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  placeholder="Additional notes..."
                />
              </div>
            </div>

            <div className="sticky bottom-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveActivity}
                className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                {editingActivity ? 'Update Activity' : 'Save Activity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
