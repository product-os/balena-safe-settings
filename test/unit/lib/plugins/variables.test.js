const { when } = require('jest-when')
const Variables = require('../../../../lib/plugins/variables')
const NopCommand = require('../../../../lib/nopcommand')

describe('Variables', () => {
  let github
  const org = 'bkeepers'
  const repo = 'test'

  function fillVariables (variables = []) {
    return variables
  }

  function configure (nop = false) {
    const log = { debug: jest.fn(), error: console.error }
    const errors = []
    return new Variables(nop, github, { owner: org, repo }, [{ name: 'test', value: 'test' }], log, errors)
  }

  beforeEach(() => {
    github = {
      request: jest.fn().mockReturnValue(Promise.resolve(true))
    }
  })

  it('sync', () => {
    const plugin = configure()

    when(github.request)
      .calledWith('GET /repos/:org/:repo/actions/variables', { org, repo })
      .mockResolvedValue({
        data: {
          variables: [
            fillVariables({
              variables: []
            })
          ]
        }
      });

    ['variables'].forEach(() => {
      when(github.request)
        .calledWith('GET /repos/:org/:repo/actions/variables', { org, repo })
        .mockResolvedValue({
          data: {
            variables: [{ name: 'DELETE_me', value: 'test' }]
          }
        })
    })

    when(github.request).calledWith('POST /repos/:org/:repo/actions/variables').mockResolvedValue({})

    return plugin.sync().then(() => {
      expect(github.request).toHaveBeenCalledWith('GET /repos/:org/:repo/actions/variables', { org, repo });

      ['variables'].forEach(() => {
        expect(github.request).toHaveBeenCalledWith('GET /repos/:org/:repo/actions/variables', { org, repo })
      })

      expect(github.request).toHaveBeenCalledWith(
        'DELETE /repos/:org/:repo/actions/variables/:variable_name',
        expect.objectContaining({
          org,
          repo,
          variable_name: 'DELETE_me'
        })
      )

      expect(github.request).toHaveBeenCalledWith(
        'POST /repos/:org/:repo/actions/variables',
        expect.objectContaining({
          org,
          repo,
          name: 'TEST',
          value: 'test'
        })
      )
    })
  })

  describe('noop mode', () => {
    describe('sync', () => {
      it('should return NopCommands and not make mutating API calls when nop is true', async () => {
        const plugin = configure(true)

        when(github.request)
          .calledWith('GET /repos/:org/:repo/actions/variables', { org, repo })
          .mockResolvedValue({
            data: {
              variables: [{ name: 'EXISTING_VAR', value: 'existing-value' }]
            }
          })

        const result = await plugin.sync()

        // Should have made GET call to fetch existing variables
        expect(github.request).toHaveBeenCalledWith('GET /repos/:org/:repo/actions/variables', { org, repo })

        // Should NOT have made any mutating calls (POST, PATCH, DELETE)
        expect(github.request).not.toHaveBeenCalledWith(
          expect.stringMatching(/^(POST|PATCH|DELETE)/),
          expect.anything()
        )

        // Result should contain NopCommands
        expect(Array.isArray(result)).toBe(true)
        expect(result.length).toBeGreaterThan(0)
        result.forEach(cmd => expect(cmd).toBeInstanceOf(NopCommand))
      })

      it('should return flat NopCommand array when updating variable value via sync', async () => {
        const log = { debug: jest.fn(), error: console.error }
        const errors = []
        const plugin = new Variables(true, github, { owner: org, repo }, [{ name: 'TEST', value: 'new-value' }], log, errors)

        when(github.request)
          .calledWith('GET /repos/:org/:repo/actions/variables', { org, repo })
          .mockResolvedValue({
            data: {
              variables: [{ name: 'TEST', value: 'old-value' }]
            }
          })

        const result = await plugin.sync()

        // Should have made GET call
        expect(github.request).toHaveBeenCalledWith('GET /repos/:org/:repo/actions/variables', { org, repo })

        // Should NOT have made any mutating calls
        expect(github.request).not.toHaveBeenCalledWith(
          expect.stringMatching(/^(POST|PATCH|DELETE)/),
          expect.anything()
        )

        // Result should be a flat array of NopCommands (not nested)
        expect(Array.isArray(result)).toBe(true)
        result.forEach(cmd => {
          expect(cmd).toBeInstanceOf(NopCommand)
          expect(Array.isArray(cmd)).toBe(false)
        })
      })
    })

    describe('add', () => {
      it('should return NopCommand and not make API call when nop is true', async () => {
        const plugin = configure(true)
        const variable = { name: 'NEW_VAR', value: 'new-value' }

        const result = await plugin.add(variable)

        expect(result).toBeInstanceOf(NopCommand)
        expect(result.plugin).toBe('Variables')
        expect(github.request).not.toHaveBeenCalled()
      })

      it('should make API call when nop is false', async () => {
        const plugin = configure(false)
        const variable = { name: 'NEW_VAR', value: 'new-value' }

        await plugin.add(variable)

        expect(github.request).toHaveBeenCalledWith(
          'POST /repos/:org/:repo/actions/variables',
          expect.objectContaining({
            org,
            repo,
            name: 'NEW_VAR',
            value: 'new-value'
          })
        )
      })
    })

    describe('remove', () => {
      it('should return NopCommand and not make API call when nop is true', async () => {
        const plugin = configure(true)
        const existing = { name: 'EXISTING_VAR', value: 'existing-value' }

        const result = await plugin.remove(existing)

        expect(result).toBeInstanceOf(NopCommand)
        expect(result.plugin).toBe('Variables')
        expect(github.request).not.toHaveBeenCalled()
      })

      it('should make API call when nop is false', async () => {
        const plugin = configure(false)
        const existing = { name: 'EXISTING_VAR', value: 'existing-value' }

        await plugin.remove(existing)

        expect(github.request).toHaveBeenCalledWith(
          'DELETE /repos/:org/:repo/actions/variables/:variable_name',
          expect.objectContaining({
            org,
            repo,
            variable_name: 'EXISTING_VAR'
          })
        )
      })
    })

    describe('update', () => {
      it('should return single NopCommand for single operation with nop true', async () => {
        const plugin = configure(true)
        const existing = { name: 'VAR1', value: 'old-value' }
        const updated = { name: 'VAR1', value: 'new-value' }

        const result = await plugin.update(existing, updated)

        expect(result).toBeInstanceOf(NopCommand)
        expect(result.plugin).toBe('Variables')
        expect(github.request).not.toHaveBeenCalled()
      })

      it('should return single NopCommand when adding new variable in update with nop true', async () => {
        const plugin = configure(true)
        const existing = []
        const updated = [{ name: 'NEW_VAR', value: 'new-value' }]

        const result = await plugin.update(existing, updated)

        expect(result).toBeInstanceOf(NopCommand)
        expect(github.request).not.toHaveBeenCalled()
      })

      it('should return single NopCommand when deleting variable in update with nop true', async () => {
        const plugin = configure(true)
        const existing = [{ name: 'OLD_VAR', value: 'old-value' }]
        const updated = []

        const result = await plugin.update(existing, updated)

        expect(result).toBeInstanceOf(NopCommand)
        expect(github.request).not.toHaveBeenCalled()
      })

      it('should return multiple NopCommands for multiple operations with nop true', async () => {
        const plugin = configure(true)
        const existing = [{ name: 'UPDATE_VAR', value: 'old' }, { name: 'DELETE_VAR', value: 'delete-me' }]
        const updated = [{ name: 'UPDATE_VAR', value: 'new' }, { name: 'ADD_VAR', value: 'added' }]

        const result = await plugin.update(existing, updated)

        expect(Array.isArray(result)).toBe(true)
        expect(result).toHaveLength(3) // 1 update + 1 add + 1 delete
        result.forEach(cmd => expect(cmd).toBeInstanceOf(NopCommand))
        expect(github.request).not.toHaveBeenCalled()
      })

      it('should make API calls when nop is false', async () => {
        const plugin = configure(false)
        const existing = [{ name: 'VAR1', value: 'old-value' }]
        const updated = [{ name: 'VAR1', value: 'new-value' }]

        await plugin.update(existing, updated)

        expect(github.request).toHaveBeenCalledWith(
          'PATCH /repos/:org/:repo/actions/variables/:variable_name',
          expect.objectContaining({
            org,
            repo,
            variable_name: 'VAR1',
            value: 'new-value'
          })
        )
      })
    })
  })
})
