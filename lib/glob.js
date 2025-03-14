class Glob {
  constructor (glob) {
    this.glob = glob

    // If not a glob pattern then just match the string.
    if (!this.glob.includes('*')) {
      // Escape special regex characters for non-glob patterns
      const escapedGlob = this.escapeRegExp(this.glob)
      this.regexp = new RegExp(`.*${escapedGlob}.*`, 'u')
      return
    }
    this.regexptText = this.globize(this.glob)
    this.regexp = new RegExp(`^${this.regexptText}$`, 'u')
  }

  // Helper method to escape special regex characters
  escapeRegExp (string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // $& means the whole matched string
  }

  globize (glob) {
    return glob
      .replace(/\\/g, '\\\\') // escape backslashes
      .replace(/\//g, '\\/') // escape forward slashes
      .replace(/\./g, '\\.') // escape periods
      .replace(/\?/g, '([^\\/])') // match any single character except /
      .replace(/\*\*/g, '.+') // match any character except /, including /
      .replace(/\*/g, '([^\\/]*)') // match any character except /
  }

  toString () {
    return this.glob
  }

  [Symbol.search] (s) {
    return s.search(this.regexp)
  }

  [Symbol.match] (s) {
    return s.match(this.regexp)
  }

  [Symbol.replace] (s, replacement) {
    return s.replace(this.regexp, replacement)
  }

  [Symbol.replaceAll] (s, replacement) {
    return s.replaceAll(this.regexp, replacement)
  }
}
module.exports = Glob