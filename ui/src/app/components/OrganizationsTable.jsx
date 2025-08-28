'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { ChevronUpIcon, ChevronDownIcon, SearchIcon } from '@primer/octicons-react';
import { useHydrated } from '../hooks/useHydrated';

// Mock organizations used when /api/organizations returns 404
const MOCK_ORGS = [
  { id: 1, name: 'mock-org-one', lastSyncDate: new Date(Date.now() - 3600 * 1000).toISOString(), lastSyncMessage: 'Initial mock sync', lastSyncSha: 'abcdef1', ageSeconds: 3600 },
  { id: 2, name: 'example-inc', lastSyncDate: new Date(Date.now() - 7200 * 1000).toISOString(), lastSyncMessage: 'Second mock sync', lastSyncSha: 'abcdef2', ageSeconds: 7200 },
  { id: 3, name: 'demo-labs', lastSyncDate: null, lastSyncMessage: null, lastSyncSha: null, ageSeconds: null, na: true }
];

const OrganizationsTable = ({ organizations: propOrganizations = [] }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fetched, setFetched] = useState([]);
  const hydrated = useHydrated();

  // Fetch real organizations from backend API on client hydration
  useEffect(() => {
    if (!hydrated) return; // avoid SSR mismatch
    let cancelled = false;
    setLoading(true);
    fetch('/api/organizations')
      .then(r => {
        if (!r.ok) {
          throw new Error(`Unable to retrieve organizations (HTTP ${r.status}). Please try again later.`);
        }
        return r.json();
      })
      .then(json => {
        if (!json || cancelled) return;
        const lastCommits = json.lastCommits || {}
        const mapped = (json.installations || []).map(i => {
          const lc = lastCommits[i.account];
          return {
            id: i.id,
            name: i.account,
            lastSyncDate: lc && lc.committed_at ? lc.committed_at : null,
            lastSyncSha: lc && lc.sha ? lc.sha : null,
            lastSyncMessage: lc && lc.message ? lc.message : null,
            ageSeconds: lc && typeof lc.age_seconds === 'number' ? lc.age_seconds : null,
            na: lc && lc.na === true
          };
        });
        setFetched(mapped);
        setError(null);
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hydrated]);

  const data = fetched.length > 0 ? fetched : (propOrganizations.length > 0 ? propOrganizations : []);

  // Format date for display with hydration-safe approach
  const formatLastSync = (org) => {
    if (org.na) return <span className="text-muted" title="Admin repo not present">NA</span>;
    if (!org.lastSyncDate) return <span className="text-muted">—</span>;
    const dateObj = new Date(org.lastSyncDate);
    let ageSec = org.ageSeconds;
    if (hydrated && (ageSec == null)) {
      ageSec = Math.floor((Date.now() - dateObj.getTime()) / 1000);
    }
    const rel = (() => {
      if (ageSec == null) return '';
      if (ageSec < 60) return '0m';
      const mTotal = Math.floor(ageSec / 60);
      if (mTotal < 60) return `${mTotal}m`;
      const hTotal = Math.floor(mTotal / 60);
      if (hTotal < 24) {
        const remM = mTotal % 60;
        return remM ? `${hTotal}h ${remM}m` : `${hTotal}h`;
      }
      const dTotal = Math.floor(hTotal / 24);
      const remH = hTotal % 24;
      return remH ? `${dTotal}d ${remH}h` : `${dTotal}d`;
    })();
    const fullStamp = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')} ${String(dateObj.getHours()).padStart(2,'0')}:${String(dateObj.getMinutes()).padStart(2,'0')}:${String(dateObj.getSeconds()).padStart(2,'0')}`;
    const tooltip = [fullStamp, org.lastSyncMessage, org.lastSyncSha ? `SHA: ${org.lastSyncSha.slice(0,7)}` : null]
      .filter(Boolean)
      .join('\n');
    return <span title={tooltip} className="text-nowrap">{rel}</span>;
  };
  const lastSyncColStyle = { width: '170px', fontVariantNumeric: 'tabular-nums' };

  // Filter organizations based on search term
  const filteredData = useMemo(() => {
    return data.filter(org =>
      org.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [data, searchTerm]);

  // Sort organizations
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;

    return [...filteredData].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Convert dates to timestamps for comparison
      if (sortConfig.key === 'lastSyncDate') {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [filteredData, sortConfig]);

  // Handle column sorting
  const handleSort = (key) => {
    setSortConfig(prevConfig => {
      if (prevConfig.key === key) {
        if (prevConfig.direction === 'asc') {
          return { key, direction: 'desc' };
        } else if (prevConfig.direction === 'desc') {
          return { key: null, direction: null };
        }
      }
      return { key, direction: 'asc' };
    });
  };

  // Render sort icon
  const renderSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return <span className="text-muted ms-1" style={{ opacity: 0.3 }}>↕</span>;
    }
    if (sortConfig.direction === 'asc') {
      return <ChevronUpIcon className="ms-1" size={16} />;
    }
    if (sortConfig.direction === 'desc') {
      return <ChevronDownIcon className="ms-1" size={16} />;
    }
    return <span className="text-muted ms-1" style={{ opacity: 0.3 }}>↕</span>;
  };

  return (
    <div className="ui-table">
      {/* Search Bar */}
      <div className="mb-4">
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
                value={searchTerm}
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
      </div>

      {/* Table */}
      <div className="table-responsive">
        <table className="table table-hover theme-bg-primary">
          <thead className="theme-bg-secondary">
            <tr>
              <th 
                className="theme-text-primary sortable-header" 
                style={{ cursor: 'pointer' }}
                onClick={() => handleSort('name')}
              >
                Organization Name
                {renderSortIcon('name')}
              </th>
              <th
                className="theme-text-primary sortable-header"
                style={{ cursor: 'pointer', ...lastSyncColStyle }}
                onClick={() => handleSort('lastSyncDate')}
              >
                Last Safe-settings Sync
                {renderSortIcon('lastSyncDate')}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="2" className="text-center theme-text-secondary py-4">Loading organizations…</td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan="2" className="text-center text-danger py-4">Error: {error}</td>
              </tr>
            )}
            {!loading && !error && sortedData.length > 0 ? (
              sortedData.map((org) => (
                <tr key={org.id} className="theme-hover">
                  <td className="theme-text-primary fw-semibold">
                    {org.name}
                  </td>
                  <td className="theme-text-secondary" style={lastSyncColStyle}>
                    {formatLastSync(org)}
                  </td>
                </tr>
              ))
            ) : (
              !loading && !error && (
                <tr>
                  <td colSpan="2" className="text-center theme-text-secondary py-4">
                    {searchTerm ? `No organizations found matching "${searchTerm}"` : 'No organizations available'}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer Info */}
      {sortedData.length > 0 && (
        <div className="d-flex justify-content-between align-items-center mt-3">
          <small className="theme-text-secondary">
            {searchTerm && `Filtered by: "${searchTerm}"`}
            {sortConfig.key && (
              <span className="ms-2">
                • Sorted by: {sortConfig.key === 'name' ? 'Organization Name' : 'Last Safe-settings Sync'} 
                ({sortConfig.direction === 'asc' ? 'A-Z' : 'Z-A'})
              </span>
            )}
          </small>
        </div>
      )}
    </div>
  );
};

export default OrganizationsTable;
