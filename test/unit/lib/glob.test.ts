const Glob = require('../../../lib/glob')

describe('glob test', function () {

  test('Test Glob **', () => {
    let pattern = new Glob('**/xss')
    let str = 'test/web/xss'
    expect(str.search(pattern)>=0).toBeTruthy()
    str = 'test/web/xsssss'
    expect(str.search(pattern)>=0).toBeFalsy()

    pattern = new Glob('**/*.txt')
    str = 'sub/3.txt'
    expect(str.search(pattern)>=0).toBeTruthy()
    str = '/sub1/sub2/sub3/3.txt'
    expect(str.search(pattern)>=0).toBeTruthy()

    pattern = new Glob('**/csrf-protection-disabled')
    str = 'java/csrf-protection-disabled'
    expect(str.search(pattern)>=0).toBeTruthy()
    str = '/java/test/csrf-protection-disabled'
    expect(str.search(pattern)>=0).toBeTruthy()
  })

  test('Test Glob *', () => {
    let str = 'web/xss'
    let pattern = new Glob('*/xss')
    expect(str.search(pattern)>=0).toBeTruthy()

    pattern = new Glob('./[0-9].*')
    str = './1.gif'
    expect(str.search(pattern)>=0).toBeTruthy()
    str = './2.gif'
    expect(str.search(pattern)>=0).toBeTruthy()
    str = './2.'
    expect(str.search(pattern)>=0).toBeTruthy()

    pattern = new Glob('*/csrf-protection-disabled')
    str = 'java/csrf-protection-disabled'
    expect(str.search(pattern)>=0).toBeTruthy()
    str = 'rb/csrf-protection-disabled'
    expect(str.search(pattern)>=0).toBeTruthy()

    pattern = new Glob('*/hardcoded-credential*')
    str = 'java/csrf-protection-disabled'
    expect(str.search(pattern)>=0).toBeFalsy()
    str = 'rb/csrf-protection-disabled'
    expect(str.search(pattern)>=0).toBeFalsy()
    str = 'cs/hardcoded-credentials'
    expect(str.search(pattern)>=0).toBeTruthy()
    str = 'java/hardcoded-credential-api-call'
    expect(str.search(pattern)>=0).toBeTruthy()

  })

  test('Test Glob no *', () => {
    let pattern = new Glob('csrf-protection-disabled')
    let str = 'java/hardcoded-credential-api-call'
    expect(str.search(pattern)>=0).toBeFalsy()
    str = 'cs/test/hardcoded-credentials'
    expect(str.search(pattern)>=0).toBeFalsy()
    str = 'rb/csrf-protection-disabled'
    expect(str.search(pattern)>=0).toBeTruthy()
    str = 'java/csrf-protection-disabled'
    expect(str.search(pattern)>=0).toBeTruthy()

    pattern = new Glob('csrf')
    str = 'java/hardcoded-credential-api-call'
    expect(str.search(pattern)>=0).toBeFalsy()
    str = 'cs/test/hardcoded-credentials'
    expect(str.search(pattern)>=0).toBeFalsy()
    str = 'rb/csrf-protection-disabled'
    expect(str.search(pattern)>=0).toBeTruthy()
    str = 'java/csrf-protection-disabled'
    expect(str.search(pattern)>=0).toBeTruthy()
  })

  test('Test Glob with special regex characters', () => {
    // Test for repository names with a period (.)
    let pattern = new Glob('.sentry')
    let str = '.sentry'
    expect(str.search(pattern)>=0).toBeTruthy()
    str = 'some-repo'
    expect(str.search(pattern)>=0).toBeFalsy()
    str = 'other-sentry-repo'
    expect(str.search(pattern)>=0).toBeFalsy()

    // Test for other special regex characters
    pattern = new Glob('repo+name')
    str = 'repo+name'
    expect(str.search(pattern)>=0).toBeTruthy()
    str = 'reponame'
    expect(str.search(pattern)>=0).toBeFalsy()

    pattern = new Glob('repo[1-3]')
    str = 'repo[1-3]'
    expect(str.search(pattern)>=0).toBeTruthy()
    str = 'repo1'
    expect(str.search(pattern)>=0).toBeFalsy()
  })

})
