// Pixi 8 restores GPU resources after a context loss, but PIXI.Text textures come back
// blank (their shared canvas was drawn over), so the scene is rebuilt instead.

export function rebuildOnContextRestore(canvas, rebuild) {
  // Pixi subscribes first (in app.init), so its GPU state is ready when this runs.
  const restored = () => rebuild()
  canvas.addEventListener('webglcontextrestored', restored)
  return () => canvas.removeEventListener('webglcontextrestored', restored)
}
