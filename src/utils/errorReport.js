// An error while a screen is built behind the shutters is shown in the loader (they would stay
// closed otherwise); on a screen already open it is only logged.

export function reportAppError(error, { uiStore, info = '', log = console.error } = {}) {
  log(`SpaceMap error${info ? ` (${info})` : ''}:`, error)
  if (!uiStore || uiStore.loadError || uiStore.transitionPhase !== 'waiting') return false
  uiStore.failLoading('loader.unexpectedError', {}, [String(error?.message ?? error)])
  return true
}

export function installErrorReport(app, getUiStore) {
  app.config.errorHandler = (error, instance, info) => {
    reportAppError(error, { uiStore: getUiStore(), info })
  }
}
