import * as THREE from 'three'

/**
 * Only the known manufacturer asset's immediate Balls child is filtered.
 * Unknown or modified model structures are left untouched.
 */
export type EmbeddedBallsFilterResult =
  | { status: 'removed'; detached: THREE.Object3D }
  | { status: 'not-found' | 'unexpected-structure'; detached: null }

export function detachEmbeddedBalls(root: THREE.Object3D): EmbeddedBallsFilterResult {
  const candidates = root.children.filter((child) => child.name === 'Balls')
  if (candidates.length === 0) return { status: 'not-found', detached: null }
  if (candidates.length !== 1) return { status: 'unexpected-structure', detached: null }

  const balls = candidates[0]!
  if (balls.children.length !== 16) {
    return { status: 'unexpected-structure', detached: null }
  }

  // Reject partial matches, duplicate identifiers, nested unknowns, and non-mesh objects.
  const expectedNames = new Set(Array.from({ length: 16 }, (_, index) => `Ball_${index}`))
  for (const child of balls.children) {
    if (!(child instanceof THREE.Mesh) || !expectedNames.delete(child.name)) {
      return { status: 'unexpected-structure', detached: null }
    }
  }
  if (expectedNames.size > 0) return { status: 'unexpected-structure', detached: null }

  root.remove(balls)
  return { status: 'removed', detached: balls }
}

/**
 * Release the scene plus any detached asset pieces together on unmount.
 * Resources can be shared between meshes or roots, so keep the disposer
 * instance scoped to one scene and make repeated calls idempotent.
 */
export function createSceneResourceDisposer(): (roots: readonly THREE.Object3D[]) => void {
  const disposed = new WeakSet<object>()

  function disposeOnce(resource: THREE.BufferGeometry | THREE.Material | THREE.Texture) {
    if (disposed.has(resource)) return
    disposed.add(resource)
    resource.dispose()
  }

  return (roots) => {
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    const textures = new Set<THREE.Texture>()

    for (const root of roots) {
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) geometries.add(object.geometry)
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite)) return

        const usedMaterials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of usedMaterials) {
          materials.add(material)
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) textures.add(value)
          }
        }
      })
    }

    for (const texture of textures) disposeOnce(texture)
    for (const material of materials) disposeOnce(material)
    for (const geometry of geometries) disposeOnce(geometry)
  }
}
