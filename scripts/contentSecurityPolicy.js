// CSP as a <meta> tag (GitHub Pages sets no headers of ours): a second wall against XSS. Injected markup
// cannot run another site's script, eval a string, or send the editor's GitHub token anywhere but over https.
// Pixi needs no eval (src/main.js imports pixi.js/unsafe-eval).
// Build only: Vite's dev server runs inline scripts of its own.

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob: https:",
  // blob: is a recording of the editor's draft.
  "media-src 'self' blob: https:",
  "font-src 'self'",
  // The favicon of another site is read with fetch; api.github.com is the editor's;
  // blob: is a file of the editor's draft, which the preview reads.
  "connect-src 'self' https: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  // An http:// picture is asked over https instead of being blocked as mixed content.
  'upgrade-insecure-requests'
].join('; ')

// The policy has no double quote to escape.
export const cspTag = (policy = CONTENT_SECURITY_POLICY) => `<meta http-equiv="Content-Security-Policy" content="${policy}" />`

// Right after the charset (which must come first), before any script or style.
export function cspMeta(policy = CONTENT_SECURITY_POLICY) {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      const charset = /<meta\s+charset=[^>]*>/i
      if (charset.test(html)) return html.replace(charset, found => `${found}\n    ${cspTag(policy)}`)
      return html.replace(/<head>/i, found => `${found}\n    ${cspTag(policy)}`)
    }
  }
}
