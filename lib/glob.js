class Glob {
  constructor (glob) {
    this.glob = glob

    // For patterns without any wildcards, match them anywhere in the string
    const hasWildcards = glob.includes('*') || glob.includes('?')

    const hasNothingToEscape = escapeRegExp(glob) === glob

    if (hasNothingToEscape) {
      this.regexp = new RegExp(`\\b${glob}\\b`, 'u')
      return
    }

    if (!hasWildcards) {
      // Simple case: no wildcards, just do a simple substring match
      this.regexp = new RegExp(escapeRegExp(glob), 'u')
      return
    }

    // Handle wildcard patterns
    let pattern

    if (glob.includes('**')) {
      // Handle ** which can match across directory boundaries
      pattern = glob
        .replace(/\*\*/g, '__GLOBSTAR__')
        .replace(/\./g, '\\.')
        .replace(/\//g, '\\/')
        .replace(/\?/g, '.')
        .replace(/\*/g, '[^\\/]*')
        .replace(/__GLOBSTAR__/g, '.*')
    } else {
      // Handle patterns with * but not **
      pattern = glob
        .replace(/\./g, '\\.')
        .replace(/\//g, '\\/')
        .replace(/\?/g, '.')
        .replace(/\*/g, '[^\\/]*')
    }

    // Handle character classes
    pattern = pattern.replace(/\\\[([^\]]+)\\\]/g, '[$1]')

    this.regexp = new RegExp(`^${pattern}$`, 'u')
  }

  toString () {
    return this.glob
  }

  [Symbol.search] (s) {
    console.log('regex patttern is ', this.regexp)
    console.log('string to search is ', s)
    console.log('string search result is ', s.search(this.regexp))
    return s.search(this.regexp)
  }

  [Symbol.match] (s) {
    console.log('regex patttern is ', this.regexp)
    console.log('string to match is ', s)
    console.log('string match result is ', s.match(this.regexp))
    return s.match(this.regexp)
  }

  [Symbol.replace] (s, replacement) {
    return s.replace(this.regexp, replacement)
  }

  [Symbol.replaceAll] (s, replacement) {
    return s.replaceAll(this.regexp, replacement)
  }
}

// Helper function to escape regular expression special chars
function escapeRegExp (string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

module.exports = Glob
