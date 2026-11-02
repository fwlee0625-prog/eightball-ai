<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import trajectoryFixture from '../../../../data/samples/trajectory-001.json'
import { parseTrajectoryJson } from '@/utils/trajectoryImport'
import { parseTrajectoryCsv } from '@/utils/trajectoryCsvImport'
import { parseRackPlaylistJson } from '@/utils/rackPlaylistImport'
import { parseShotAnnotationsJson, validateAnnotationsForPlaylist } from '@/utils/shotAnnotationsImport'
import type { ShotAnnotation } from '@/utils/shotAnnotationsImport'
import { summarizeTrajectoryQuality } from '@/utils/trajectoryQualitySummary'
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
const rackShots = ref<TrajectoryRecord[]>([])
const selectedShotIndex = ref(0)
const shotAnnotations = ref<ShotAnnotation[]>([])
const annotationError = ref('')
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
const activeAnnotation = computed(() =>
  shotAnnotations.value.find((item) => item.shot_id === trajectory.value?.shot_id) ?? null,
)
const qualitySummary = computed(() =>
  trajectory.value ? summarizeTrajectoryQuality(trajectory.value) : null,
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
  const original = rackShots.value[0] ?? record
  return original.table_id === props.expectedTableId &&
    original.state_version === props.expectedStateVersion &&
    original.table_geometry.active_length_mm === props.expectedGeometry.active_length_mm &&
    original.table_geometry.active_width_mm === props.expectedGeometry.active_width_mm
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
  rackShots.value = []
  selectedShotIndex.value = 0
  shotAnnotations.value = []
  annotationError.value = ''
  currentFrameIndex.value = 0
  playheadNs.value = 0
  importPending.value = false
  error.value = ''
  emit('trajectory-change', null)
  emit('frame-change', null)
}

function loadTrajectory(record: TrajectoryRecord, fromRack = false) {
  if (record.table_id !== props.expectedTableId) {
    throw new Error('轨迹 table_id 与当前球桌不一致，已拒绝回放。')
  }
  if (!fromRack && record.state_version !== props.expectedStateVersion) {
    throw new Error('轨迹 state_version 与当前球局不一致。请恢复或导入对应起始状态后再回放。')
  }
  if (record.table_geometry.active_length_mm !== props.expectedGeometry.active_length_mm ||
    record.table_geometry.active_width_mm !== props.expectedGeometry.active_width_mm) {
    throw new Error('轨迹活动台面尺寸与当前球局不一致，已拒绝回放。')
  }

  pausePlayback()
  if (!fromRack) {
    rackShots.value = []
    selectedShotIndex.value = 0
    shotAnnotations.value = []
    annotationError.value = ''
  }
  trajectory.value = record
  currentFrameIndex.value = 0
  playheadNs.value = 0
  error.value = ''
  emit('trajectory-change', record)
  emit('frame-change', record.frames[0] ?? null)
}

function loadRackShots(shots: TrajectoryRecord[]) {
  const first = shots[0]!
  if (first.table_id !== props.expectedTableId ||
    first.state_version !== props.expectedStateVersion ||
    first.table_geometry.active_length_mm !== props.expectedGeometry.active_length_mm ||
    first.table_geometry.active_width_mm !== props.expectedGeometry.active_width_mm) {
    throw new Error('多杆文件首杆与当前球桌或状态版本不匹配。')
  }
  rackShots.value = shots
  selectedShotIndex.value = 0
  shotAnnotations.value = []
  annotationError.value = ''
  loadTrajectory(first, true)
}

function selectRackShot(index: number) {
  const record = rackShots.value[index]
  if (!record) return
  selectedShotIndex.value = index
  loadTrajectory(record, true)
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
    error.value = '轨迹文件超过 1 MiB 限制，请选择较小的 JSON 或 CSV 文件。'
    return
  }

  const extension = file.name.toLowerCase().split('.').pop()
  if (extension !== 'json' && extension !== 'csv') {
    error.value = '仅支持 .json 或 .csv 格式的轨迹文件。'
    return
  }

  importPending.value = true
  try {
    const contents = await file.text()
    if (extension === 'json') {
      const decoded: unknown = JSON.parse(contents)
      if (decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded) && 'shots' in decoded) {
        const playlist = parseRackPlaylistJson(contents)
        if (generation !== importGeneration) return
        loadRackShots(playlist.shots)
        return
      }
    }
    const record = extension === 'csv'
      ? parseTrajectoryCsv(contents)
      : parseTrajectoryJson(contents)
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

async function importShotAnnotations(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''
  annotationError.value = ''
  if (!trajectory.value || file.size > MAX_IMPORT_FILE_BYTES || !file.name.toLowerCase().endsWith('.json')) {
    annotationError.value = '请先载入轨迹，并选择不超过 1 MiB 的讲解 JSON。'
    return
  }
  const reference = trajectory.value
  const currentShots = rackShots.value.length ? [...rackShots.value] : [reference]
  try {
    const notes = parseShotAnnotationsJson(await file.text())
    if (trajectory.value !== reference) return
    validateAnnotationsForPlaylist(notes, {
      match_id: reference.match_id,
      rack_id: reference.rack_id,
      shots: currentShots,
    })
    shotAnnotations.value = notes.annotations
  } catch (cause) {
    annotationError.value = cause instanceof Error ? cause.message : '讲解文本文件无法读取。'
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
      <span class="section-muted">M1 / LOCAL DATA</span>
    </div>

    <div class="trajectory-load-row">
      <label class="trajectory-file-label" for="trajectory-file">导入单杆 JSON / CSV 或多杆 JSON</label>
      <input
        id="trajectory-file"
        class="trajectory-file-input"
        type="file"
        accept=".json,.csv,application/json,text/csv"
        :disabled="importPending"
        @change="importTrajectoryFile"
      />
      <button class="trajectory-sample-button" type="button" :disabled="importPending" @click="loadSyntheticSample">
        载入合成样例
      </button>
    </div>

    <p class="trajectory-help">只在本机读取文件。支持单杆 JSON / CSV 或显式顺序的多杆 JSON；多杆首杆须匹配当前球局，后续杆版本递增。每杆时间戳独立从零开始，不推算跨杆真实时间。</p>
    <p v-if="importPending" class="trajectory-feedback" role="status">正在读取并校验轨迹…</p>
    <p v-if="error" class="trajectory-feedback trajectory-feedback--error" role="alert">{{ error }}</p>

    <template v-if="trajectory && currentFrame">
      <div v-if="rackShots.length" class="trajectory-rate-row" data-testid="rack-shot-selector">
        <label>切换杆次
          <select :value="selectedShotIndex" aria-label="切换杆次" @change="selectRackShot(Number(($event.target as HTMLSelectElement).value))">
            <option v-for="(shot, index) in rackShots" :key="shot.shot_id" :value="index">第 {{ index + 1 }} 杆 · {{ shot.shot_id }}</option>
          </select>
        </label>
        <span>手动排序 · {{ rackShots.length }} 杆</span>
      </div>
      <div class="trajectory-load-row">
        <label class="trajectory-file-label" for="shot-annotations-file">关联已有职业讲解文本 JSON</label>
        <input id="shot-annotations-file" class="trajectory-file-input" type="file" accept=".json,application/json" @change="importShotAnnotations" />
      </div>
      <p v-if="annotationError" class="trajectory-feedback trajectory-feedback--error" role="alert">{{ annotationError }}</p>
      <section v-if="activeAnnotation" data-testid="shot-annotation" class="trajectory-quality" aria-label="当前杆次讲解文本">
        <h4>职业讲解文本（已提供）</h4>
        <p>{{ activeAnnotation.expert_text }}</p>
        <p v-if="activeAnnotation.actual_observation">人工记录的实际结果：{{ activeAnnotation.actual_observation.raw_text }}</p>
        <p v-else>实际结果：尚无独立观测证据</p>
        <small>按 shot_id 显式关联；不会根据讲解自动推定真实击球或杆法。</small>
      </section>
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

      <section
        v-if="qualitySummary"
        class="trajectory-quality"
        aria-labelledby="trajectory-quality-heading"
        data-testid="trajectory-quality-summary"
      >
        <div class="trajectory-quality__heading">
          <h4 id="trajectory-quality-heading">数据质量摘要</h4>
          <span>本机计算 · 不上传</span>
        </div>
        <dl class="trajectory-quality__grid">
          <div>
            <dt>记录帧</dt>
            <dd data-testid="quality-frame-count">{{ qualitySummary.frameCount }}</dd>
          </div>
          <div>
            <dt>检测记录</dt>
            <dd data-testid="quality-detection-count">{{ qualitySummary.observedDetectionCount }}</dd>
          </div>
          <div>
            <dt>源帧索引缺口</dt>
            <dd data-testid="quality-index-gaps">{{ qualitySummary.sourceIndexGapIntervals }} 段 / {{ qualitySummary.unrecordedSourceIndexes }} 个索引</dd>
          </div>
          <div>
            <dt>缺失观测</dt>
            <dd data-testid="quality-missing-observations">{{ qualitySummary.missingObservationCount }}</dd>
            <small>{{ qualitySummary.framesWithMissingObservations }} 个受影响帧</small>
          </div>
          <div>
            <dt>低置信度</dt>
            <dd data-testid="quality-low-confidence">
              {{ qualitySummary.confidenceObservationCount === 0
                ? '未提供'
                : qualitySummary.lowConfidenceObservationCount + ' / ' + qualitySummary.confidenceObservationCount }}
            </dd>
            <small>阈值 0.5</small>
          </div>
          <div>
            <dt>名义时序偏差</dt>
            <dd data-testid="quality-timing-outliers">{{ qualitySummary.nominalTimingOutlierIntervals }} 段</dd>
            <small>与 {{ trajectory.timebase.nominal_fps }} FPS 比较</small>
          </div>
          <div class="trajectory-quality__wide">
            <dt>球体重叠检查</dt>
            <dd data-testid="quality-overlap-check">未执行（球径未标定）</dd>
          </div>
        </dl>
        <p class="trajectory-quality__note">
          索引缺口不等于确认的相机掉帧；缺失检测不推断进袋或跟踪丢失。
          名义 FPS 仅用于诊断，回放仍以原始时间戳为准。GLB 模型尺寸不代表实测球径。
        </p>
      </section>
      <p class="trajectory-readonly-note">回放期间 2D / 3D 视图只读。按记录时间戳切换原始帧，不补造缺失检测；实际画面刷新受显示器刷新率限制。</p>
    </template>
    <p v-else-if="!error && !importPending" class="trajectory-empty">
      载入合成样例或导入轨迹文件后，可在 2D / 3D 球桌中逐帧回放。
    </p>
  </section>
</template>
