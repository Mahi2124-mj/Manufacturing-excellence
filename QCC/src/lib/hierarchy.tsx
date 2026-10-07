// ─── Department Hierarchy = single source of truth for departments/sub-depts ─
// Admin → Dept Hierarchy edits this; the Team Registration form reads its
// department + sub-department dropdowns from here, so adding/deleting in the
// hierarchy instantly reflects in the form. Seeded from the ACTUAL data the
// Team Registration form used (DEPARTMENTS + SUB_DEPARTMENTS), not the dummy
// mock tree. Persisted to localStorage + synced across tabs.
import {
  createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode,
} from 'react';
import { DEPARTMENTS, SUB_DEPARTMENTS } from './data';
import type { SubDepartment } from '../types';

const STORAGE_KEY = 'qcc-hierarchy';

interface HierarchyState { departments: string[]; nodes: SubDepartment[]; }

// Seed from the form's real data: every department + its sub-departments as nodes.
function seed(): HierarchyState {
  const nodes: SubDepartment[] = [];
  Object.entries(SUB_DEPARTMENTS).forEach(([dept, subs]) => {
    subs.forEach((name, i) => nodes.push({
      id: `sd-${dept.replace(/[^\w]+/g, '')}-${i}`, name, parentId: dept, level: 'sub_department', isActive: true,
    }));
  });
  return { departments: [...DEPARTMENTS], nodes };
}

function load(): HierarchyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p?.departments) && Array.isArray(p?.nodes)) return p as HierarchyState; }
  } catch { /* fall through */ }
  return seed();
}

// Remove a node id and every descendant (sub-dept → its lines).
function removeSubtree(nodes: SubDepartment[], rootId: string): SubDepartment[] {
  const remove = new Set<string>([rootId]);
  let grew = true;
  while (grew) { grew = false; for (const n of nodes) if (remove.has(n.parentId) && !remove.has(n.id)) { remove.add(n.id); grew = true; } }
  return nodes.filter(n => !remove.has(n.id));
}

let _uid = 0;
const nid = (p: string) => `${p}-${Date.now().toString(36)}-${_uid++}`;

interface Ctx {
  departments: string[];
  nodes: SubDepartment[];
  subDeptsOf: (dept: string) => string[];          // active sub-department NAMES (for the form dropdown)
  linesOf: (subDeptId: string) => SubDepartment[];
  addDepartment: (name: string) => void;
  deleteDepartment: (name: string) => void;
  addNode: (name: string, parentId: string, level: 'sub_department' | 'line') => void;
  updateNode: (id: string, name: string) => void;
  deleteNode: (id: string) => void;
  toggleNode: (id: string) => void;
}

const C = createContext<Ctx | null>(null);

export function HierarchyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HierarchyState>(load);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) setState(load()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const commit = useCallback((updater: (prev: HierarchyState) => HierarchyState) => {
    setState(prev => {
      const next = updater(prev);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const addDepartment = useCallback((name: string) => {
    const n = name.trim();
    if (!n) return;
    commit(p => (p.departments.some(d => d.toLowerCase() === n.toLowerCase()) ? p : { ...p, departments: [...p.departments, n] }));
  }, [commit]);

  const deleteDepartment = useCallback((name: string) => {
    commit(p => ({ departments: p.departments.filter(d => d !== name), nodes: removeSubtree(p.nodes, name) }));
  }, [commit]);

  const addNode = useCallback((name: string, parentId: string, level: 'sub_department' | 'line') => {
    const nm = name.trim();
    if (!nm || !parentId) return;
    commit(p => ({ ...p, nodes: [...p.nodes, { id: nid(level === 'sub_department' ? 'sd' : 'ln'), name: nm, parentId, level, isActive: true }] }));
  }, [commit]);

  const updateNode = useCallback((id: string, name: string) => {
    const nm = name.trim();
    if (!nm) return;
    commit(p => ({ ...p, nodes: p.nodes.map(n => (n.id === id ? { ...n, name: nm } : n)) }));
  }, [commit]);

  const deleteNode = useCallback((id: string) => {
    commit(p => ({ ...p, nodes: removeSubtree(p.nodes, id) }));
  }, [commit]);

  const toggleNode = useCallback((id: string) => {
    commit(p => ({ ...p, nodes: p.nodes.map(n => (n.id === id ? { ...n, isActive: !n.isActive } : n)) }));
  }, [commit]);

  const value = useMemo<Ctx>(() => ({
    departments: state.departments,
    nodes: state.nodes,
    subDeptsOf: (dept: string) => state.nodes.filter(n => n.parentId === dept && n.level === 'sub_department' && n.isActive).map(n => n.name),
    linesOf: (subDeptId: string) => state.nodes.filter(n => n.parentId === subDeptId && n.level === 'line'),
    addDepartment, deleteDepartment, addNode, updateNode, deleteNode, toggleNode,
  }), [state, addDepartment, deleteDepartment, addNode, updateNode, deleteNode, toggleNode]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useHierarchy(): Ctx {
  const ctx = useContext(C);
  if (!ctx) throw new Error('useHierarchy must be used within a HierarchyProvider');
  return ctx;
}
