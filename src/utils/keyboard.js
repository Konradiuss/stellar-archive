export function isTypingTarget(target) {
  return !!target && (target.isContentEditable === true || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}
