'use client';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { SearchIcon, SyncIcon, FileIcon, FileDirectoryIcon, ChevronUpIcon, ChevronDownIcon, ChevronRightIcon } from '@primer/octicons-react';
import { useHydrated } from '../hooks/useHydrated';

// Simple mock tree used when API returns 404 (dev convenience)
const MOCK_TREE = {
  name: '.github',
  path: '.github',
  type: 'dir',
  lastCommitAt: new Date(Date.now() - 3600 * 1000).toISOString(),
  entries: [
    {
      name: 'settings.yml',
      path: '.github/settings.yml',
      type: 'file',
      lastCommitAt: new Date(Date.now() - 1800 * 1000).toISOString(),
      lastCommitMessage: 'chore: mock settings',
      lastCommitSha: 'mock123'
    },
    {
      name: 'CODEOWNERS',
      path: '.github/CODEOWNERS',
      type: 'file',
      lastCommitAt: new Date(Date.now() - 7200 * 1000).toISOString(),
      lastCommitMessage: 'feat: add mock CODEOWNERS',
      lastCommitSha: 'mock456'
    },
    {
      name: 'workflows',
      path: '.github/workflows',
      type: 'dir',
      lastCommitAt: new Date(Date.now() - 5400 * 1000).toISOString(),
      entries: [
        {
          name: 'ci.yml',
          path: '.github/workflows/ci.yml',
          type: 'file',
          lastCommitAt: new Date(Date.now() - 2500 * 1000).toISOString(),
          lastCommitMessage: 'ci: mock workflow',
          lastCommitSha: 'mock789'
        }
      ]
    }
  ]
};

export default function SafeSettingsHubContent() {
  const hydrated = useHydrated();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rootTree, setRootTree] = useState(null); // recursive tree response
  const [search, setSearch] = useState('');
  // Tree view removed; we now render a flattened table.
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null }); // direction: 'asc' | 'desc' | null
  const [expandedPaths, setExpandedPaths] = useState(() => new Set()); // which directory paths are expanded

  const fetchData = () => {
    if (!hydrated) return;
    setLoading(true); setError(null);
  // Always ask for recursive tree; server may limit depth
  // Explicitly request content bodies (fetchContent=true is default but sent for clarity)
  fetch('/api/safe-settings-hub/content?fetchContent=true')
      .then(r => {
        if (!r.ok) {
          // Surface a clear error message instead of falling back to mock data
          throw new Error(`Unable to retrieve safe-settings hub content (HTTP ${r.status}). Please try again later.`);
        }
        return r.json();
      })
      .then(json => {
        // On success set the returned tree
        setRootTree(json);
        setLastFetchedAt(new Date());
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [hydrated]);

  // Flatten nodes for table display
  const flattenNodes = useCallback((node, acc = [], depth = 0) => {
    if (!node) return acc;
    acc.push({
      name: node.name,
      path: node.path,
      type: node.type,
      lastCommitAt: node.lastCommitAt,
      lastCommitMessage: node.lastCommitMessage,
      lastCommitSha: node.lastCommitSha,
      depth
    });
    if (node.type === 'dir' && Array.isArray(node.entries)) {
      node.entries.forEach(child => flattenNodes(child, acc, depth + 1));
    }
    return acc;
  }, []);

  const filterTree = useCallback((node) => {
    if (!node) return null;
    const term = search.toLowerCase();
    const matches = (n) => !term || n.name.toLowerCase().includes(term) || n.path.toLowerCase().includes(term);
    if (node.type === 'file') {
      return matches(node) ? node : null;
    }
    if (node.type === 'dir') {
      const children = (node.entries || []).map(filterTree).filter(Boolean);
      if (matches(node) || children.length > 0) {
        return { ...node, entries: children };
      }
      return null;
    }
    return null;
  }, [search]);

  const filteredTree = useMemo(() => filterTree(rootTree), [rootTree, filterTree]);

  // If the root contains a top-level 'safe-settings' directory, treat that directory as the display root
  const displayTree = useMemo(() => {
    if (!filteredTree) return null;
    if (filteredTree.type === 'dir') {
      const nameMatch = (n) => n && n.type === 'dir' && n.name && n.name.toLowerCase().includes('safe-settings');
      // Prefer immediate child named 'safe-settings'
      const immediate = (filteredTree.entries || []).find(nameMatch);
      if (immediate) return immediate;
      // Fallback: search descendants up to a small depth for 'safe-settings'
      const findDescendant = (node, depth = 0, maxDepth = 3) => {
        if (!node || node.type !== 'dir' || depth >= maxDepth) return null;
        for (const child of node.entries || []) {
          if (nameMatch(child)) return child;
        }
        for (const child of node.entries || []) {
          if (child.type === 'dir') {
            const found = findDescendant(child, depth + 1, maxDepth);
            if (found) return found;
          }
        }
        return null;
      };
      const found = findDescendant(filteredTree, 0, 3);
      if (found) return found;
    }
    return filteredTree;
  }, [filteredTree]);

  // When a search filter is applied, auto-expand all ancestor directories that contain matches
  useEffect(() => {
    if (!search) return; // only on active filter
    if (!displayTree || displayTree.type !== 'dir') return;
    const dirsToExpand = new Set();
    const walk = (node) => {
      if (!node || node.type !== 'dir') return false;
      let containsMatch = false;
      for (const child of node.entries || []) {
        if (child.type === 'dir') {
          if (walk(child)) {
            containsMatch = true;
            dirsToExpand.add(child.path); // expand child dir to show deeper matches
          }
        } else {
          // Any file present means this dir should be opened if it passed filtering
          containsMatch = true;
        }
      }
      return containsMatch;
    };
    walk(displayTree);
    // Also expand top-level dirs that survived filtering and have entries
    (displayTree.entries || []).forEach(e => { if (e.type === 'dir') dirsToExpand.add(e.path); });
    setExpandedPaths(prev => {
      const next = new Set(prev);
      dirsToExpand.forEach(p => next.add(p));
      return next;
    });
  }, [search, displayTree]);

  const flatList = useMemo(() => {
    if (!displayTree) return [];
    // If display root is a directory, list its children instead of the directory itself (hide intermediate root)
    if (displayTree.type === 'dir') {
      return displayTree.entries.flatMap(child => flattenNodes(child, [], 0));
    }
    return flattenNodes(displayTree, [], 0);
  }, [displayTree, flattenNodes]);

  // Build hierarchical visible list honoring expandedPaths and optional sorting
  const sortedFlatList = useMemo(() => {
    if (!displayTree) return [];
    // function to sort entries inside a directory when sorting enabled
    const sortEntries = (entries) => {
      if (!sortConfig.key || !sortConfig.direction) return entries;
      const key = sortConfig.key;
      return [...entries].sort((a, b) => {
        let av; let bv;
        switch (key) {
          case 'name': av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
          case 'path': av = a.path.toLowerCase(); bv = b.path.toLowerCase(); break;
          case 'lastCommitAt': av = a.lastCommitAt ? new Date(a.lastCommitAt).getTime() : 0; bv = b.lastCommitAt ? new Date(b.lastCommitAt).getTime() : 0; break;
          default: av = a[key]; bv = b[key];
        }
        if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1;
        if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    };
    const out = [];
    const process = (node, depth) => {
      if (!node) return;
      if (node.type === 'dir') {
        const children = sortEntries(node.entries || []);
        children.forEach(child => {
          out.push({
            name: child.name,
            path: child.path,
            type: child.type,
            lastCommitAt: child.lastCommitAt,
            lastCommitMessage: child.lastCommitMessage,
            lastCommitSha: child.lastCommitSha,
            depth
          });
          if (child.type === 'dir' && expandedPaths.has(child.path)) {
            process(child, depth + 1);
          }
        });
      } else {
        out.push({
          name: node.name,
          path: node.path,
          type: node.type,
          lastCommitAt: node.lastCommitAt,
          lastCommitMessage: node.lastCommitMessage,
          lastCommitSha: node.lastCommitSha,
          depth
        });
      }
    };
    // Start processing at displayTree (hiding any intermediate 'safe-settings' wrapper)
    process(displayTree, 0);
    return out;
  }, [displayTree, sortConfig, expandedPaths]);

  const cycleSort = (key) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        if (prev.direction === 'desc') return { key: null, direction: null }; // clear
      }
      return { key, direction: 'asc' };
    });
  };

  const renderSortIcon = (key) => {
    if (sortConfig.key !== key) return <span className="text-muted ms-1" style={{ opacity: 0.3 }}>↕</span>;
    if (sortConfig.direction === 'asc') return <ChevronUpIcon size={14} className="ms-1" />;
    if (sortConfig.direction === 'desc') return <ChevronDownIcon size={14} className="ms-1" />;
    return <span className="text-muted ms-1" style={{ opacity: 0.3 }}>↕</span>;
  };

  const toggleDir = (path) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const collectAllDirPaths = useCallback((node, acc = []) => {
    if (!node) return acc;
    if (node.type === 'dir') {
      if (node.path && node.path !== '.github') acc.push(node.path); // skip synthetic root label
      (node.entries || []).forEach(child => collectAllDirPaths(child, acc));
    }
    return acc;
  }, []);

  const expandAll = () => {
    if (!filteredTree) return;
    const all = collectAllDirPaths(filteredTree, []);
    setExpandedPaths(new Set(all));
  };

  const collapseAll = () => setExpandedPaths(new Set());

  const formatRelative = (iso) => {
    if (!iso) return null;
    const dt = new Date(iso);
    let diffSec = Math.floor((Date.now() - dt.getTime()) / 1000);
    if (diffSec < 0) diffSec = 0;
    if (diffSec < 60) return '0m';
    const mTotal = Math.floor(diffSec / 60);
    if (mTotal < 60) return `${mTotal}m`;
    const hTotal = Math.floor(mTotal / 60);
    if (hTotal < 24) {
      const remM = mTotal % 60;
      return remM ? `${hTotal}h ${remM}m` : `${hTotal}h`;
    }
    const dTotal = Math.floor(hTotal / 24);
    const remH = hTotal % 24;
    return remH ? `${dTotal}d ${remH}h` : `${dTotal}d`;
  };

  // Table columns: Name (indented), Path, Type, Last update

  return (
    <>
    <div className="ui-table">
      <div className="row g-3 align-items-end mb-3">
        <div className="col-md-4">
          <div className="input-group">
              <span className="input-group-text theme-bg-secondary theme-border">
                <SearchIcon size={14} />
              </span>
              <input
                type="text"
                className="form-control theme-bg-primary theme-text-primary theme-border"
                placeholder="Filter by name or path"
                value={search}
                onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="col-md-8 text-end d-flex justify-content-end ms-auto" style={{ gap: '0.5rem' }}>
          <div className="btn-group btn-group-sm" role="group">
            <button className="btn btn-outline-secondary" onClick={fetchData} disabled={loading}>
              <SyncIcon size={14} className={loading ? 'spin' : ''} /> Refresh
            </button>
            <button className="btn btn-outline-secondary" onClick={collapseAll} disabled={expandedPaths.size === 0}>Collapse all</button>
            <button className="btn btn-outline-secondary" onClick={expandAll} disabled={!displayTree || (expandedPaths.size > 0 && expandedPaths.size === collectAllDirPaths(displayTree, []).length)}>Expand all</button>
          </div>
        </div>
      </div> 
        
      {/* <div className="mb-4">
        <div className="row">
          <div className="col-md-6">
            <div className="input-group">
              <span className="input-group-text theme-bg-secondary theme-border">
                <SearchIcon size={14} className="theme-text-secondary" />
              </span>
              <input
                type="text"
                className="form-control theme-bg-primary theme-text-primary theme-border"
                placeholder="Search organizations..."
                value={search}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="col-md-6 text-end">
            <span className="theme-text-secondary small">
              Showing {sortedData.length} of {data.length} organizations
            </span>
          </div>
        </div>
      </div> */}
        
      {loading && <div className="py-4 text-center theme-text-secondary">Loading…</div>}
      {error && !loading && <div className="alert alert-danger py-2">Error: {error}</div>}
  {!loading && !error && !displayTree && <div className="py-4 text-center theme-text-secondary">No entries</div>}

      {!loading && !error && displayTree && (
        <div className="mb-2">
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0 theme-bg-primary">
              <thead className="small">
                <tr className="theme-bg-secondary">
                  <th role="button" onClick={() => cycleSort('name')} className="theme-text-primary user-select-none" style={{ width: '35%', cursor: 'pointer' }}>Name {renderSortIcon('name')}</th>
                  <th role="button" onClick={() => cycleSort('path')} className="theme-text-primary user-select-none" style={{ cursor: 'pointer' }}>Path {renderSortIcon('path')}</th>
                  <th role="button" onClick={() => cycleSort('lastCommitAt')} className="theme-text-primary user-select-none" style={{ width: '170px', cursor: 'pointer' }}>Last update {renderSortIcon('lastCommitAt')}</th>
                </tr>
              </thead>
              <tbody className="small">
                {sortedFlatList.map(node => {
                  const isDir = node.type === 'dir';
                  const expanded = isDir && expandedPaths.has(node.path);
                  return (
                    <tr key={node.path} className={isDir ? 'cursor-pointer' : ''} onClick={() => isDir && toggleDir(node.path)} style={isDir ? { cursor: 'pointer' } : undefined}>
                      <td className="fw-semibold text-break">
                        <span style={{ paddingLeft: node.depth * 14 }} className="d-inline-flex align-items-center">
                          {isDir ? (
                            expanded ? <ChevronDownIcon size={14} className="me-1" /> : <ChevronRightIcon size={14} className="me-1" />
                          ) : (
                            <FileIcon className="me-1" size={14} />
                          )}
                          {isDir && <FileDirectoryIcon size={14} className="me-1 opacity-50" />}
                          {node.name}
                        </span>
                      </td>
                      <td className="text-break"><code>{node.path}</code></td>
                      <td className="text-muted text-nowrap" title={node.lastCommitAt ? `${new Date(node.lastCommitAt).toLocaleString()}${node.lastCommitMessage ? '\n' + node.lastCommitMessage : ''}${node.lastCommitSha ? '\nSHA: ' + node.lastCommitSha.slice(0,7) : ''}` : ''}>
                        {node.lastCommitAt ? formatRelative(node.lastCommitAt) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
    {!loading && !error && (
      <div className="mt-2 d-flex justify-content-between align-items-center small text-muted" style={{ gap: '1rem' }}>
  <span>{sortedFlatList.length} items shown</span>
        {lastFetchedAt && <span>Fetched {lastFetchedAt.toLocaleTimeString()}</span>}
      </div>
    )}
  {/* Removed inner bordered wrapper styles so only outer page container shows a border */}
    </>
  );
}
