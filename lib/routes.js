/**
 * Router setup for Safe Settings UI & API endpoints
 * Centralizes Express/Next asset & API wiring away from core app logic.
 *
 * Exports:
 *   setupRoutes(robot, getRouter) -> configured router
 *
 * Responsibilities:
 *   - Serve static exported Next.js UI (from ui/out)
 *   - Dashboard HTML entry points
 *   - JSON API endpoints
 *
 * This version removes dependency on robot-level cached installation getters
 * (`robot.getCachedInstallations`, `robot.getOrganizationLogins`) and instead
 * fetches installations live per request. If performance becomes an issue,
 * a lightweight in-module memoization layer with short TTL can be reintroduced.
 */

const path = require('path')
const fs = require('fs')
const express = require('express')
const env = require('./env')
const { getInstallations: cacheGetInstallations, getOrgLogins, getLastFetchedAt } = require('./installationCache')

// Lightweight commit metadata cache (path+ref -> meta) with TTL to avoid
// repeated GitHub commit lookups across requests.
const COMMIT_META_TTL_MS = parseInt(process.env.COMMIT_META_TTL_MS || '300000') // 5m default
const _commitMetaCache = new Map() // key => { meta, expiresAt }
function getCachedCommitMeta(key) {
  const entry = _commitMetaCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { _commitMetaCache.delete(key); return null }
  return entry.meta
}
function setCachedCommitMeta(key, meta) {
  _commitMetaCache.set(key, { meta, expiresAt: Date.now() + COMMIT_META_TTL_MS })
}

function setupRoutes(robot, getRouter) {
  // Root-level mount (can be changed to '/dashboard' if desired)
  const router = getRouter('/')

  // Static assets: produced by Next export/build step (ui/out)
  const rootDir = path.join(__dirname, '..') // lib -> project root
  const uiPath = path.join(rootDir, 'ui', 'out')
  router.use(express.static(uiPath))

  // HTML entrypoints (exported files). Adjust if you move/rename pages.
  router.get('/dashboard', (req, res) => {
    res.sendFile(path.join(uiPath, 'dashboard.html'))
  })

  router.get('/dashboard/organizations', (req, res) => {
    res.sendFile(path.join(uiPath, 'dashboard', 'organizations.html'))
  })

  router.get('/dashboard/settings', (req, res) => {
    res.sendFile(path.join(uiPath, 'dashboard', 'settings.html'))
  })

  router.get('/dashboard/safe-settings-hub', (req, res) => {
    res.sendFile(path.join(uiPath, 'dashboard', 'safe-settings-hub.html'))
  })

  router.get('/dashboard/env', (req, res) => {
    res.sendFile(path.join(uiPath, 'dashboard', 'env.html'))
  })

  // Apple touch icon (silence 404s). Replace file logic if you add a real 180x180 asset.
  const APPLE_TOUCH_ICON_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAQAAAA9zQYyAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==' // 180x180 transparent PNG
  router.get('/apple-touch-icon.png', (req, res) => {
    // If a real file exists at project root, serve it; otherwise fallback to embedded transparent PNG.
    const filePath = path.join(rootDir, 'apple-touch-icon.png')
    fs.access(filePath, fs.constants.R_OK, (err) => {
      if (!err) {
        return res.sendFile(filePath)
      }
      const buf = Buffer.from(APPLE_TOUCH_ICON_BASE64, 'base64')
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
      res.send(buf)
    })
  })

  /**
   * GET /api/organizations
   * Returns live organization installation metadata + optional last commit info.
   * Query param: disableActivity=true to skip commit lookups (faster).
   */
  router.get('/api/organizations', async (req, res) => {
    const disableActivity = req.query.disableActivity === 'true'
    const includeActivity = !disableActivity
    try {
      const installs = await cacheGetInstallations(robot)
      const orgLogins = getOrgLogins()
      const orgInstalls = installs.filter(i => i.account && i.account.type === 'Organization')
      const installationDtos = orgInstalls.map(i => ({ id: i.id, account: i.account.login, type: i.account.type, created_at: i.created_at }))

      const lastCommits = {}
      if (includeActivity) {
        const adminRepoName = env.ADMIN_REPO
        if (adminRepoName) {
          try {
            const orgs = orgLogins
            const limit = 5
            const queue = [...orgs]
            const runners = []
            const runNext = async () => {
              while (queue.length) {
                const org = queue.shift()
                try {
                  const install = installs.find(i => i.account && i.account.login.toLowerCase() === org.toLowerCase())
                  if (!install) {
                    lastCommits[org] = { na: true }
                    continue
                  }
                  const githubOrg = await robot.auth(install.id)
                  const pathPrefix = `${env.CONFIG_PATH.replace(/\/$/, '')}/organizations/${org}`
                  let commits
                  try {
                    commits = await githubOrg.repos.listCommits({ owner: org, repo: adminRepoName, per_page: 1, path: pathPrefix })
                  } catch (err) {
                    if (err.status === 404) {
                      // Repo or path not found -> NA for repository
                      lastCommits[org] = { na: true }
                      continue
                    }
                    if (err.status === 409) { // empty repo
                      lastCommits[org] = null
                      continue
                    }
                    robot.log && robot.log.warn && robot.log.warn(`Commit lookup error for ${org}/${adminRepoName}: ${err.message}`)
                    lastCommits[org] = null
                    continue
                  }
                  if (Array.isArray(commits.data) && commits.data.length) {
                    const c = commits.data[0]
                    const committedAt = (c.commit && c.commit.author && c.commit.author.date) || null
                    const ageSeconds = committedAt ? Math.floor((Date.now() - new Date(committedAt).getTime()) / 1000) : null
                    lastCommits[org] = { sha: c.sha, committed_at: committedAt, message: c.commit && c.commit.message ? c.commit.message.split('\n')[0] : null, age_seconds: ageSeconds }
                  } else {
                    lastCommits[org] = null
                  }
                } catch (loopErr) {
                  robot.log && robot.log.warn && robot.log.warn(`Unexpected error gathering commit for org ${org}: ${loopErr.message}`)
                  lastCommits[org] = null
                }
              }
            }
            for (let i = 0; i < limit; i++) runners.push(runNext())
            await Promise.all(runners)
          } catch (activityErr) {
            // On failure mark all orgs as NA and log warning
            orgLogins.forEach(o => { lastCommits[o] = { na: true } })
            robot.log && robot.log.warn && robot.log.warn(`Failed gathering last commit activity: ${activityErr.message}`)
          }
        } else {
          orgLogins.forEach(o => { lastCommits[o] = { na: true } })
        }
      }

      return res.json({ updatedAt: new Date().toISOString(), organizations: orgLogins, installations: installationDtos, lastCommits: includeActivity ? lastCommits : undefined })
    } catch (e) {
      robot.log && robot.log.error && robot.log.error(e)
      res.status(500).json({ error: e.message || 'unexpected error' })
    }
  })

  /**
   * GET /api/safe-settings-hub/contents/*
   * Fetches a file or directory listing from the SAFE_SETTINGS_HUB_ORG / SAFE_SETTINGS_HUB_REPO
   * under the configured CONFIG_PATH (default .github).
   *
   * Examples:
   *   /api/safe-settings-hub/contents/                -> list CONFIG_PATH root
   *   /api/safe-settings-hub/contents/repos/foo.yml   -> get specific file
  *   /api/safe-settings-hub/contents/repos?ref=main  -> list directory at ref
  *   /api/safe-settings-hub/contents?recursive=true&maxDepth=2&fetchContent=false -> recursive listing without file bodies
  * Note: recursive now defaults to true. Pass recursive=false for single-level listing.
   */
  async function hubContent(req, res) {
    try {
      // Use cached installations (TTL-based freshness)
      const installs = await cacheGetInstallations(robot)
      const install = installs.find(i => i.account && i.account.type === 'Organization' && i.account.login.toLowerCase() === env.SAFE_SETTINGS_HUB_ORG.toLowerCase())
      if (!install) {
        return res.status(404).json({ error: `Installation for org ${env.SAFE_SETTINGS_HUB_ORG} not found` })
      }

      const github = await robot.auth(install.id)
      const wildcardPath = req.params[0] || '' // from the * in the route
      const ref = req.query.ref || 'main'
      const fullPath = wildcardPath ? path.posix.join(env.CONFIG_PATH, wildcardPath) : env.CONFIG_PATH
      // recursive defaults to true unless explicitly disabled with recursive=false
      const recursive = (req.query.recursive === 'false') ? false : true
      let maxDepth = parseInt(req.query.maxDepth, 5)
      if (isNaN(maxDepth) || maxDepth < 1) maxDepth = 5 // safety default
      if (maxDepth > 8) maxDepth = 5 // hard cap to avoid abuse
      // Unified flag: fetchContent (default true). No other legacy params supported.
      const fetchContent = req.query.fetchContent === 'false' ? false : true

      // Commit metadata fetch with global shared cache + per-request memoization
      const perRequestCommitCache = new Map()
      const fetchCommitMeta = async (p) => {
        if (perRequestCommitCache.has(p)) return perRequestCommitCache.get(p)
        const cacheKey = `${ref}::${p}`
        const cached = getCachedCommitMeta(cacheKey)
        if (cached) { perRequestCommitCache.set(p, cached); return cached }
        let meta
        try {
          const commits = await github.repos.listCommits({ owner: env.SAFE_SETTINGS_HUB_ORG, repo: env.SAFE_SETTINGS_HUB_REPO, per_page: 1, path: p })
            .then(r => Array.isArray(r.data) ? r.data : [])
          if (commits.length) {
            const c = commits[0]
            const committedAt = c.commit && c.commit.author && c.commit.author.date
            const ageSeconds = committedAt ? Math.floor((Date.now() - new Date(committedAt).getTime()) / 1000) : null
            meta = {
              lastCommitSha: c.sha,
              lastCommitAt: committedAt,
              lastCommitMessage: c.commit && c.commit.message ? c.commit.message.split('\n')[0] : null,
              lastCommitAgeSeconds: ageSeconds
            }
          } else {
            meta = { lastCommitSha: null, lastCommitAt: null, lastCommitMessage: null, lastCommitAgeSeconds: null }
          }
        } catch {
          meta = { lastCommitSha: null, lastCommitAt: null, lastCommitMessage: null, lastCommitAgeSeconds: null }
        }
        setCachedCommitMeta(cacheKey, meta)
        perRequestCommitCache.set(p, meta)
        return meta
      }

      // Helper to fetch a single file (returns null on failure)
      const fetchFile = async (p) => {
        try {
          const fileResp = await github.repos.getContent({ owner: env.SAFE_SETTINGS_HUB_ORG, repo: env.SAFE_SETTINGS_HUB_REPO, path: p, ref })
          if (Array.isArray(fileResp.data)) return null
          // file
          const commitMeta = await fetchCommitMeta(fileResp.data.path)
          if (fetchContent && typeof fileResp.data.content === 'string') {
            const decoded = Buffer.from(fileResp.data.content, fileResp.data.encoding || 'base64').toString('utf8')
            return {
              type: fileResp.data.type,
              name: path.posix.basename(p),
              path: fileResp.data.path,
              sha: fileResp.data.sha,
              size: fileResp.data.size,
              encoding: 'utf8',
              content: decoded,
              originalEncoding: fileResp.data.encoding || 'base64',
              ...commitMeta
            }
          }
          // metadata-only response
          return {
            type: fileResp.data.type,
            name: path.posix.basename(p),
            path: fileResp.data.path,
            sha: fileResp.data.sha,
            size: fileResp.data.size,
            content: null,
            originalEncoding: fileResp.data.encoding || 'base64',
            ...commitMeta
          }
        } catch (e) {
          robot.log && robot.log.warn && robot.log.warn(`Failed to fetch file ${p}: ${e.message}`)
          return null
        }
      }

      // Recursive traversal with depth limiting and basic cycle protection
      const seen = new Set()
      // Concurrency limiter for directory entry processing
      const MAX_DIR_CONCURRENCY = parseInt(process.env.DIR_ENTRY_CONCURRENCY || '6')
      async function mapWithLimit(items, mapper) {
        const out = []
        let i = 0
        const running = new Set()
        async function run() {
          if (i >= items.length) return
          const idx = i++
            const p = Promise.resolve(mapper(items[idx], idx)).then(r => { out[idx] = r; running.delete(p) })
          running.add(p)
          if (running.size >= MAX_DIR_CONCURRENCY) await Promise.race(running)
          return run()
        }
        await run()
        await Promise.all([...running])
        return out
      }

      const traverseDir = async (dirPath, depth = 0) => {
        if (depth >= maxDepth) {
          const commitMeta = await fetchCommitMeta(dirPath)
          return { type: 'dir', name: path.posix.basename(dirPath), path: dirPath, depth, truncated: true, entries: [], ...commitMeta }
        }
        if (seen.has(dirPath)) {
          const commitMeta = await fetchCommitMeta(dirPath)
          return { type: 'dir', name: path.posix.basename(dirPath), path: dirPath, depth, cycle: true, entries: [], ...commitMeta }
        }
        seen.add(dirPath)
        let listing
        try {
          const resp = await github.repos.getContent({ owner: env.SAFE_SETTINGS_HUB_ORG, repo: env.SAFE_SETTINGS_HUB_REPO, path: dirPath, ref })
          if (!Array.isArray(resp.data)) {
            // Not a directory; fetch as file instead
            const f = await fetchFile(dirPath)
            return f || { type: 'file', path: dirPath, error: 'unreadable' }
          }
          listing = resp.data
        } catch (e) {
          const commitMeta = await fetchCommitMeta(dirPath)
          return { type: 'dir', name: path.posix.basename(dirPath), path: dirPath, error: e.status === 404 ? 'not_found' : e.message, entries: [], ...commitMeta }
        }

        const entries = await mapWithLimit(listing, async (item) => {
          if (item.type === 'file') {
            if (fetchContent) {
              const f = await fetchFile(item.path)
              if (f) return f
              const commitMeta = await fetchCommitMeta(item.path)
              return { type: 'file', name: item.name, path: item.path, sha: item.sha, size: item.size, content: null, ...commitMeta }
            }
            const commitMeta = await fetchCommitMeta(item.path)
            return { type: 'file', name: item.name, path: item.path, sha: item.sha, size: item.size, content: null, ...commitMeta }
          } else if (item.type === 'dir') {
            return traverseDir(item.path, depth + 1)
          }
          const commitMeta = await fetchCommitMeta(item.path)
          return { type: item.type, name: item.name, path: item.path, unsupported: true, ...commitMeta }
        })
        const commitMeta = await fetchCommitMeta(dirPath)
        return { type: 'dir', name: path.posix.basename(dirPath), path: dirPath, depth, entries, ...commitMeta }
      }

      const response = await github.repos.getContent({
        owner: env.SAFE_SETTINGS_HUB_ORG,
        repo: env.SAFE_SETTINGS_HUB_REPO,
        path: fullPath,
        ref
      })

      const data = response.data
      if (Array.isArray(data)) {
        if (recursive) {
          const tree = await traverseDir(fullPath, 0)
          return res.json({
            recursive: true,
            maxDepth,
            ref: ref,
            fetchContent,
            ...tree
          })
        } else {
          // non-recursive (original behavior)
          const entries = await Promise.all(data.map(async d => {
            if (d.type === 'file') {
              if (fetchContent) {
                const f = await fetchFile(d.path)
                if (f) return f
              }
              return {
                name: d.name,
                path: d.path,
                type: d.type,
                sha: d.sha,
                size: d.size,
                content: null
              }
            }
            return {
              name: d.name,
              path: d.path,
              type: d.type,
              sha: d.sha,
              size: d.size,
              content: null
            }
          }))
          return res.json({
            type: 'dir',
            path: fullPath,
            entries,
            ref: ref,
            fetchContent
          })
        }
      }

      if (typeof data.content === 'string') {
        if (fetchContent) {
          const decoded = Buffer.from(data.content, data.encoding || 'base64').toString('utf8')
          return res.json({
            type: data.type,
            path: data.path,
            sha: data.sha,
            size: data.size,
            encoding: 'utf8',
            content: decoded,
            originalEncoding: data.encoding || 'base64',
            ref,
            fetchContent: true
          })
        }
        return res.json({
          type: data.type,
          path: data.path,
          sha: data.sha,
          size: data.size,
          content: null,
          ref,
          fetchContent: false
        })
      }
      // Unsupported type (symlink, submodule, etc.)
      return res.status(415).json({ error: 'Unsupported content type returned by GitHub API' })
    } catch (e) {
      if (e.status === 404) {
        return res.status(404).json({ error: 'Not found' })
      }
      robot.log && robot.log.error && robot.log.error(e)
      return res.status(500).json({ error: e.message || 'unexpected error' })
    }
  }

  router.get('/api/safe-settings-hub/content', hubContent)
  router.get('/api/safe-settings-hub/content/*', hubContent)

  /**
   * GET /api/settings/env
   * Returns key/value pairs parsed from the project .env file excluding
   * standard GitHub App infrastructure variables.
   * Query params:
   *   includeInfra=true  -> include normally excluded infrastructure vars
   */
  router.get('/api/settings/env', (req, res) => {
    try {
      // Pull from the runtime env module (already merges defaults + process.env)
      const exclude = new Set([
        'APP_ID', 'WEBHOOK_SECRET', 'PRIVATE_KEY_PATH', 'WEBHOOK_PROXY_URL', 'LOG_LEVEL',
        'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'PRIVATE_KEY', 'NODE_ENV'
      ])
      const includeInfra = req.query.includeInfra === 'true'
      // env object contains only the app's known config keys; supplement with a few additional custom vars from process.env if needed
      const baseEntries = Object.entries(env)
      const extraKeys = ['ENABLE_PR_COMMENT', 'SAFE_SETTINGS_HUB_REPO', 'SAFE_SETTINGS_HUB_ORG']
      extraKeys.forEach(k => {
        if (!(k in env) && process.env[k] !== undefined) baseEntries.push([k, process.env[k]])
      })
      const variables = baseEntries
        .filter(([k]) => includeInfra || !exclude.has(k))
        .map(([key, value]) => ({ key, value }))
        .sort((a, b) => a.key.localeCompare(b.key))
      return res.json({ updatedAt: new Date().toISOString(), count: variables.length, variables })
    } catch (e) {
      robot.log && robot.log.error && robot.log.error(e)
      return res.status(500).json({ error: e.message || 'unexpected error' })
    }
  })

  // Cache metadata endpoint
  router.get('/api/meta/installations', async (req, res) => {
    try {
      const installs = await cacheGetInstallations(robot)
      const orgs = getOrgLogins()
      const last = getLastFetchedAt()
      return res.json({
        installations: installs.length,
        organizations: orgs.length,
        lastFetchedAt: last ? last.toISOString() : null,
        ttlMs: process.env.INSTALLATION_CACHE_TTL_MS || '60000'
      })
    } catch (e) {
      robot.log && robot.log.error && robot.log.error(e)
      return res.status(500).json({ error: e.message })
    }
  })

  return router
}

module.exports = { setupRoutes }
