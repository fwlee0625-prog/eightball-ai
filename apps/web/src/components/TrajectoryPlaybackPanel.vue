<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import trajectoryFixture from '../../../../data/samples/trajectory-001.json'
import { parseTrajectoryJson } from '@/utils/trajectoryImport'
import type { TableState } from '@/types/tableState'
import type { TrajectoryFrame, TrajectoryRecord } from '@/types/trajectory'

const props = defineProps<{
  expectedTableId: string
  expectedStateVersion: number
  expectedGeometry: TableState['table_geometry']
  resetToken: number
}>()

const emit = defineEmits<{
  (event: 'trajectory-change', trajectory: TrajectoryRecord | null): void
  (event: 'frame-change', frame: TrajectoryFrame | null): void
}>()

const MAX_IMPORT_FILE_BYTES = 1024 * 1024
const trajectory = ref<TrajectoryRecord | null>(null)
const currentFrameIndex = ref(0)
const playheadNs = ref(0)
const playbackRate = ref(1)
const playing = ref(false)
const importPending = ref(false)
const error = ref('')

let importGeneration = 0
let animationFrameId: number | null = null
let lastAnimationTimeMs: number | null = null

const currentFrame = computed(
  () => trajectory.value?.frames[currentFrameIndex.value] ?? null,
)
const durationNs = computed(() => {
  const frames = trajectory.value?.frames
  return frames?.[frames.length - 1]?.timestamp_ns ?? 0
})
const durationMs = computed(() => durationNs.value / 1_000_000)
const playheadMs = computed(() => playheadNs.value / 1_000_000)

function formatTimestamp(timestampNs: number): string {
  return (timestampNs / 1_000_000).toFixed(3) + ' ms'
}

function matchesCurrentSession(record: TrajectoryRecord): boolean {
  return record.table_id === props.expectedTableId &&
    record.state_version === props.expectedStateVersion &&
    record.table_geometry.active_length_mm === props.expectedGeometry.active_length_mm &&
    record.table_geometry.active_width_mm === props.expectedGeometry.active_width_mm
}

function pausePlayback() {
  playing.value = false
  lastAnimationTimeMs = null
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
}

function clearTrajectory() {
  importGeneration += 1
  pausePlayback()
  trajectory.value = null
  currentFrameIndex.value = 0
  playheadNs.value = 0
  importPending.value = false
  error.value = ''
  emit('trajectory-change', null)
  emit('frame-change', null)
}

function loadTrajectory(record: TrajectoryRecord) {
  if (record.table_id !== props.expectedTableId) {
    throw new Error('轨迹 table_id 与当前球桌不一致，已拒绝回放。')
  }
  if (record.state_version !== props.expectedStateVersion) {
    throw new Error('轨迹 state_version 与当前球局不一致。请恢复或导入对应起始状态后再回放。')
  }
  if (record.table_geometry.active_length_mm !== props.expectedGeometry.active_length_mm ||
    record.table_geometry.active_width_mm !== props.expectedGeometry.active_width_mm) {
    throw new Error('轨迹活动台面尺寸与当前球局不一致，已拒绝回放。')
  }

  pausePlayback()
  trajectory.value = record
  currentFrameIndex.value = 0
  playheadNs.value = 0
  error.value = ''
  emit('trajectory-change', record)
  emit('frame-change', record.frames[0] ?? null)
}

function loadSyntheticSample() {
  importGeneration += 1
  importPending.value = false
  try {
    const record = parseTrajectoryJson(JSON.stringify(trajectoryFixture))
    loadTrajectory(record)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '无法载入合成轨迹样例。'
  }
}

async function importTrajectoryFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''

  const generation = ++importGeneration
  error.value = ''
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    error.value = '轨迹文件超过 1 MiB 限制，请选择较小的 JSON 文件。'
    return
  }

  importPending.value = true
  try {
    const record = parseTrajectoryJson(await file.text())
    if (generation !== importGeneration) return
    loadTrajectory(record)
  } catch (cause) {
    if (generation === importGeneration) {
      error.value = cause instanceof Error ? cause.message : '无法读取轨迹文件。'
    }
  } finally {
    if (generation === importGeneration) importPending.value = false
  }
}

function syncFrameAtTime(timestampNs: number) {
  const record = trajectory.value
  if (!record) return

  let low = 0
  let high = record.frames.length - 1
  let selected = 0
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const frame = record.frames[middle]
    if (!frame) break
    if (frame.timestamp_ns <= timestampNs) {
      selected = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  if (selected !== currentFrameIndex.value) {
    currentFrameIndex.value = selected
    emit('frame-change', record.frames[selected] ?? null)
  }
}

function seekToMilliseconds(event: Event) {
  const target = event.target as HTMLInputElement
  const value = Number(target.value)
  if (!Number.isFinite(value)) return
  pausePlayback()
  playheadNs.value = Math.max(0, Math.min(durationNs.value, value * 1_000_000))
  syncFrameAtTime(playheadNs.value)
}

function stepFrame(direction: -1 | 1) {
  const record = trajectory.value
  if (!record) return
  pausePlayback()
  const nextIndex = Math.max(
    0,
    Math.min(record.frames.length - 1, currentFrameIndex.value + direction),
  )
  currentFrameIndex.value = nextIndex
  playheadNs.value = record.frames[nextIndex]?.timestamp_ns ?? 0
  emit('frame-change', record.frames[nextIndex] ?? null)
}

function tick(nowMs: number) {
  const record = trajectory.value
  if (!playing.value || !record) return

  if (lastAnimationTimeMs !== null) {
    const elapsedNs = Math.max(0, nowMs - lastAnimationTimeMs) * 1_000_000 * playbackRate.value
    playheadNs.value = Math.min(durationNs.value, playheadNs.value + elapsedNs)
  }
  lastAnimationTimeMs = nowMs
  syncFrameAtTime(playheadNs.value)

  if (playheadNs.value >= durationNs.value) {
    pausePlayback()
    return
  }
  animationFrameId = requestAnimationFrame(tick)
}

function togglePlayback() {
  if (!trajectory.value) return
  if (playing.value) {
    pausePlayback()
    return
  }

  if (playheadNs.value >= durationNs.value) {
    playheadNs.value = 0
    syncFrameAtTime(0)
  }
  playing.value = true
  lastAnimationTimeMs = null
  animationFrameId = requestAnimationFrame(tick)
}

watch(
  () => [
    props.expectedTableId,
    props.expectedStateVersion,
    props.expectedGeometry.active_length_mm,
    props.expectedGeometry.active_width_mm,
  ],
  () => {
    if (trajectory.value && !matchesCurrentSession(trajectory.value)) {
      clearTrajectory()
      error.value = '当前球局已变化，已停止过期轨迹回放。'
    }
  },
)

watch(() => props.resetToken, clearTrajectory)

onBeforeUnmount(pausePlayback)
</script>

<template>
  <section class="inspector-section trajectory-playback" aria-labelledby="trajectory-playback-heading">
    <div class="section-heading">
      <h3 id="trajectory-playback-heading">轨迹回放</h3>
      <span class="section-muted">M1 / LOCAL JSON</span>
    </div>

    <div class="trajectory-load-row">
      <label class="trajectory-file-label" for="trajectory-file">导入轨迹 JSON</label>
      <input
        id="trajectory-file"
        class="trajectory-file-input"
        type="file"
        accept=".json,application/json"
        :disabled="importPending"
        @change="importTrajectoryFile"
      />
      <button class="trajectory-sample-button" type="button" :disabled="importPending" @click="loadSyntheticSample">
        载入合成样例
      </button>
    </div>

    <p class="trajectory-help">只在本机读取文件。轨迹必须匹配当前 table_id、state_version 和活动台面尺寸。</p>
    <p v-if="importPending" class="trajectory-feedback" role="status">正在读取并校验轨迹…</p>
    <p v-if="error" class="trajectory-feedback trajectory-feedback--error" role="alert">{{ error }}</p>

    <template v-if="trajectory && currentFrame">
      <div class="trajectory-summary">
        <div>
          <span>当前单杆</span>
          <strong>{{ trajectory.shot_id }}</strong>
        </div>
        <div>
          <span>当前帧</span>
          <strong data-testid="trajectory-frame-indicator">{{ currentFrameIndex + 1 }} / {{ trajectory.frames.length }} 帧 · 原始索引 {{ currentFrame.frame_index }}</strong>
        </div>
      </div>

      <div class="trajectory-controls">
        <button
          class="trajectory-control-button"
          type="button"
          aria-label="上一帧"
          :disabled="currentFrameIndex <= 0"
          @click="stepFrame(-1)"
        >‹</button>
        <button class="trajectory-control-button trajectory-control-button--play" type="button" @click="togglePlayback">
          {{ playing ? '暂停' : '播放' }}
        </button>
        <button
          class="trajectory-control-button"
          type="button"
          aria-label="下一帧"
          :disabled="currentFrameIndex >= trajectory.frames.length - 1"
          @click="stepFrame(1)"
        >›</button>
        <button class="trajectory-clear-button" type="button" @click="clearTrajectory">退出回放</button>
      </div>

      <label class="trajectory-timeline">
        <span>时间轴</span>
        <input
          type="range"
          min="0"
          :max="durationMs"
          step="any"
          :value="playheadMs"
          :aria-valuetext="formatTimestamp(playheadNs)"
          aria-label="按实际时间戳定位轨迹"
          @input="seekToMilliseconds"
        />
      </label>

      <div class="trajectory-time-row">
        <strong data-testid="trajectory-playhead">{{ formatTimestamp(playheadNs) }}</strong>
        <span>总时长 {{ formatTimestamp(durationNs) }}</span>
      </div>

      <div class="trajectory-rate-row">
        <label>
          播放倍率
          <select v-model.number="playbackRate" aria-label="播放倍率">
            <option :value="0.25">0.25×</option>
            <option :value="0.5">0.5×</option>
            <option :value="1">1×</option>
            <option :value="2">2×</option>
            <option :value="4">4×</option>
          </select>
        </label>
        <span>{{ trajectory.timebase.nominal_fps }} FPS 名义采样</span>
      </div>

      <p class="trajectory-readonly-note">回放期间 2D / 3D 视图只读。按记录时间戳切换原始帧，不补造缺失检测；实际画面刷新受显示器刷新率限制。</p>
    </template>
    <p v-else-if="!error && !importPending" class="trajectory-empty">
      载入合成样例或导入轨迹文件后，可在 2D / 3D 球桌中逐帧回放。
    </p>
  </section>
</template>
