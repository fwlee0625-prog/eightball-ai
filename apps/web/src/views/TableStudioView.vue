<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import ApiHealthBadge from '@/components/ApiHealthBadge.vue'
import PoolTableScene from '@/components/PoolTableScene.vue'
import TableTopDownEditor from '@/components/TableTopDownEditor.vue'
import TrajectoryPlaybackPanel from '@/components/TrajectoryPlaybackPanel.vue'
import { createInitialTableState } from '@/data/initialTableState'
import { parseTableStateJson } from '@/utils/tableStateImport'
import { nextStateVersion } from '@/utils/stateVersion'
import type { SceneStatus, TableBallState, TableState } from '@/types/tableState'
import type { TrajectoryFrame, TrajectoryRecord } from '@/types/trajectory'

interface SceneHandle {
  resetView: () => void
  setTopDownView: (enabled: boolean) => void
}

const state = ref<TableState>(createInitialTableState())
const activeTrajectory = ref<TrajectoryRecord | null>(null)
const playbackFrame = ref<TrajectoryFrame | null>(null)
const playbackResetToken = ref(0)
const selectedBallId = ref<number | null>(null)
const showIds = ref(true)
const isDirty = ref(false)
const isTopDown = ref(false)
const modelStatus = ref<SceneStatus>('loading')
const coordinateError = ref('')
const importError = ref('')
const importNotice = ref('')
const importPending = ref(false)
const MAX_IMPORT_FILE_BYTES = 1024 * 1024
let importGeneration = 0
const coordinateDraft = ref<{ x: string | number; y: string | number }>({ x: '', y: '' })
const sceneRef = ref<SceneHandle | null>(null)

const selectedBall = computed<TableBallState | null>(
  () => state.value.balls.find((ball) => ball.id === selectedBallId.value) ?? null,
)
const isTrajectoryPlayback = computed(() => activeTrajectory.value !== null && playbackFrame.value !== null)
const displayState = computed<TableState>(() => {
  if (!activeTrajectory.value || !playbackFrame.value) return state.value
  return {
    ...state.value,
    state_version: activeTrajectory.value.state_version,
    source: activeTrajectory.value.source,
    table_id: activeTrajectory.value.table_id,
    coordinate_frame: activeTrajectory.value.coordinate_frame,
    table_geometry: activeTrajectory.value.table_geometry,
    balls: playbackFrame.value.balls.map((ball) => ({ ...ball })),
  }
})
const ballCount = computed(() => displayState.value.balls.length)
const xLimit = computed(() => state.value.table_geometry.active_width_mm / 2)
const yLimit = computed(() => state.value.table_geometry.active_length_mm / 2)
const trackingColors = [
  0x8bd6bd, 0xf3b56f, 0x8ea8ff, 0xff8c82,
  0xcba4f5, 0x6ed5e4, 0xf4d86f, 0x9ed18e,
  0xf1a6c7, 0x9cc8e8, 0xd5c5a1, 0x7dd0a7,
  0xe6a56c, 0xaaa4f0, 0xe0d5ce, 0x77b8b1,
]
const selectedBallColor = computed(() => {
  if (!selectedBall.value) return '#a7f0c6'
  return '#' + trackingColors[selectedBall.value.id % trackingColors.length]!.toString(16).padStart(6, '0')
})

const modelStatusLabel = computed(() => {
  const labels: Record<SceneStatus, string> = {
    loading: '模型加载中',
    ready: '模型已载入',
    fallback: '简化球台模式',
    error: 'WebGL 不可用',
  }
  return labels[modelStatus.value]
})

watch(
  selectedBall,
  (ball) => {
    coordinateDraft.value = ball
      ? { x: String(ball.x_mm), y: String(ball.y_mm) }
      : { x: '', y: '' }
    coordinateError.value = ''
  },
  { immediate: true },
)

function onModelStatus(status: SceneStatus) {
  modelStatus.value = status
}

function selectBall(id: number | null) {
  selectedBallId.value = id
}

function handleSceneSelectBall(id: number | null) {
  if (isTrajectoryPlayback.value) return
  selectBall(id)
}

function handleTopDownSelectBall(id: number) {
  if (isTrajectoryPlayback.value) return
  selectBall(id)
}

function onTrajectoryChange(record: TrajectoryRecord | null) {
  activeTrajectory.value = record
  playbackFrame.value = null
  selectedBallId.value = null
  coordinateError.value = ''
}

function onPlaybackFrameChange(frame: TrajectoryFrame | null) {
  playbackFrame.value = frame
}

function commitBallPosition(ballId: number, x: number, y: number) {
  const ball = state.value.balls.find((item) => item.id === ballId)
  if (!ball) return

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    coordinateError.value = '坐标必须是有效数字。'
    return
  }
  if (x < -xLimit.value || x > xLimit.value) {
    coordinateError.value = 'X 坐标必须在 ' + -xLimit.value + ' 到 ' + xLimit.value + ' mm 范围内。'
    return
  }
  if (y < -yLimit.value || y > yLimit.value) {
    coordinateError.value = 'Y 坐标必须在 ' + -yLimit.value + ' 到 ' + yLimit.value + ' mm 范围内。'
    return
  }
  if (x === ball.x_mm && y === ball.y_mm) {
    coordinateError.value = ''
    return
  }

  let nextVersion: number
  try {
    nextVersion = nextStateVersion(state.value.state_version)
  } catch (error) {
    coordinateError.value = error instanceof Error ? error.message : '无法安全递增状态版本。'
    return
  }

  importGeneration += 1
  importPending.value = false
  state.value = {
    ...state.value,
    state_version: nextVersion,
    balls: state.value.balls.map((item) =>
      item.id === ballId ? { ...item, x_mm: x, y_mm: y } : item,
    ),
  }
  isDirty.value = true
  coordinateError.value = ''
}

function moveBall(id: number, x: number, y: number) {
  if (isTrajectoryPlayback.value) return
  selectedBallId.value = id
  commitBallPosition(id, x, y)
}

function applyCoordinateEdit() {
  const ball = selectedBall.value
  if (!ball) return

  if (!String(coordinateDraft.value.x).trim() || !String(coordinateDraft.value.y).trim()) {
    coordinateError.value = '请输入 X 和 Y 坐标。'
    return
  }

  const x = Number(coordinateDraft.value.x)
  const y = Number(coordinateDraft.value.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    coordinateError.value = '坐标必须是有效数字。'
    return
  }
  if (x < -xLimit.value || x > xLimit.value) {
    coordinateError.value = 'X 坐标必须在 ' + -xLimit.value + ' 到 ' + xLimit.value + ' mm 范围内。'
    return
  }
  if (y < -yLimit.value || y > yLimit.value) {
    coordinateError.value = 'Y 坐标必须在 ' + -yLimit.value + ' 到 ' + yLimit.value + ' mm 范围内。'
    return
  }

  commitBallPosition(ball.id, x, y)
}

function resetState() {
  importGeneration += 1
  importPending.value = false
  playbackResetToken.value += 1
  activeTrajectory.value = null
  playbackFrame.value = null
  importError.value = ''
  importNotice.value = ''
  state.value = createInitialTableState()
  selectedBallId.value = null
  showIds.value = true
  isDirty.value = false
  isTopDown.value = false
  coordinateError.value = ''
  sceneRef.value?.resetView()
}

function toggleTopDown() {
  isTopDown.value = !isTopDown.value
  sceneRef.value?.setTopDownView(isTopDown.value)
}

function resetView() {
  isTopDown.value = false
  sceneRef.value?.resetView()
}

async function importStateFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  // Allow the user to select the same file again after fixing it.
  input.value = ''

  const generation = ++importGeneration
  importError.value = ''
  importNotice.value = ''
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    importError.value = '文件超过 1 MiB 限制，请选择较小的标准球局 JSON。'
    return
  }
  importPending.value = true

  try {
    const imported = parseTableStateJson(await file.text())
    if (generation !== importGeneration) return

    const { active_width_mm: width, active_length_mm: length } = state.value.table_geometry
    if (imported.table_geometry.active_width_mm !== width ||
      imported.table_geometry.active_length_mm !== length) {
      throw new Error(`当前工作台仅支持活动区域 ${length} × ${width} mm，请先完成其它尺寸的球桌标定。`)
    }

    const nextVersion = nextStateVersion(Math.max(state.value.state_version, imported.state_version))

    playbackResetToken.value += 1
    activeTrajectory.value = null
    playbackFrame.value = null
    state.value = { ...imported, state_version: nextVersion }
    selectedBallId.value = null
    coordinateError.value = ''
    isDirty.value = true
    importNotice.value = `已导入 ${file.name}，${imported.balls.length} 个检测目标；会话版本 v${nextVersion}。`
  } catch (error) {
    if (generation === importGeneration) {
      importError.value = error instanceof Error ? error.message : '无法读取球局文件。'
    }
  } finally {
    if (generation === importGeneration) importPending.value = false
  }
}

onBeforeUnmount(() => {
  importGeneration += 1
})
</script>

<template>
  <main class="studio-shell">
    <aside class="sidebar">
      <a class="brand" href="/" aria-label="Eightball AI 工作台首页">
        <span class="brand-mark">8</span>
        <span class="brand-copy">
          <strong>EIGHTBALL</strong>
          <small>AI LAB / TABLE STUDIO</small>
        </span>
      </a>

      <div class="sidebar-divider" />

      <p class="sidebar-label">WORKSPACE / 01</p>
      <div class="sidebar-nav-item sidebar-nav-item--active">
        <span class="nav-index">01</span>
        <span>球局工作台</span>
        <span class="nav-active-mark" />
      </div>
      <div class="sidebar-nav-item sidebar-nav-item--muted" aria-disabled="true">
        <span class="nav-index">02</span>
        <span>击球规划</span>
        <span class="nav-soon">待开发</span>
      </div>
      <div class="sidebar-nav-item sidebar-nav-item--muted" aria-disabled="true">
        <span class="nav-index">03</span>
        <span>轨迹回放</span>
        <span class="nav-soon">待开发</span>
      </div>

      <div class="sidebar-table-card">
        <span class="micro-label">ACTIVE PLAYING SURFACE</span>
        <strong>{{ state.table_geometry.active_length_mm }} <i>×</i> {{ state.table_geometry.active_width_mm }}</strong>
        <span class="unit-label">MILLIMETERS</span>
        <div class="table-diagram" aria-hidden="true">
          <span class="table-diagram-line" />
          <span class="table-diagram-pocket table-diagram-pocket--tl" />
          <span class="table-diagram-pocket table-diagram-pocket--tr" />
          <span class="table-diagram-pocket table-diagram-pocket--bl" />
          <span class="table-diagram-pocket table-diagram-pocket--br" />
          <span class="table-diagram-pocket table-diagram-pocket--ml" />
          <span class="table-diagram-pocket table-diagram-pocket--mr" />
        </div>
      </div>

      <div class="sidebar-note">
        <span class="status-dot" />
        <div>
          <strong>视觉输入已接入</strong>
          <p>首版标准状态 · v0.1.0</p>
        </div>
      </div>

      <div class="sidebar-footer">
        <span>ENGINE</span>
        <strong>VISION → TABLE STATE</strong>
        <small>PHYSICS / AI PLANNING NOT CONNECTED</small>
      </div>
    </aside>

    <section class="workspace">
      <header class="workspace-header">
        <div>
          <div class="breadcrumb"><span>WORKSPACE</span><span>/</span><span>TABLE MODEL</span></div>
          <h1>球局工作台<span class="title-period">.</span></h1>
          <p class="workspace-subtitle">将视觉坐标映射到三维球桌，检查位置并修正输入。</p>
        </div>
        <div class="header-badges">
          <ApiHealthBadge />
          <a class="header-badge" href="/roadmap" style="text-decoration: none;">开发看板</a>
          <span class="header-badge"><span class="status-dot" />LOCAL SESSION</span>
          <span class="version-badge">{{ isTrajectoryPlayback ? 'REPLAY · v' : 'STATE v' }}{{ displayState.state_version }}</span>
        </div>
      </header>

      <div class="studio-grid">
        <section class="viewport-panel">
          <div class="panel-heading">
            <div>
              <span class="micro-label">01 / 3D VIEWPORT</span>
              <h2>球桌模型</h2>
            </div>
            <span class="model-status" :class="'model-status--' + modelStatus">
              <span class="status-dot" />
              {{ modelStatusLabel }}
            </span>
          </div>

          <div class="viewport-stage">
            <PoolTableScene
              ref="sceneRef"
              :state="displayState"
              :selected-ball-id="isTrajectoryPlayback ? null : selectedBallId"
              :show-ids="showIds"
              @select-ball="handleSceneSelectBall"
              @model-status="onModelStatus"
            />
            <div class="viewport-corner-label">
              <span class="corner-label-index">TABLE / {{ state.table_id }}</span>
              <span>ACTIVE AREA</span>
            </div>
            <div class="viewport-instructions">
              <span><i class="gesture-icon gesture-icon--orbit" />拖拽旋转</span>
              <span><i class="gesture-icon gesture-icon--zoom" />滚轮缩放</span>
              <span><i class="gesture-icon gesture-icon--select" />点击球体查看 ID</span>
            </div>
          </div>

          <div class="viewport-toolbar">
            <div class="toolbar-group">
              <button class="tool-button" :class="{ 'tool-button--active': isTopDown }" type="button" @click="toggleTopDown">
                <span class="tool-button-icon">⌗</span>
                {{ isTopDown ? '切回 3D' : '俯视模式' }}
              </button>
              <button class="tool-button" type="button" @click="resetView">
                <span class="tool-button-icon">↻</span>
                重置视角
              </button>
            </div>
            <button class="tool-button tool-button--toggle" :class="{ 'tool-button--active': showIds }" type="button" :aria-pressed="showIds" @click="showIds = !showIds">
              <span class="toggle-indicator" />
              显示检测 ID
            </button>
          </div>
          <p class="calibration-note">
            <span class="note-symbol">i</span>
            模型尺寸沿用 GLB（米转毫米），不按活动区域自动缩放；球高按台面网格贴合，坐标朝向仍待标定。
          </p>
        </section>

        <aside class="inspector-panel">
          <div class="inspector-heading">
            <span class="micro-label">02 / STATE INSPECTOR</span>
            <h2>球局数据</h2>
            <p>{{ isTrajectoryPlayback ? '按记录时间戳展示轨迹帧；回放期间只读。' : '当前视觉帧转换后的标准状态。' }}</p>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <span>检测球数</span>
              <strong>{{ ballCount }}<small> / 16</small></strong>
            </div>
            <div class="stat-card">
              <span>状态版本</span>
              <strong><small>v</small>{{ displayState.state_version }}</strong>
            </div>
          </div>

          <div class="inspector-section inspector-section--import">
            <div class="section-heading">
              <h3>导入球局 JSON</h3>
              <span class="section-muted">M1 / LOCAL FILE</span>
            </div>
            <label class="import-file-label" for="table-state-file">选择标准球局状态文件</label>
            <input
              id="table-state-file"
              class="import-file-input"
              name="state-import"
              type="file"
              accept=".json,application/json"
              :disabled="importPending"
              aria-describedby="table-state-file-help"
              @change="importStateFile"
            />
            <p id="table-state-file-help" class="import-help">仅接受 v0.1.0 标准 TableState JSON，大小不超过 1 MiB；仅在本机浏览器读取，不上传到服务端。</p>
            <p v-if="importPending" class="import-feedback" role="status">正在读取并校验球局文件…</p>
            <p v-if="importNotice" class="import-feedback import-feedback--success" role="status">{{ importNotice }}</p>
            <p v-if="importError" class="import-feedback import-feedback--error" role="alert">{{ importError }}</p>
          </div>

          <TrajectoryPlaybackPanel
            :key="playbackResetToken"
            :expected-table-id="state.table_id"
            :expected-state-version="state.state_version"
            :expected-geometry="state.table_geometry"
            :reset-token="playbackResetToken"
            @trajectory-change="onTrajectoryChange"
            @frame-change="onPlaybackFrameChange"
          />

          <TableTopDownEditor
            :state="displayState"
            :selected-ball-id="isTrajectoryPlayback ? null : selectedBallId"
            :read-only="isTrajectoryPlayback"
            @select-ball="handleTopDownSelectBall"
            @move-ball="moveBall"
          />

          <div class="inspector-section">
            <div class="section-heading">
              <h3>球体检查</h3>
              <span v-if="selectedBall" class="selected-id">VISION ID {{ selectedBall.id }}</span>
              <span v-else class="section-muted">未选择</span>
            </div>

            <div v-if="isTrajectoryPlayback" class="trajectory-active-note" role="status">
              <strong>轨迹回放中 · 只读</strong>
              <p>当前坐标来自已加载轨迹帧。退出回放后返回当前球局状态，不会把轨迹帧写入原始状态。</p>
            </div>

            <div v-else-if="selectedBall" class="ball-editor">
              <div class="selected-ball-summary">
                <span class="selected-ball-dot" :style="{ '--ball-color': selectedBallColor }" />
                <div>
                  <strong>检测目标 #{{ selectedBall.id }}</strong>
                  <small>颜色仅用于区分视觉 ID</small>
                </div>
              </div>

              <form class="coordinate-form" @submit.prevent="applyCoordinateEdit">
                <label class="coordinate-field">
                  <span>X 坐标 <small>MM</small></span>
                  <input v-model="coordinateDraft.x" name="x" type="number" step="any" :min="-xLimit" :max="xLimit" inputmode="decimal" />
                </label>
                <label class="coordinate-field">
                  <span>Y 坐标 <small>MM</small></span>
                  <input v-model="coordinateDraft.y" name="y" type="number" step="any" :min="-yLimit" :max="yLimit" inputmode="decimal" />
                </label>
                <p class="coordinate-boundary">X：−{{ xLimit }} 至 {{ xLimit }} mm<br />Y：−{{ yLimit }} 至 {{ yLimit }} mm</p>
                <p v-if="coordinateError" class="coordinate-error" role="alert">{{ coordinateError }}</p>
                <button class="apply-button" type="submit">应用坐标 <span>↗</span></button>
              </form>
            </div>

            <div v-else class="selection-empty">
              <span class="selection-crosshair">＋</span>
              <strong>选择一个球体</strong>
              <p>在三维球桌中点击任意球体，查看或修正它的坐标。</p>
            </div>
          </div>

          <div class="inspector-section inspector-section--meta">
            <div class="section-heading">
              <h3>坐标系</h3>
              <span class="section-muted">PROVISIONAL</span>
            </div>
            <dl class="metadata-list">
              <div><dt>原点</dt><dd>台面中心</dd></div>
              <div><dt>X 轴</dt><dd>沿台面宽度</dd></div>
              <div><dt>Y 轴</dt><dd>沿台面长度</dd></div>
              <div><dt>单位</dt><dd>毫米 / mm</dd></div>
            </dl>
            <p class="metadata-warning">正方向、球半径与袋口几何仍待视觉标定确认。当前仅检查矩形边界，不校验球体重叠。</p>
          </div>

          <div class="inspector-footer">
            <div class="edit-state" :class="{ 'edit-state--dirty': isDirty }">
              <span class="status-dot" />
              <span>{{ isDirty ? '本地修改 · 未保存' : '原始样例 · 只读来源' }}</span>
            </div>
            <button class="reset-state-button" type="button" @click="resetState">恢复原始样例 <span>↺</span></button>
          </div>
        </aside>
      </div>

      <footer class="workspace-footer">
        <span>EIGHTBALL AI <i>·</i> VISION INPUT / V0.1.0</span>
        <span>预测与规划模块尚未连接</span>
      </footer>
    </section>
  </main>
</template>
