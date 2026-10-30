<script setup lang="ts">
import { computed, ref } from 'vue'

import roadmapSource from '@/data/roadmap.json'

type TaskStatus = 'done' | 'in_progress' | 'pending' | 'needs_review' | 'blocked'

interface RoadmapTask {
  id: string
  title: string
  status: TaskStatus
  updatedAt: string | null
  note?: string
  evidence?: string
  kind?: 'acceptance_gate'
}

interface Milestone {
  id: string
  title: string
  icon: string
  summary: string
  planDoc: string
  tasks: RoadmapTask[]
}

interface FocusItem {
  id: string
  milestoneId: string
  taskId: string
  title: string
  status: TaskStatus
  description: string
  nextAction: string
}

interface RoadmapData {
  project: string
  title: string
  subtitle: string
  branch: string
  updatedAt: string
  timezone: string
  progressRule: string
  milestones: Milestone[]
  focus: FocusItem[]
}

const roadmap = roadmapSource as unknown as RoadmapData
const expandedMilestones = ref<string[]>(['M1'])

const statusLabels: Record<TaskStatus, string> = {
  done: '已验收',
  in_progress: '进行中',
  pending: '待开始',
  needs_review: '待实测',
  blocked: '受阻',
}

const allTasks = computed(() => roadmap.milestones.flatMap((milestone) => milestone.tasks))

const stats = computed(() => {
  const tasks = allTasks.value
  const total = tasks.length
  const completed = tasks.filter((task) => task.status === 'done').length
  const inProgress = tasks.filter((task) => task.status === 'in_progress').length
  const needsReview = tasks.filter((task) => task.status === 'needs_review').length
  const blocked = tasks.filter((task) => task.status === 'blocked').length
  const pending = tasks.filter((task) => task.status === 'pending').length

  return {
    total,
    completed,
    inProgress,
    needsReview,
    blocked,
    pending,
    progress: total > 0 ? Math.round((completed / total) * 100) : 0,
  }
})

const milestoneCards = computed(() => roadmap.milestones.map((milestone) => {
  const completed = milestone.tasks.filter((task) => task.status === 'done').length
  const total = milestone.tasks.length
  let status: TaskStatus = 'pending'

  if (milestone.tasks.every((task) => task.status === 'done')) {
    status = 'done'
  } else if (milestone.tasks.some((task) => task.status === 'blocked')) {
    status = 'blocked'
  } else if (milestone.tasks.some((task) => task.status === 'in_progress')) {
    status = 'in_progress'
  } else if (milestone.tasks.some((task) => task.status === 'needs_review')) {
    status = 'needs_review'
  }

  return {
    ...milestone,
    completed,
    total,
    status,
    progress: total > 0 ? Math.round((completed / total) * 100) : 0,
  }
}))

function statusLabel(status: TaskStatus) {
  return statusLabels[status]
}

function toggleMilestone(milestoneId: string) {
  expandedMilestones.value = expandedMilestones.value.includes(milestoneId)
    ? expandedMilestones.value.filter((id) => id !== milestoneId)
    : [...expandedMilestones.value, milestoneId]
}

function isExpanded(milestoneId: string) {
  return expandedMilestones.value.includes(milestoneId)
}
</script>

<template>
  <main class="roadmap-page">
    <div class="roadmap-shell">
      <header class="roadmap-header" data-layout-region="fixed-header">
        <div class="roadmap-brand">
          <div class="roadmap-mark" aria-hidden="true">8</div>
          <div class="roadmap-title-block">
            <p class="roadmap-eyebrow">{{ roadmap.project }} / DEVELOPMENT ROADMAP</p>
            <h1>{{ roadmap.title }}</h1>
            <p class="roadmap-subtitle">{{ roadmap.subtitle }}</p>
          </div>
        </div>

        <div class="roadmap-summary">
          <article class="summary-card summary-card--progress" data-test="overall-progress">
            <div class="progress-ring" :style="{ '--progress': stats.progress + '%' }" role="img" :aria-label="'总进度 ' + stats.progress + '%'">
              <span>{{ stats.progress }}%</span>
            </div>
            <div class="summary-copy">
              <span>总进度</span>
              <strong>{{ stats.completed }} / {{ stats.total }}</strong>
              <small>按已验收任务计算</small>
            </div>
          </article>
          <article class="summary-card" data-test="completed-count">
            <span class="summary-symbol summary-symbol--done">✓</span>
            <div class="summary-copy">
              <span>已完成</span>
              <strong>{{ stats.completed }}</strong>
              <small>任务已验收</small>
            </div>
          </article>
          <article class="summary-card" data-test="attention-count">
            <span class="summary-symbol summary-symbol--review">!</span>
            <div class="summary-copy">
              <span>待实测 / 受阻</span>
              <strong>{{ stats.needsReview + stats.blocked }}</strong>
              <small>需补充证据或处理</small>
            </div>
          </article>
        </div>
      </header>

      <div class="roadmap-meta">
        <span><i class="meta-dot" />当前分支 <strong>{{ roadmap.branch }}</strong></span>
        <span>数据更新 {{ roadmap.updatedAt }} · {{ roadmap.timezone }}</span>
      </div>

      <div class="roadmap-layout" data-layout-region="scroll-content">
        <section class="milestones-column" aria-labelledby="milestones-title">
          <div class="column-heading">
            <div>
              <span class="section-kicker">ROADMAP / 01</span>
              <h2 id="milestones-title">研发里程碑</h2>
            </div>
            <span class="milestone-total">{{ milestoneCards.length }} 个阶段 · {{ stats.pending }} 项待开始</span>
          </div>

          <div class="milestone-stack" data-scroll-region="milestones">
            <article
              v-for="milestone in milestoneCards"
              :id="'milestone-' + milestone.id"
              :key="milestone.id"
              class="milestone-card"
              :class="[
                'milestone-card--' + milestone.status,
                { 'milestone-card--current': milestone.id === 'M1' },
              ]"
              data-test="milestone-card"
            >
              <button
                class="milestone-toggle"
                type="button"
                :data-test="'milestone-toggle-' + milestone.id"
                :aria-expanded="isExpanded(milestone.id)"
                @click="toggleMilestone(milestone.id)"
              >
                <span class="milestone-icon" aria-hidden="true">{{ milestone.icon }}</span>
                <span class="milestone-heading">
                  <span class="milestone-title-line">
                    <strong>{{ milestone.id }}</strong>
                    <b>{{ milestone.title }}</b>
                    <span class="milestone-status" :class="'status-pill--' + milestone.status">{{ statusLabel(milestone.status) }}</span>
                  </span>
                  <small>{{ milestone.summary }}</small>
                </span>
                <span class="milestone-progress">
                  <strong>{{ milestone.completed }} / {{ milestone.total }}</strong>
                  <span class="progress-track"><i :style="{ width: milestone.progress + '%' }" /></span>
                  <b>{{ milestone.progress }}%</b>
                </span>
                <span class="milestone-chevron" :class="{ 'milestone-chevron--open': isExpanded(milestone.id) }" aria-hidden="true">⌄</span>
              </button>

              <div v-if="isExpanded(milestone.id)" class="task-list" :id="'tasks-' + milestone.id">
                <div
                  v-for="task in milestone.tasks"
                  :id="'task-' + task.id"
                  :key="task.id"
                  class="task-row"
                  :class="{ 'task-row--gate': task.kind === 'acceptance_gate' }"
                >
                  <span class="task-indicator" :class="'task-indicator--' + task.status" aria-hidden="true">
                    {{ task.status === 'done' ? '✓' : task.status === 'blocked' ? '×' : task.status === 'needs_review' ? '!' : task.status === 'in_progress' ? '●' : '○' }}
                  </span>
                  <span class="task-copy">
                    <strong>{{ task.title }}</strong>
                    <small v-if="task.note">{{ task.note }}</small>
                    <small v-if="task.evidence" class="task-evidence">记录：{{ task.evidence }}</small>
                  </span>
                  <span class="task-status" :class="'status-pill--' + task.status">{{ statusLabel(task.status) }}</span>
                  <time class="task-date">{{ task.updatedAt || '—' }}</time>
                </div>
                <div class="milestone-source">规划依据：{{ milestone.planDoc }}</div>
              </div>
            </article>
          </div>
        </section>

        <aside class="roadmap-sidebar">
          <section class="focus-panel" data-scroll-region="focus" aria-labelledby="focus-title">
            <div class="sidebar-heading">
              <span class="focus-target" aria-hidden="true">◎</span>
              <div>
                <span class="section-kicker">NEXT ACTIONS</span>
                <h2 id="focus-title">当前关注</h2>
              </div>
            </div>

            <a
              v-for="(item, index) in roadmap.focus"
              :key="item.id"
              class="focus-item"
              :href="'#milestone-' + item.milestoneId"
            >
              <span class="focus-number">{{ index + 1 }}</span>
              <span class="focus-copy">
                <strong>{{ item.title }}</strong>
                <small>{{ item.description }}</small>
                <em>{{ item.nextAction }}</em>
              </span>
              <span class="focus-status" :class="'status-pill--' + item.status">{{ statusLabel(item.status) }}</span>
            </a>
          </section>

          <section class="eightball-panel" aria-label="Eightball AI 项目主题">
            <div class="eightball-orbit" aria-hidden="true">
              <div class="eightball-shadow" />
              <div class="eightball">
                <span>8</span>
              </div>
            </div>
            <p>用代码还原台球的<br />物理之美。</p>
            <span class="eightball-caption">GEOMETRY · PHYSICS · DECISION</span>
            <i class="eightball-streak" aria-hidden="true" />
          </section>

          <section class="legend-panel" aria-label="状态说明">
            <span class="section-kicker">STATUS GUIDE</span>
            <div><i class="legend-dot legend-dot--done" />已验收</div>
            <div><i class="legend-dot legend-dot--progress" />进行中</div>
            <div><i class="legend-dot legend-dot--review" />待实测</div>
            <div><i class="legend-dot legend-dot--pending" />待开始</div>
          </section>
        </aside>
      </div>

      <footer class="roadmap-footer">
        <span>数据源：apps/web/src/data/roadmap.json</span>
        <span>{{ roadmap.progressRule }}</span>
        <a href="/">返回球局工作台 ↗</a>
      </footer>
    </div>
  </main>
</template>

<style scoped>
.roadmap-page {
  --roadmap-bg: #080d16;
  --roadmap-panel: #0d1521;
  --roadmap-panel-raised: #101b2a;
  --roadmap-border: rgba(130, 166, 207, 0.16);
  --roadmap-border-strong: rgba(72, 164, 255, 0.72);
  --roadmap-text: #e9f0fb;
  --roadmap-muted: #8497af;
  --roadmap-blue: #36a9ff;
  --roadmap-green: #31d89b;
  min-height: 100vh;
  padding: 26px 28px 22px;
  color: var(--roadmap-text);
  background:
    radial-gradient(ellipse at 58% -12%, rgba(30, 108, 191, 0.16), transparent 40%),
    radial-gradient(ellipse at 100% 68%, rgba(16, 91, 125, 0.12), transparent 30%),
    var(--roadmap-bg);
}

.roadmap-shell {
  width: min(100%, 1580px);
  margin: 0 auto;
}

.roadmap-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 26px;
  margin-bottom: 13px;
}

.roadmap-brand {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 280px;
}

.roadmap-mark {
  display: grid;
  width: 54px;
  height: 54px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(63, 166, 255, 0.44);
  border-radius: 15px;
  color: #d9efff;
  background: linear-gradient(145deg, rgba(35, 143, 241, 0.28), rgba(35, 143, 241, 0.04));
  box-shadow: inset 0 0 24px rgba(53, 159, 255, 0.1), 0 0 24px rgba(53, 159, 255, 0.08);
  font-size: 28px;
  font-weight: 800;
}

.roadmap-title-block { min-width: 0; }
.roadmap-eyebrow, .section-kicker {
  margin: 0;
  color: #6f88a8;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.17em;
}
.roadmap-title-block h1 {
  margin: 4px 0 3px;
  color: #f1f6ff;
  font-size: clamp(25px, 2.4vw, 34px);
  font-weight: 720;
  letter-spacing: -0.055em;
}
.roadmap-subtitle { margin: 0; color: #8fa2bb; font-size: 12px; }

.roadmap-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(118px, 1fr));
  gap: 9px;
  width: min(100%, 520px);
}
.summary-card {
  display: flex;
  min-height: 66px;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--roadmap-border);
  border-radius: 11px;
  background: linear-gradient(145deg, rgba(17, 29, 45, 0.92), rgba(11, 19, 31, 0.96));
}
.progress-ring {
  position: relative;
  display: grid;
  width: 43px;
  height: 43px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: conic-gradient(var(--roadmap-blue) var(--progress), #1a2a40 0);
}
.progress-ring::before {
  position: absolute;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #101b2a;
  content: "";
}
.progress-ring span { position: relative; z-index: 1; color: #edf7ff; font-size: 10px; font-weight: 800; }
.summary-symbol {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  font-size: 18px;
  font-weight: 800;
}
.summary-symbol--done { color: #55edba; background: rgba(39, 206, 148, 0.16); }
.summary-symbol--review { color: #ffc56c; background: rgba(255, 181, 65, 0.15); }
.summary-copy { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
.summary-copy > span { color: #91a4bd; font-size: 10px; }
.summary-copy strong { color: #f0f6ff; font-size: 20px; line-height: 1.1; font-variant-numeric: tabular-nums; }
.summary-copy small { color: #627a96; font-size: 8px; white-space: nowrap; }

.roadmap-meta {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin: 0 0 16px;
  padding: 0 2px 12px;
  border-bottom: 1px solid var(--roadmap-border);
  color: #657b97;
  font-size: 9px;
}
.roadmap-meta > span { display: inline-flex; align-items: center; gap: 7px; min-width: 0; }
.roadmap-meta strong { overflow: hidden; color: #8ea5c1; font-weight: 600; text-overflow: ellipsis; }
.meta-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--roadmap-green); box-shadow: 0 0 9px rgba(49, 216, 155, 0.55); }

.roadmap-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 292px;
  gap: 16px;
  align-items: start;
}
.milestones-column, .roadmap-sidebar { min-width: 0; }
.column-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
  margin: 0 3px 10px;
}
.column-heading h2, .sidebar-heading h2 {
  margin: 3px 0 0;
  color: #eaf2fd;
  font-size: 16px;
  font-weight: 680;
}
.milestone-total { color: #7086a2; font-size: 10px; }
.milestone-stack { display: grid; gap: 9px; }

.milestone-card {
  overflow: hidden;
  border: 1px solid var(--roadmap-border);
  border-radius: 12px;
  background: linear-gradient(145deg, rgba(15, 24, 38, 0.97), rgba(10, 17, 28, 0.98));
  box-shadow: 0 9px 24px rgba(0, 0, 0, 0.12);
}
.milestone-card--current {
  border-color: var(--roadmap-border-strong);
  box-shadow: 0 0 0 1px rgba(54, 169, 255, 0.1), 0 0 24px rgba(38, 145, 240, 0.12);
}
.milestone-toggle {
  display: grid;
  width: 100%;
  grid-template-columns: 35px minmax(0, 1fr) minmax(145px, 190px) 16px;
  align-items: center;
  gap: 11px;
  padding: 12px 14px;
  border: 0;
  color: inherit;
  text-align: left;
  background: transparent;
  cursor: pointer;
}
.milestone-toggle:hover { background: rgba(61, 143, 221, 0.055); }
.milestone-icon {
  display: grid;
  width: 33px;
  height: 33px;
  place-items: center;
  border: 1px solid rgba(56, 164, 255, 0.26);
  border-radius: 9px;
  color: #43b4ff;
  background: rgba(31, 130, 215, 0.1);
  font-size: 19px;
}
.milestone-heading { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.milestone-title-line { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.milestone-title-line > strong { color: #73baff; font-size: 14px; }
.milestone-title-line > b { color: #e8f0fb; font-size: 13px; font-weight: 680; }
.milestone-heading > small { overflow: hidden; color: #8296b0; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.milestone-progress { display: grid; grid-template-columns: 42px minmax(40px, 1fr) 31px; align-items: center; gap: 8px; }
.milestone-progress > strong { color: #c6d7eb; font-size: 10px; text-align: right; font-variant-numeric: tabular-nums; }
.milestone-progress > b { color: #60c5ff; font-size: 9px; text-align: right; }
.progress-track { height: 7px; overflow: hidden; border-radius: 99px; background: #1b2a3d; }
.progress-track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #218cf2, #48c3ff); box-shadow: 0 0 12px rgba(51, 165, 255, 0.38); }
.milestone-card--done .progress-track i { background: linear-gradient(90deg, #1fbd8a, #4ce7b2); }
.milestone-chevron { color: #6c85a2; font-size: 17px; text-align: center; transition: transform 160ms ease; }
.milestone-chevron--open { transform: rotate(180deg); }

.milestone-status, .task-status, .focus-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 17px;
  padding: 1px 7px;
  border: 1px solid transparent;
  border-radius: 5px;
  font-size: 8px;
  font-weight: 700;
  white-space: nowrap;
}
.status-pill--done { border-color: rgba(48, 218, 157, 0.25); color: #4ee6b1; background: rgba(35, 192, 137, 0.1); }
.status-pill--in_progress { border-color: rgba(54, 169, 255, 0.3); color: #5ebaff; background: rgba(54, 169, 255, 0.1); }
.status-pill--needs_review { border-color: rgba(245, 184, 91, 0.28); color: #f3bd6e; background: rgba(245, 184, 91, 0.1); }
.status-pill--pending { border-color: rgba(126, 151, 181, 0.2); color: #8ba0ba; background: rgba(126, 151, 181, 0.07); }
.status-pill--blocked { border-color: rgba(247, 111, 111, 0.28); color: #ff8989; background: rgba(247, 111, 111, 0.1); }

.task-list { padding: 0 14px 10px 59px; }
.task-row {
  display: grid;
  grid-template-columns: 17px minmax(0, 1fr) 62px 82px;
  align-items: start;
  gap: 9px;
  padding: 8px 2px;
  border-top: 1px solid rgba(128, 158, 191, 0.09);
}
.task-row--gate { margin: 5px -5px 0; padding: 10px 7px; border: 1px solid rgba(245, 184, 91, 0.18); border-radius: 8px; background: rgba(245, 184, 91, 0.035); }
.task-indicator {
  display: grid;
  width: 16px;
  height: 16px;
  margin-top: 1px;
  place-items: center;
  border: 1px solid #536984;
  border-radius: 50%;
  color: #8094ae;
  font-size: 10px;
  line-height: 1;
}
.task-indicator--done { border-color: #31d89b; color: #071a15; background: #31d89b; font-weight: 900; }
.task-indicator--in_progress { border-color: #36a9ff; color: #36a9ff; background: rgba(54, 169, 255, 0.12); }
.task-indicator--needs_review { border-color: #eeb65e; color: #eeb65e; }
.task-indicator--blocked { border-color: #f17c7c; color: #f17c7c; }
.task-copy { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.task-copy strong { color: #cbd8e8; font-size: 10px; font-weight: 570; line-height: 1.45; }
.task-copy small { color: #758ba6; font-size: 9px; line-height: 1.5; }
.task-copy .task-evidence { color: #566f8b; font-size: 8px; overflow-wrap: anywhere; }
.task-date { padding-top: 2px; color: #617894; font-size: 8px; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.milestone-source { padding: 8px 0 1px; color: #536b86; font-size: 8px; }

.roadmap-sidebar { display: grid; gap: 12px; }
.focus-panel, .legend-panel, .eightball-panel {
  overflow: hidden;
  border: 1px solid var(--roadmap-border);
  border-radius: 12px;
  background: linear-gradient(150deg, rgba(15, 25, 40, 0.97), rgba(9, 16, 27, 0.98));
}
.focus-panel { padding: 14px 13px 5px; }
.sidebar-heading { display: flex; align-items: center; gap: 10px; padding: 0 2px 12px; }
.focus-target { color: #40b4ff; font-size: 24px; line-height: 1; }
.sidebar-heading h2 { font-size: 14px; }
.focus-item {
  display: grid;
  grid-template-columns: 25px minmax(0, 1fr);
  gap: 9px;
  padding: 12px 2px;
  border-top: 1px solid rgba(128, 158, 191, 0.1);
  color: inherit;
  text-decoration: none;
}
.focus-item:hover .focus-copy strong { color: #65c4ff; }
.focus-number {
  display: grid;
  width: 23px;
  height: 23px;
  place-items: center;
  border-radius: 50%;
  color: #f2f8ff;
  background: linear-gradient(145deg, #268df1, #145bc9);
  box-shadow: 0 3px 10px rgba(20, 104, 222, 0.28);
  font-size: 10px;
  font-weight: 800;
}
.focus-copy { display: flex; min-width: 0; flex-direction: column; gap: 5px; }
.focus-copy strong { color: #d9e6f5; font-size: 10px; font-weight: 700; }
.focus-copy small { color: #8297b1; font-size: 9px; line-height: 1.55; }
.focus-copy em { color: #5f7894; font-size: 8px; font-style: normal; line-height: 1.45; }
.focus-status { grid-column: 2; justify-self: start; margin-top: -1px; }

.eightball-panel {
  position: relative;
  display: flex;
  min-height: 286px;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 14px 12px 16px;
  background:
    radial-gradient(ellipse at 50% 80%, rgba(20, 102, 156, 0.22), transparent 54%),
    linear-gradient(160deg, #101d2c, #08111d 80%);
}
.eightball-orbit { position: relative; display: grid; width: 100%; height: 180px; place-items: center; }
.eightball-shadow {
  position: absolute;
  bottom: 12px;
  width: 175px;
  height: 24px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.72);
  filter: blur(13px);
}
.eightball {
  position: relative;
  display: grid;
  width: 166px;
  height: 166px;
  place-items: center;
  border: 1px solid rgba(190, 216, 244, 0.28);
  border-radius: 50%;
  background:
    radial-gradient(circle at 29% 21%, rgba(255,255,255,.74) 0, rgba(182,202,222,.28) 4%, transparent 17%),
    radial-gradient(circle at 35% 29%, #3c4b5e 0, #101a28 34%, #03070d 62%, #17283a 82%, #010308 100%);
  box-shadow: inset -13px -17px 28px rgba(0,0,0,.92), inset 7px 7px 18px rgba(179,211,242,.15), 0 14px 32px rgba(0,0,0,.55), 0 0 36px rgba(34,137,214,.1);
  transform: rotate(-12deg);
}
.eightball::before {
  position: absolute;
  top: 51px;
  left: 51px;
  display: grid;
  width: 64px;
  height: 64px;
  place-items: center;
  border: 1px solid rgba(12, 20, 29, 0.18);
  border-radius: 50%;
  color: #111a26;
  background: radial-gradient(circle at 35% 28%, #fff, #dce4ed 75%);
  box-shadow: 0 2px 7px rgba(0,0,0,.35);
  content: "";
}
.eightball span { position: relative; z-index: 1; margin-top: 1px; color: #111a26; font-size: 39px; font-weight: 850; }
.eightball-panel p {
  margin: -3px 0 8px;
  color: #d4dfed;
  font-family: Georgia, "Songti SC", serif;
  font-size: 17px;
  line-height: 1.55;
  letter-spacing: .13em;
  text-align: center;
}
.eightball-caption { color: #637c99; font-size: 7px; font-weight: 750; letter-spacing: .18em; }
.eightball-streak { position: absolute; right: 42px; bottom: 57px; width: 42px; height: 1px; background: #46a9e8; transform: rotate(-21deg); }

.legend-panel { display: grid; grid-template-columns: 1fr 1fr; gap: 9px 12px; padding: 13px; }
.legend-panel > .section-kicker { grid-column: 1 / -1; margin-bottom: 2px; }
.legend-panel > div { display: flex; align-items: center; gap: 7px; color: #8da1ba; font-size: 9px; }
.legend-dot { width: 7px; height: 7px; border-radius: 50%; }
.legend-dot--done { background: var(--roadmap-green); }
.legend-dot--progress { background: var(--roadmap-blue); }
.legend-dot--review { background: #eeb65e; }
.legend-dot--pending { border: 1px solid #8298b2; }

.roadmap-footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 15px;
  margin-top: 15px;
  padding: 11px 3px 0;
  border-top: 1px solid var(--roadmap-border);
  color: #617894;
  font-size: 8px;
  line-height: 1.5;
}
.roadmap-footer > span:nth-child(2) { max-width: 620px; }
.roadmap-footer a { flex: 0 0 auto; color: #69bfff; text-decoration: none; }
.roadmap-footer a:hover { color: #a4dcff; }

@media (max-width: 1120px) {
  .roadmap-page { padding: 20px; }
  .roadmap-header { align-items: flex-start; flex-direction: column; }
  .roadmap-summary { width: min(100%, 620px); }
  .roadmap-layout { grid-template-columns: minmax(0, 1fr) 270px; }
  .milestone-toggle { grid-template-columns: 32px minmax(0, 1fr) 145px 14px; gap: 8px; padding-inline: 11px; }
  .task-list { padding-left: 52px; }
}

@media (max-width: 820px) {
  .roadmap-layout { grid-template-columns: 1fr; }
  .roadmap-sidebar { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
  .focus-panel { grid-row: span 2; }
}

@media (max-width: 620px) {
  .roadmap-page { padding: 16px 12px; }
  .roadmap-brand { align-items: flex-start; }
  .roadmap-mark { width: 42px; height: 42px; border-radius: 11px; font-size: 22px; }
  .roadmap-summary { grid-template-columns: 1fr; }
  .roadmap-meta, .roadmap-footer { flex-direction: column; }
  .milestone-toggle { grid-template-columns: 30px minmax(0, 1fr) 14px; }
  .milestone-progress { grid-column: 2; grid-row: 2; width: 100%; }
  .milestone-chevron { grid-column: 3; grid-row: 1; }
  .milestone-heading > small { white-space: normal; }
  .task-list { padding: 0 10px 10px; }
  .task-row { grid-template-columns: 17px minmax(0, 1fr) 62px; }
  .task-date { grid-column: 2; text-align: left; }
  .roadmap-sidebar { grid-template-columns: 1fr; }
  .focus-panel { grid-row: auto; }
}

/* M0 dashboard viewport layout: fixed header, independent content scrollers. */
.roadmap-page {
  display: flex;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}

.roadmap-shell {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.roadmap-header,
.roadmap-meta,
.roadmap-footer {
  flex: 0 0 auto;
}

.roadmap-layout {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  align-items: stretch;
  grid-template-rows: minmax(0, 1fr);
}

.milestones-column {
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.column-heading {
  flex: 0 0 auto;
}

.milestone-stack {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  align-items: stretch;
  gap: 9px;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: 6px;
  overscroll-behavior: contain;
  scrollbar-color: rgba(83, 137, 190, 0.48) rgba(18, 31, 47, 0.5);
  scrollbar-width: thin;
}

.milestone-card {
  flex: 0 0 auto;
  width: 100%;
}

.milestone-toggle {
  position: relative;
  z-index: 1;
  min-height: 58px;
}

.milestone-stack::-webkit-scrollbar,
.focus-panel::-webkit-scrollbar {
  width: 6px;
}

.milestone-stack::-webkit-scrollbar-track,
.focus-panel::-webkit-scrollbar-track {
  border-radius: 99px;
  background: rgba(18, 31, 47, 0.5);
}

.milestone-stack::-webkit-scrollbar-thumb,
.focus-panel::-webkit-scrollbar-thumb {
  border: 1px solid rgba(8, 13, 22, 0.7);
  border-radius: 99px;
  background: rgba(83, 137, 190, 0.48);
}

.roadmap-sidebar {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.focus-panel {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-color: rgba(83, 137, 190, 0.48) rgba(18, 31, 47, 0.5);
  scrollbar-width: thin;
}

.sidebar-heading {
  position: sticky;
  z-index: 2;
  top: -14px;
  margin: -14px -13px 0;
  padding: 14px 13px 12px;
  background: linear-gradient(150deg, #0f1928, #0d1725);
}

.eightball-panel {
  flex: 0 0 clamp(150px, 24vh, 230px);
  min-height: 0;
}

.eightball-orbit {
  flex: 1 1 auto;
  height: clamp(72px, 16vh, 150px);
  min-height: 0;
}

.eightball {
  width: clamp(76px, 16vh, 146px);
  height: clamp(76px, 16vh, 146px);
}

.eightball::before {
  top: 30.5%;
  left: 30.5%;
  width: 39%;
  height: 39%;
}

.eightball span {
  font-size: clamp(24px, 4vh, 39px);
}

.eightball-panel p {
  margin: 0 0 4px;
  font-size: clamp(12px, 2vh, 17px);
}

.eightball-caption {
  font-size: 6px;
}

.eightball-streak {
  bottom: 42px;
}

.roadmap-footer {
  max-height: 36px;
  overflow: hidden;
  align-items: center;
  margin-top: 8px;
  padding-top: 7px;
}

.roadmap-footer > span:nth-child(2) {
  display: none;
}

.milestone-chevron {
  display: grid;
  align-self: center;
  justify-self: center;
  width: 16px;
  height: 28px;
  min-height: 28px;
  place-items: center;
  line-height: 1;
}

@media (max-width: 1120px) {
  .roadmap-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .roadmap-summary {
    width: min(100%, 620px);
  }
}

@media (max-width: 820px) {
  .roadmap-layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) minmax(135px, 30%);
  }

  .roadmap-sidebar {
    display: flex;
    min-height: 0;
  }

  .focus-panel {
    min-height: 0;
  }

  .eightball-panel,
  .legend-panel {
    display: none;
  }
}

@media (max-width: 620px) {
  .roadmap-page {
    padding: 12px 10px;
  }

  .roadmap-header {
    gap: 9px;
  }

  .roadmap-brand {
    min-width: 0;
    gap: 9px;
    align-items: center;
  }

  .roadmap-mark {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    font-size: 20px;
  }

  .roadmap-title-block h1 {
    font-size: 21px;
  }

  .roadmap-summary {
    width: 100%;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 5px;
  }

  .summary-card {
    min-width: 0;
    min-height: 48px;
    gap: 5px;
    padding: 6px;
  }

  .progress-ring {
    width: 28px;
    height: 28px;
  }

  .progress-ring::before {
    width: 22px;
    height: 22px;
  }

  .summary-symbol {
    width: 25px;
    height: 25px;
    font-size: 14px;
  }

  .summary-copy > span {
    font-size: 8px;
  }

  .summary-copy strong {
    font-size: 13px;
  }

  .summary-copy small {
    display: none;
  }

  .roadmap-meta {
    gap: 5px;
    margin-bottom: 8px;
    padding-bottom: 8px;
    font-size: 8px;
  }

  .roadmap-layout {
    grid-template-rows: minmax(0, 1fr) minmax(125px, 29%);
    gap: 8px;
  }

  .column-heading {
    margin-bottom: 6px;
  }

  .milestone-toggle {
    grid-template-columns: 30px minmax(0, 1fr) 14px;
  }

  .milestone-progress {
    grid-column: 2;
    grid-row: 2;
    width: 100%;
  }

  .milestone-chevron {
    grid-column: 3;
    grid-row: 1;
  }

  .milestone-heading > small {
    white-space: normal;
  }

  .task-list {
    padding: 0 10px 10px;
  }

  .task-row {
    grid-template-columns: 17px minmax(0, 1fr) 62px;
  }

  .task-date {
    grid-column: 2;
    text-align: left;
  }
}

</style>
