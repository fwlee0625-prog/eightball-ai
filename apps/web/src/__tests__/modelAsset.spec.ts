import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'

import { createSceneResourceDisposer, detachEmbeddedBalls } from '../utils/modelAsset'

function makeFixture() {
  const scene = new THREE.Group()
  const table = new THREE.Group()
  table.name = 'Table'
  const surface = new THREE.Mesh(
    new THREE.BoxGeometry(4, 0.1, 2),
    new THREE.MeshBasicMaterial(),
  )
  surface.name = 'TableSurface'
  surface.position.y = 0.5
  table.add(surface)
  scene.add(table)

  const balls = new THREE.Group()
  balls.name = 'Balls'
  for (let id = 0; id < 16; id += 1) {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.1),
      new THREE.MeshBasicMaterial(),
    )
    ball.name = `Ball_${id}`
    ball.position.set(0, 3 + id * 0.01, 0)
    balls.add(ball)
  }
  scene.add(balls)
  return { scene, table, surface, balls }
}

describe('GLB embedded-ball separation', () => {
  it('removes exactly the expected 16-ball subtree before bounds are measured', () => {
    const { scene, table, surface, balls } = makeFixture()
    const maxBefore = new THREE.Box3().setFromObject(scene).max.y

    const result = detachEmbeddedBalls(scene)
    const maxAfter = new THREE.Box3().setFromObject(scene).max.y

    expect(result.status).toBe('removed')
    expect(result.detached).toBe(balls)
    expect(balls.parent).toBeNull()
    expect(scene.children).toEqual([table])
    expect(table.getObjectByName('TableSurface')).toBe(surface)
    expect(maxBefore).toBeGreaterThan(3)
    expect(maxAfter).toBeCloseTo(0.55)
  })

  it('does nothing when there is no direct Balls subtree', () => {
    const { scene, table, balls } = makeFixture()
    scene.remove(balls)

    expect(detachEmbeddedBalls(scene)).toEqual({ status: 'not-found', detached: null })
    expect(scene.children).toEqual([table])
  })

  it('leaves incomplete or unexpected ball geometry intact', () => {
    const { scene, table, balls } = makeFixture()
    const foreign = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    foreign.name = 'Decoration'
    balls.remove(balls.children[15]!)
    balls.add(foreign)

    expect(detachEmbeddedBalls(scene)).toEqual({
      status: 'unexpected-structure',
      detached: null,
    })
    expect(scene.children).toEqual([table, balls])
    expect(foreign.parent).toBe(balls)
  })

  it('rejects duplicates and nested Balls without touching the table', () => {
    const { scene, table, balls } = makeFixture()
    balls.children[1]!.name = 'Ball_0'
    expect(detachEmbeddedBalls(scene).status).toBe('unexpected-structure')
    expect(scene.children).toEqual([table, balls])

    scene.remove(balls)
    table.add(balls)
    expect(detachEmbeddedBalls(scene).status).toBe('not-found')
    expect(table.getObjectByName('TableSurface')).toBeDefined()
    expect(balls.parent).toBe(table)
  })

  it('does not remove ambiguous matching top-level groups', () => {
    const { scene, table, balls } = makeFixture()
    const second = new THREE.Group()
    second.name = 'Balls'
    scene.add(second)

    expect(detachEmbeddedBalls(scene).status).toBe('unexpected-structure')
    expect(scene.children).toEqual([table, balls, second])
  })
})

describe('detached GLB resource cleanup', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('releases shared scene and detached resources exactly once, even on repeated calls', () => {
    const root = new THREE.Group()
    const table = new THREE.Group()
    table.name = 'Table'
    const balls = new THREE.Group()
    balls.name = 'Balls'
    root.add(table, balls)

    const geometry = new THREE.SphereGeometry(0.1)
    const texture = new THREE.Texture()
    const material = new THREE.MeshStandardMaterial({ map: texture })
    const geometryDispose = vi.spyOn(geometry, 'dispose')
    const textureDispose = vi.spyOn(texture, 'dispose')
    const materialDispose = vi.spyOn(material, 'dispose')

    table.add(new THREE.Mesh(geometry, material))
    for (let id = 0; id < 16; id += 1) {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = `Ball_${id}`
      balls.add(mesh)
    }

    const result = detachEmbeddedBalls(root)
    expect(result.status).toBe('removed')
    expect(geometryDispose).not.toHaveBeenCalled()
    expect(materialDispose).not.toHaveBeenCalled()
    expect(textureDispose).not.toHaveBeenCalled()
    if (result.status !== 'removed') throw new Error('expected embedded ball group')

    const dispose = createSceneResourceDisposer()
    dispose([root, result.detached, result.detached])
    dispose([root, result.detached])

    expect(geometryDispose).toHaveBeenCalledOnce()
    expect(materialDispose).toHaveBeenCalledOnce()
    expect(textureDispose).toHaveBeenCalledOnce()
  })

  it('handles an empty scene and sprite labels safely', () => {
    const dispose = createSceneResourceDisposer()
    expect(() => dispose([])).not.toThrow()

    const root = new THREE.Group()
    const texture = new THREE.Texture()
    const material = new THREE.SpriteMaterial({ map: texture })
    root.add(new THREE.Sprite(material))
    const textureDispose = vi.spyOn(texture, 'dispose')
    const materialDispose = vi.spyOn(material, 'dispose')

    dispose([root])
    dispose([root])
    expect(textureDispose).toHaveBeenCalledOnce()
    expect(materialDispose).toHaveBeenCalledOnce()
  })
})
