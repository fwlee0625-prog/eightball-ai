<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { TableBallState, TableState } from '@/types/tableState'

const props = defineProps<{
  state: TableState
  selectedBallId: number | null
}>()

const emit = defineEmits<{
  (event: 'select-ball', id: number): void
  (event: 'move-ball', id: number, x_mm: number, y_mm: number): void
}>()

const VIEW_WIDTH = 254
const VIEW_HEIGHT = 508
const ACTIVE_INSET = 10
const ACTIVE_WIDTH = VIEW_WIDTH - ACTIVE_INSET * 2
const ACTIVE_HEIGHT = VIEW_HEIGHT - ACTIVE_INSET * 2

const trackingColors = [
  '#8bd6bd', '#f3b56f', '#8ea8ff', '#ff8c82',
  '#cba4f5', '#6ed5e4', '#f4d86f', '#9ed18e',
  '#f1a6c7', '#9cc8e8', '#d5c5a1', '#7dd0a7',
  '#e6a56c', '#aaa4f0', '#e0d5ce', '#77b8b1',
]

const svgRef = ref<SVGSVGElement | null>(null)
const draggingId = ref<number | null>(null)
const dragPreview = ref<{ id: number; x_mm: number; y_mm: number } | null>(null)
const dragStart = ref<{ x: number; y: number } | null>(null)
const dragMoved = ref(false)

const selectedBall = computed<TableBallState | null>(
  () => props.state.balls.find((ball) => ball.id === props.selectedBallId) ?? null,
)

const positionedBalls = computed(() => {
  const width = props.state.table_geometry.active_width_mm
  const length = props.state.table_geometry.active_length_mm
  return props.state.balls.map((ball) => {
    const source = dragPreview.value?.id === ball.id
      ? { ...ball, x_mm: dragPreview.value.x_mm, y_mm: dragPreview.value.y_mm }
      : ball
    return {
      ...source,
      cx: ACTIVE_INSET + ((source.x_mm + width / 2) / width) * ACTIVE_WIDTH,
      cy: ACTIVE_INSET + ((source.y_mm + length / 2) / length) * ACTIVE_HEIGHT,
      color: trackingColors[source.id % trackingColors.length]!,
      selected: source.id === props.selectedBallId,
      dragging: source.id === draggingId.value,
    }
  })
})

function pointToCoordinates(event: PointerEvent): { x_mm: number; y_mm: number } | null {
  const svg = svgRef.value
  if (!svg) return null
  const rect = svg.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  const viewX = ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH
  const viewY = ((event.clientY - rect.top) / rect.height) * VIEW_HEIGHT
  const activeX = Math.min(
    ACTIVE_INSET + ACTIVE_WIDTH,
    Math.max(ACTIVE_INSET, viewX),
  )
  const activeY = Math.min(
    ACTIVE_INSET + ACTIVE_HEIGHT,
    Math.max(ACTIVE_INSET, viewY),
  )
  const width = props.state.table_geometry.active_width_mm
  const length = props.state.table_geometry.active_length_mm
  const x = ((activeX - ACTIVE_INSET) / ACTIVE_WIDTH - 0.5) * width
  const y = ((activeY - ACTIVE_INSET) / ACTIVE_HEIGHT - 0.5) * length
  return {
    x_mm: Number(Math.max(-width / 2, Math.min(width / 2, x)).toFixed(3)),
    y_mm: Number(Math.max(-length / 2, Math.min(length / 2, y)).toFixed(3)),
  }
}

function clearDrag() {
  draggingId.value = null
  dragPreview.value = null
  dragStart.value = null
  dragMoved.value = false
}

function startDrag(event: PointerEvent, ball: TableBallState) {
  if (event.button > 0) return
  event.preventDefault()
  draggingId.value = ball.id
  dragPreview.value = { id: ball.id, x_mm: ball.x_mm, y_mm: ball.y_mm }
  dragStart.value = { x: event.clientX, y: event.clientY }
  dragMoved.value = false

  const svg = svgRef.value
  if (svg && typeof svg.setPointerCapture === 'function') {
    try {
      svg.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture can be unavailable in synthetic test environments.
    }
  }
}

function moveDrag(event: PointerEvent) {
  if (draggingId.value === null || !dragStart.value) return
  if (Math.hypot(event.clientX - dragStart.value.x, event.clientY - dragStart.value.y) > 2) {
    dragMoved.value = true
  }
  if (!dragMoved.value) return
  const coordinates = pointToCoordinates(event)
  if (coordinates) {
    dragPreview.value = { id: draggingId.value, ...coordinates }
  }
}

function finishDrag(event: PointerEvent) {
  const id = draggingId.value
  if (id === null) return
  const moved = dragMoved.value
  const coordinates = moved ? (pointToCoordinates(event) ?? dragPreview.value) : null
  clearDrag()
  emit('select-ball', id)
  if (moved && coordinates) emit('move-ball', id, coordinates.x_mm, coordinates.y_mm)
}

function handleKeydown(event: KeyboardEvent, ball: TableBallState) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    emit('select-ball', ball.id)
    return
  }

  const step = event.shiftKey ? 1 : 10
  let x = ball.x_mm
  let y = ball.y_mm
  switch (event.key) {
    case 'ArrowLeft':
      x -= step
      break
    case 'ArrowRight':
      x += step
      break
    case 'ArrowUp':
      y -= step
      break
    case 'ArrowDown':
      y += step
      break
    default:
      return
  }

  event.preventDefault()
  const width = props.state.table_geometry.active_width_mm
  const length = props.state.table_geometry.active_length_mm
  x = Math.max(-width / 2, Math.min(width / 2, x))
  y = Math.max(-length / 2, Math.min(length / 2, y))
  emit('select-ball', ball.id)
  if (x !== ball.x_mm || y !== ball.y_mm) emit('move-ball', ball.id, x, y)
}

watch(() => props.state.balls, () => {
  if (draggingId.value !== null) clearDrag()
})
</script>

<template>
  <section class="inspector-section inspector-section--topdown" aria-labelledby="topdown-editor-heading">
    <div class="section-heading">
      <h3 id="topdown-editor-heading">二维顶视摆球</h3>
      <span class="section-muted">M1 / DRAG</span>
    </div>
    <p class="topdown-help">拖动检测球调整 XY；单击选择，方向键每次 10 mm，Shift + 方向键每次 1 mm。</p>
    <div class="topdown-board">
      <svg
        ref="svgRef"
        class="topdown-svg"
        viewBox="0 0 254 508"
        preserveAspectRatio="none"
        role="group"
        aria-label="二维球桌顶视图，可拖拽现有检测目标或使用方向键调整位置"
        @pointermove="moveDrag"
        @pointerup="finishDrag"
        @pointercancel="clearDrag"
      >
        <rect class="topdown-rail" x="0.5" y="0.5" width="253" height="507" rx="8" />
        <rect class="topdown-cloth" x="10" y="10" width="234" height="488" rx="4" />
        <line class="topdown-axis" x1="127" y1="10" x2="127" y2="498" />
        <line class="topdown-axis" x1="10" y1="254" x2="244" y2="254" />
        <circle class="topdown-origin" cx="127" cy="254" r="2" />
        <g
          v-for="ball in positionedBalls"
          :key="ball.id"
          :data-ball-id="ball.id"
          class="topdown-ball"
          :class="{
            'topdown-ball--selected': ball.selected,
            'topdown-ball--dragging': ball.dragging,
          }"
          role="button"
          tabindex="0"
          :aria-pressed="ball.selected"
          :aria-label="`检测目标 ID ${ball.id}，X ${ball.x_mm} 毫米，Y ${ball.y_mm} 毫米`"
          @pointerdown.stop="startDrag($event, ball)"
          @keydown.stop="handleKeydown($event, ball)"
        >
          <circle :cx="ball.cx" :cy="ball.cy" r="6.1" :fill="ball.color" />
          <text :x="ball.cx" :y="ball.cy">{{ ball.id }}</text>
        </g>
      </svg>
    </div>
    <p v-if="selectedBall" class="topdown-readout">
      当前 ID {{ selectedBall.id }} · X {{ selectedBall.x_mm }} mm · Y {{ selectedBall.y_mm }} mm
    </p>
    <p class="topdown-warning">仅移动现有视觉检测目标，不推断正式球号；坐标方向与 GLB 台面尚未完成标定。</p>
  </section>
</template>
