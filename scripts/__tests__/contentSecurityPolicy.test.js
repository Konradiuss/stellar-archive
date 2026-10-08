import { describe, expect, it } from 'vitest'
import { CONTENT_SECURITY_POLICY, cspMeta, cspTag } from '../contentSecurityPolicy'

const directive = name => CONTENT_SECURITY_POLICY.split('; ').find(part => part.split(' ')[0] === name)

// Was: the site had no Content-Security-Policy at all.
describe('the Content-Security-Policy of the built site', () => {
  it('runs the scripts of the site only, and never a string as code', () => {
    expect(directive('script-src')).toBe("script-src 'self'")
    expect(CONTENT_SECURITY_POLICY).not.toContain("'unsafe-eval'")
    expect(CONTENT_SECURITY_POLICY).not.toContain("'unsafe-inline'")
    expect(directive('object-src')).toBe("object-src 'none'")
  })

  it('takes pictures, music and the favicon from https addresses, and no http', () => {
    expect(directive('img-src')).toContain('https:')
    expect(directive('img-src')).toContain('data:')
    expect(directive('media-src')).toContain('https:')
    // A track of the editor's draft, in the preview.
    expect(directive('media-src')).toContain('blob:')
    expect(directive('connect-src')).toContain('https:')
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/\bhttp:/)
  })

  it('goes into <head> of the build right after the charset, and not into the dev server', () => {
    const plugin = cspMeta()
    expect(plugin.apply).toBe('build')
    const html = '<html><head>\n    <meta charset="UTF-8" />\n    <title>x</title>\n    <script type="module" src="./a.js"></script></head></html>'
    const built = plugin.transformIndexHtml(html)
    expect(built).toContain(`<meta charset="UTF-8" />\n    ${cspTag()}`)
    expect(built.indexOf('Content-Security-Policy')).toBeLessThan(built.indexOf('<script'))
    expect(plugin.transformIndexHtml('<html><head><title>x</title></head></html>')).toMatch(/^<html><head>\n {4}<meta http-equiv="Content-Security-Policy"/)
  })
})
