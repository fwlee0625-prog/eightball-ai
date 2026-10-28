<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import type { SceneStatus, TableState } from '@/types/tableState'

const props = defineProps<{
  state: TableState
  selectedBallId: number | null
  showIds: boolean
}>()

const emit = defineEmits<{
  (event: 'select-ball', id: number | null): void
  (event: 'model-status', status: SceneStatus): void
}>()

const container = ref<HTMLDivElement | null>(null)
const sceneStatus = ref<SceneStatus>('loading')
const sceneMessage = ref('正在读取 billiards.glb…')

const TABLE_WIDTH_MM = 1270
const TABLE_LENGTH_MM = 2540
const BALL_VISUAL_RADIUS_MM = 28.575
// Approximation only: the GLB bounding box can include the rail top, not the cloth surface.
const PROVISIONAL_SURFACE_INSET_MM = 36
const TRACKING_COLORS = [
  0x8bd6bd, 0xf3b56f, 0x8ea8ff, 0xff8c82,
  0xcba4f5, 0x6ed5e4, 0xf4d86f, 0x9ed18e,
  0xf1a6c7, 0x9cc8e8, 0xd5c5a1, 0x7dd0a7,
  0xe6a56c, 0xaaa4f0, 0xe0d5ce, 0x77b8b1,
]

let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let renderer: THREE.WebGLRenderer | null = null
let controls: OrbitControls | null = null
let resizeObserver: ResizeObserver | null = null
let animationFrame = 0
let ballGroup: THREE.Group | null = null
let ballGeometry: THREE.SphereGeometry | null = null
let tableSurfaceY = 0
const ballMeshes = new Map<number, THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>>()
const ballLabels = new Map<number, THREE.Sprite>()
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let pointerDown: { x: number; y: number } | null = null

function setStatus(status: SceneStatus, message: string) {
  sceneStatus.value = status
  sceneMessage.value = message
  emit('model-status', status)
}

function resizeRenderer() {
  if (!container.value || !renderer || !camera) return
  const width = Math.max(container.value.clientWidth, 1)
  const height = Math.max(container.value.clientHeight, 1)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(width, height, false)
}

function addLighting(targetScene: THREE.Scene) {
  targetScene.add(new THREE.HemisphereLight(0xdcecff, 0x173025, 1.8))

  const keyLight = new THREE.DirectionalLight(0xfff4df, 2.6)
  keyLight.position.set(-1500, 3200, 2100)
  keyLight.castShadow = true
  keyLight.shadow.mapSize.set(2048, 2048)
  keyLight.shadow.camera.left = -2200
  keyLight.shadow.camera.right = 2200
  keyLight.shadow.camera.top = 2600
  keyLight.shadow.camera.bottom = -2600
  keyLight.shadow.bias = -0.00015
  targetScene.add(keyLight)

  const fillLight = new THREE.DirectionalLight(0x8dc8ff, 1.0)
  fillLight.position.set(2200, 1600, -1900)
  targetScene.add(fillLight)
}

function addGround(targetScene: THREE.Scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(12000, 12000),
    new THREE.MeshStandardMaterial({ color: 0x0d1511, roughness: 0.92, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -12
  ground.receiveShadow = true
  ground.name = 'studio-ground'
  targetScene.add(ground)
}

function prepareModel(model: THREE.Object3D) {
  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true
      object.receiveShadow = true
      object.frustumCulled = true
    }
  })
}

function fitAndAddModel(model: THREE.Object3D) {
  if (!scene) return

  model.updateMatrixWorld(true)
  const sourceBox = new THREE.Box3().setFromObject(model)
  const sourceSize = sourceBox.getSize(new THREE.Vector3())

  // glTF uses Y-up. Align the longer horizontal dimension with the table-length axis.
  const orientedModel = new THREE.Group()
  orientedModel.add(model)
  if (sourceSize.x > sourceSize.z) {
    orientedModel.rotation.y = -Math.PI / 2
  }
  orientedModel.updateMatrixWorld(true)

  const bounds = new THREE.Box3().setFromObject(orientedModel)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) {
    throw new Error('模型包围盒尺寸无效')
  }

  // Fit the horizontal model extents to the configured dimensions. This is an initial
  // visual alignment, not a substitute for calibrating the playable-cloth rectangle.
  const scaleX = TABLE_WIDTH_MM / size.x
  const scaleZ = TABLE_LENGTH_MM / size.z
  const scaleY = (scaleX + scaleZ) / 2
  const fitFrame = new THREE.Group()
  fitFrame.name = 'provisionally-fitted-table-model'
  fitFrame.scale.set(scaleX, scaleY, scaleZ)
  fitFrame.position.set(-center.x * scaleX, -bounds.min.y * scaleY, -center.z * scaleZ)
  fitFrame.add(orientedModel)
  scene.add(fitFrame)

  tableSurfaceY = Math.max(0, size.y * scaleY - PROVISIONAL_SURFACE_INSET_MM)
  fitFrame.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })
}

function createFallbackTable() {
  if (!scene) return
  tableSurfaceY = 0

  const felt = new THREE.Mesh(
    new THREE.PlaneGeometry(TABLE_WIDTH_MM, TABLE_LENGTH_MM),
    new THREE.MeshStandardMaterial({ color: 0x176449, roughness: 0.88, side: THREE.DoubleSide }),
  )
  felt.rotation.x = -Math.PI / 2
  felt.position.y = tableSurfaceY
  felt.receiveShadow = true
  felt.name = 'fallback-felt'
  scene.add(felt)

  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x2c211a, roughness: 0.65 })
  const railHeight = 56
  const railThickness = 78
  const sideRail = new THREE.BoxGeometry(railThickness, railHeight, TABLE_LENGTH_MM + railThickness * 2)
  const endRail = new THREE.BoxGeometry(TABLE_WIDTH_MM + railThickness * 2, railHeight, railThickness)

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(sideRail, railMaterial)
    rail.position.set(side * (TABLE_WIDTH_MM / 2 + railThickness / 2), railHeight / 2, 0)
    rail.castShadow = true
    rail.receiveShadow = true
    scene.add(rail)
  }
  for (const end of [-1, 1]) {
    const rail = new THREE.Mesh(endRail, railMaterial)
    rail.position.set(0, railHeight / 2, end * (TABLE_LENGTH_MM / 2 + railThickness / 2))
    rail.castShadow = true
    rail.receiveShadow = true
    scene.add(rail)
  }
}

function makeBallLabel(ballId: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 80
  const context = canvas.getContext('2d')
  if (!context) return null

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = 'rgba(7, 14, 11, 0.88)'
  context.fillRect(12, 12, 136, 56)
  context.strokeStyle = 'rgba(219, 243, 229, 0.78)'
  context.lineWidth = 3
  context.strokeRect(12, 12, 136, 56)
  context.fillStyle = '#f1f7f3'
  context.font = '700 34px system-ui, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(String(ballId), 80, 40)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(82, 41, 1)
  sprite.position.y = tableSurfaceY + BALL_VISUAL_RADIUS_MM + 52
  sprite.renderOrder = 10
  return sprite
}

function clearBalls() {
  if (!ballGroup) return
  for (const child of [...ballGroup.children]) {
    ballGroup.remove(child)
    if (child instanceof THREE.Sprite) {
      child.material.map?.dispose()
      child.material.dispose()
    } else if (child instanceof THREE.Mesh) {
      const material = child.material
      if (Array.isArray(material)) material.forEach((item) => item.dispose())
      else material.dispose()
    }
  }
  ballMeshes.clear()
  ballLabels.clear()
}

function syncBalls() {
  if (!scene || !ballGroup || !ballGeometry) return
  clearBalls()

  for (const ball of props.state.balls) {
    const material = new THREE.MeshStandardMaterial({
      color: TRACKING_COLORS[ball.id % TRACKING_COLORS.length],
      roughness: 0.22,
      metalness: 0.03,
      emissive: 0x000000,
      emissiveIntensity: 0.3,
    })
    const mesh = new THREE.Mesh(ballGeometry, material)
    mesh.position.set(ball.x_mm, tableSurfaceY + BALL_VISUAL_RADIUS_MM, ball.y_mm)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.ballId = ball.id
    mesh.name = 'vision-ball-' + ball.id
    ballGroup.add(mesh)
    ballMeshes.set(ball.id, mesh)

    const label = makeBallLabel(ball.id)
    if (label) {
      label.position.set(ball.x_mm, tableSurfaceY + BALL_VISUAL_RADIUS_MM + 52, ball.y_mm)
      label.visible = props.showIds
      label.userData.ballId = ball.id
      ballGroup.add(label)
      ballLabels.set(ball.id, label)
    }
  }

  updateSelectedBall()
}

function updateSelectedBall() {
  for (const [id, mesh] of ballMeshes) {
    mesh.material.emissive.setHex(id === props.selectedBallId ? 0x1b7658 : 0x000000)
    mesh.material.emissiveIntensity = id === props.selectedBallId ? 0.85 : 0.12
    mesh.scale.setScalar(id === props.selectedBallId ? 1.07 : 1)
  }
}

function updateLabelVisibility() {
  for (const label of ballLabels.values()) {
    label.visible = props.showIds
  }
}

function resetView() {
  if (!camera || !controls) return
  camera.up.set(0, 1, 0)
  controls.target.set(0, tableSurfaceY, 0)
  camera.position.set(3100, tableSurfaceY + 2350, 3550)
  camera.lookAt(0, tableSurfaceY, 0)
  controls.update()
  controls.saveState()
}

function setTopDownView(enabled: boolean) {
  if (!camera || !controls) return
  controls.target.set(0, tableSurfaceY, 0)
  if (enabled) {
    camera.up.set(0, 0, -1)
    camera.position.set(0, tableSurfaceY + 4300, 0.01)
  } else {
    camera.up.set(0, 1, 0)
    camera.position.set(3100, tableSurfaceY + 2350, 3550)
  }
  camera.lookAt(0, tableSurfaceY, 0)
  controls.update()
}

function onPointerDown(event: PointerEvent) {
  pointerDown = { x: event.clientX, y: event.clientY }
}

function onPointerUp(event: PointerEvent) {
  if (!pointerDown || !renderer || !camera || !container.value) return
  const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y)
  pointerDown = null
  if (moved > 5) return

  const rect = renderer.domElement.getBoundingClientRect()
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
  raycaster.setFromCamera(pointer, camera)
  const intersections = raycaster.intersectObjects([...ballMeshes.values()], false)
  const first = intersections[0]
  if (first) emit('select-ball', Number(first.object.userData.ballId))
  else emit('select-ball', null)
}

function animate() {
  animationFrame = window.requestAnimationFrame(animate)
  controls?.update()
  if (scene && camera && renderer) renderer.render(scene, camera)
}

onMounted(async () => {
  if (!container.value) return

  try {
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0d1511)
    camera = new THREE.PerspectiveCamera(38, 1, 1, 20000)
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.setAttribute('aria-label', '可交互的三维台球桌，点击球体可查看视觉 ID')
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    container.value.appendChild(renderer.domElement)

    addLighting(scene)
    addGround(scene)
    ballGroup = new THREE.Group()
    ballGroup.name = 'vision-balls'
    scene.add(ballGroup)
    ballGeometry = new THREE.SphereGeometry(BALL_VISUAL_RADIUS_MM, 32, 24)

    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.075
    controls.enablePan = true
    controls.minDistance = 1100
    controls.maxDistance = 8500
    controls.maxPolarAngle = Math.PI / 2 - 0.025
    controls.target.set(0, 0, 0)
    controls.update()

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    resizeObserver = new ResizeObserver(resizeRenderer)
    resizeObserver.observe(container.value)
    resizeRenderer()
    animate()

    setStatus('loading', '正在读取 billiards.glb…')
    const loader = new GLTFLoader()
    try {
      const gltf = await loader.loadAsync(import.meta.env.BASE_URL + 'model/billiards.glb')
      prepareModel(gltf.scene)
      fitAndAddModel(gltf.scene)
      setStatus('ready', '模型已载入；比例与台面高度仍需标定')
    } catch (error) {
      console.error('Unable to load /model/billiards.glb', error)
      createFallbackTable()
      setStatus('fallback', 'GLB 加载失败，当前使用简化球台')
    }

    syncBalls()
    resetView()
  } catch (error) {
    console.error('Unable to initialize the 3D table view', error)
    setStatus('error', '当前浏览器无法初始化 WebGL 视图')
  }
})

watch(() => props.state.balls, syncBalls, { deep: true })
watch(() => props.selectedBallId, updateSelectedBall)
watch(() => props.showIds, updateLabelVisibility)

onBeforeUnmount(() => {
  window.cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  controls?.dispose()
  renderer?.domElement.removeEventListener('pointerdown', onPointerDown)
  renderer?.domElement.removeEventListener('pointerup', onPointerUp)

  if (scene) {
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        if (object instanceof THREE.Mesh) object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) {
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) value.dispose()
          }
          material.dispose()
        }
      }
    })
  }
  renderer?.dispose()
  renderer?.domElement.remove()
  ballMeshes.clear()
  ballLabels.clear()
  ballGeometry = null
  ballGroup = null
  controls = null
  renderer = null
  camera = null
  scene = null
})

defineExpose({ resetView, setTopDownView })
</script>

<template>
  <div ref="container" class="pool-scene" role="img" aria-label="可交互的三维台球桌">
    <div v-if="sceneStatus === 'loading'" class="scene-message scene-message--loading" role="status">
      <span class="scene-spinner" />
      <span>{{ sceneMessage }}</span>
    </div>
    <div v-else-if="sceneStatus === 'fallback'" class="scene-message scene-message--warning" role="status">
      <span class="scene-message-mark">!</span>
      <span>{{ sceneMessage }}</span>
    </div>
    <div v-else-if="sceneStatus === 'error'" class="scene-message scene-message--error" role="alert">
      <span class="scene-message-mark">×</span>
      <span>{{ sceneMessage }}</span>
    </div>
    <div class="scene-axis-note">
      <span class="axis-chip axis-chip--x">X / 宽度</span>
      <span class="axis-chip axis-chip--y">Y / 长度</span>
      <span class="axis-chip axis-chip--provisional">方向待标定</span>
    </div>
  </div>
</template>
